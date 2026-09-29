-- Brain v3 · F0 — one risk Brain, in the database, for every transaction.
-- Applied as migration `brain_f0_risk_in_db`. Kept here as the reference copy.
-- Design: docs/brain-v3.md. No AI, no trained model: rules, counts, fixed
-- thresholds from rule_definitions.
--
-- Before:
--   · The risk rules (rule_definitions) ran in the browser (brain.service.ts)
--     and in a copy inside create-transaction; the caller then WROTE
--     risk_status itself, so a signed-in user could send 'green'.
--   · Plaid lines were inserted with risk_status 'green' and CSV lines with
--     the default: bank money -- most of it -- was never checked.
--   · The rules themselves misfired on bank data:
--       new_counterparty compared the REFERENCE (a Plaid id is unique, so
--         every bank line was a "first-time payee");
--       velocity_check counted inserts in the last hour, so a 30-line bank
--         sync turned everything after the 20th red;
--       dup_check needed the same reference, so it never saw the real
--         duplicate: typed by hand, then imported from the bank;
--       threshold_check (an APPROVAL limit) turned large deposits red.
--
-- Now:
--   · trg_00_evaluate_risk (BEFORE INSERT, runs before trg_0_derive_semaphore)
--     evaluates every new transaction or version, whoever inserts it, and
--     OVERWRITES risk_status / status_reason. trg_evaluate_risk_log (AFTER
--     INSERT) writes the evaluation to rule_evaluations. Both run as the
--     table owner; the app can no longer write rule_evaluations.
--   · Rules, same ids and config keys, org rules override global ones:
--       dup_check        same amount, and the same non-empty reference, or the
--                        same merchant within the window when the two came
--                        from different sources (or both were typed by hand)
--       threshold_check  money OUT above default_limit
--       velocity_check   hand-typed lines by the same person in the last hour
--       new_counterparty money out to a merchant not seen in lookback_days
--       missing_document money out >= min_amount with no receipt
--       budget_variance  public.check_budget_variance (unchanged)
--     A rule that errors is recorded (errored: true) and never fires.
--     Resolution is unchanged: critical -> red, review -> amber, else green.

-- ── Config value as a number (a mistyped string must not break a rule) ─────

create or replace function lp_private.cfg_num(p_cfg jsonb, p_key text, p_default numeric)
returns numeric
language sql immutable
as $$
  select case
           when jsonb_typeof(p_cfg -> p_key) = 'number' then (p_cfg ->> p_key)::numeric
           when jsonb_typeof(p_cfg -> p_key) = 'string'
                and (p_cfg ->> p_key) ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then trim(p_cfg ->> p_key)::numeric
           else p_default
         end
$$;

-- ── The evaluation ──────────────────────────────────────────────────────────

create or replace function lp_private.evaluate_risk(t public.transactions)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_key      text := lp_private.merchant_key(coalesce(t.merchant_name, t.description));
  v_name     text := coalesce(nullif(t.merchant_name, ''), nullif(t.description, ''), 'this payee');
  v_out      boolean := t.amount < 0;
  v_fired    boolean;
  v_score    numeric;
  v_reason   text;
  v_n        numeric;
  v_m        numeric;
  v_date     date;
  v_budget   jsonb;
  v_rules    jsonb := '[]'::jsonb;
  v_best     jsonb;
  v_best_rank int := 0;
  v_rank     int;
begin
  for r in
    select * from (
      select distinct on (d.rule_id) d.*
        from public.rule_definitions d
       where d.org_id = t.org_id or d.org_id is null
       order by d.rule_id, (d.org_id is null)   -- the org's own version first
    ) eff
    where eff.is_active
    order by eff.priority
  loop
    v_fired := false; v_score := 0; v_reason := null;
    begin
      case r.rule_id

      when 'dup_check' then
        v_n := greatest(1, ceil(lp_private.cfg_num(r.config, 'window_hours', 48) / 24.0));
        select o.transaction_date into v_date
          from public.transactions o
         where o.org_id = t.org_id
           and o.client_id is not distinct from t.client_id
           and o.is_current
           and o.transaction_group_id <> t.transaction_group_id
           and o.amount = t.amount
           and (
                 (coalesce(t.reference, '') <> '' and o.reference = t.reference)
              or (v_key <> ''
                  and abs(o.transaction_date - t.transaction_date) <= v_n
                  and (o.source <> t.source or t.source = 'manual')
                  and lp_private.merchant_key(coalesce(o.merchant_name, o.description)) = v_key)
               )
         limit 1;
        if found then
          v_fired := true; v_score := 0.95;
          v_reason := format('Possible duplicate of the %s transaction of %s on %s',
                             v_name, abs(t.amount), v_date);
        end if;

      when 'threshold_check' then
        v_n := lp_private.cfg_num(r.config, 'default_limit', 5000);
        if v_out and abs(t.amount) > v_n then
          v_fired := true; v_score := least(abs(t.amount) / v_n / 2, 1);
          v_reason := format('Amount %s exceeds the approval limit %s', abs(t.amount), v_n);
        end if;

      when 'velocity_check' then
        if t.source = 'manual' then
          v_n := lp_private.cfg_num(r.config, 'max_tx_per_hour', 20);
          select count(*) into v_m
            from public.transactions o
           where o.org_id = t.org_id
             and o.client_id is not distinct from t.client_id
             and o.is_current
             and o.source = 'manual'
             and o.created_by = t.created_by
             and o.transaction_group_id <> t.transaction_group_id
             and o.created_at >= now() - interval '1 hour';
          if v_m >= v_n then
            v_fired := true; v_score := 0.85;
            v_reason := format('%s transactions typed in the last hour (limit %s)', v_m, v_n);
          end if;
        end if;

      when 'new_counterparty' then
        if v_out and v_key <> '' then
          v_n := lp_private.cfg_num(r.config, 'lookback_days', 90);
          if not exists (
            select 1 from public.transactions o
             where o.org_id = t.org_id
               and o.client_id is not distinct from t.client_id
               and o.is_current
               and o.transaction_group_id <> t.transaction_group_id
               and o.transaction_date between t.transaction_date - v_n::int and t.transaction_date
               and lp_private.merchant_key(coalesce(o.merchant_name, o.description)) = v_key
          ) then
            v_fired := true; v_score := 0.6;
            v_reason := format('First payment to %s in %s days', v_name, v_n);
          end if;
        end if;

      when 'missing_document' then
        v_n := lp_private.cfg_num(r.config, 'min_amount', 75);
        if v_out and abs(t.amount) >= v_n
           and not (coalesce(t.metadata, '{}'::jsonb) ? 'document_url')
           and not lp_private.transaction_has_receipt(t.transaction_group_id) then
          v_fired := true; v_score := 0.7;
          v_reason := 'No supporting document attached to this transaction';
        end if;

      when 'budget_variance' then
        v_budget := public.check_budget_variance(
          t.org_id, t.client_id, t.amount, lp_private.cfg_num(r.config, 'variance_pct', 10));
        if coalesce((v_budget ->> 'fired')::boolean, false) then
          v_fired := true; v_score := 0.6;
          v_reason := v_budget ->> 'reason';
        end if;

      else
        null;   -- a rule this engine doesn't know never fires
      end case;

      v_rules := v_rules || jsonb_build_object(
        'id', r.rule_id, 'name', r.name, 'severity', r.severity,
        'score', v_score, 'fired', v_fired, 'reason', v_reason);
    exception when others then
      v_fired := false;
      v_rules := v_rules || jsonb_build_object(
        'id', r.rule_id, 'name', r.name, 'severity', r.severity,
        'score', 0, 'fired', false, 'errored', true, 'reason', 'Rule error: ' || sqlerrm);
    end;

    if v_fired then
      v_rank := case r.severity::text when 'critical' then 3 when 'review' then 2 when 'info' then 1 else 0 end;
      if v_rank > v_best_rank
         or (v_rank = v_best_rank and v_score > coalesce((v_best ->> 'score')::numeric, -1)) then
        v_best_rank := v_rank;
        v_best := jsonb_build_object('id', r.rule_id, 'score', v_score, 'reason', v_reason);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'final_status',    case v_best_rank when 3 then 'red' when 2 then 'amber' else 'green' end,
    'rule_triggered',  v_best ->> 'id',
    'rule_score',      (v_best ->> 'score')::numeric,
    'explanation',     v_best ->> 'reason',
    'evaluated_rules', v_rules,
    'engine_version',  'db-1');
end;
$$;

-- ── Before insert: the verdict (overwrites whatever the caller sent) ───────

create or replace function lp_private.trg_evaluate_risk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  -- trg_default_transaction_group_id sorts after this trigger; the group is
  -- needed now to tell this transaction's own versions from other ones.
  if new.transaction_group_id is null then
    new.transaction_group_id := gen_random_uuid();
  end if;
  v := lp_private.evaluate_risk(new);
  new.risk_status   := (v ->> 'final_status')::public.semaphore_status;
  new.status_reason := v ->> 'explanation';
  -- Handed to the AFTER trigger (rule_evaluations references the row).
  perform set_config('lp.risk_' || replace(new.id::text, '-', ''), v::text, true);
  return new;
end;
$$;

create or replace function lp_private.trg_evaluate_risk_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := nullif(current_setting('lp.risk_' || replace(new.id::text, '-', ''), true), '')::jsonb;
begin
  if v is null then
    return null;
  end if;
  insert into public.rule_evaluations (
    transaction_id, transaction_version, client_id, final_status, rule_triggered,
    rule_score, explanation, evaluated_rules, engine_version
  ) values (
    new.id, new.version, new.client_id, (v ->> 'final_status')::public.semaphore_status,
    v ->> 'rule_triggered', (v ->> 'rule_score')::numeric, v ->> 'explanation',
    v -> 'evaluated_rules', v ->> 'engine_version');
  return null;
end;
$$;

drop trigger if exists trg_00_evaluate_risk on public.transactions;
create trigger trg_00_evaluate_risk
  before insert on public.transactions
  for each row execute function lp_private.trg_evaluate_risk();

drop trigger if exists trg_evaluate_risk_log on public.transactions;
create trigger trg_evaluate_risk_log
  after insert on public.transactions
  for each row execute function lp_private.trg_evaluate_risk_log();

revoke all on function lp_private.cfg_num(jsonb, text, numeric)          from public, anon, authenticated;
revoke all on function lp_private.evaluate_risk(public.transactions)      from public, anon, authenticated;
revoke all on function lp_private.trg_evaluate_risk()                     from public, anon, authenticated;
revoke all on function lp_private.trg_evaluate_risk_log()                 from public, anon, authenticated;

-- ── rule_evaluations: written by the database only ─────────────────────────
-- Migration `brain_f0_lock_rule_evaluations`, applied once the web no longer
-- writes evaluations itself (this branch merged): until then the old web
-- code's insert would fail and block creating a transaction.
drop policy if exists rule_evaluations_write on public.rule_evaluations;
revoke insert, update, delete on public.rule_evaluations from anon, authenticated;
