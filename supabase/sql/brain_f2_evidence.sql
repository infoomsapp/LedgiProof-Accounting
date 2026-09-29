-- Brain v3 · F2 — the suggestion says why, and the why is sealed.
-- Applied as migration `brain_f2_evidence`. Kept here as the reference copy.
-- Design: docs/brain-v3.md §3.B–D, §4. No AI, no trained model.
--
-- Still ONE suggestion engine: lp_private.suggest_account, used by For review
-- (get_review_queue) and by automation (auto_categorize_transactions). It is
-- upgraded in place; nothing parallel is added.
--
-- Before: the first source that matched won, whatever the others said
-- (rule > learned > vendor > known merchant > bank category > income), and
-- nothing said why.
--
-- Now:
--   · A person's rule still decides alone (99).
--   · Otherwise every signal proposes an account with the SAME points the
--     engine already used -- learned 70 + 8 per confirmation (max 97),
--     vendor default 85, known merchant 60, bank category 55 (+10 when Plaid
--     itself is HIGH / VERY_HIGH confident), money in with nothing else 40 --
--     and the account with the most gets:
--       its strongest signal, + 5 for each other signal that agrees (max 97);
--       − 15 when another account is within 10 points ("could also be…").
--     Automation still posts only a rule or a merchant confirmed 3 times
--     (learned >= 94): agreement can't create that, a conflict can only
--     take it away -- strictly more careful than before.
--   · suggest_account returns `evidence` (jsonb): one entry per signal that
--     backs the winner, plus the conflict. For review returns it as
--     suggestion_evidence; the UI shows it as "Why?".
--   · categorize_transaction seals in audit_events what the Brain suggested
--     and why, computed on the server before this confirmation is learned
--     (never taken from the browser), next to what the person chose.

drop function if exists lp_private.suggest_account(uuid, uuid, text, numeric, uuid, text);

create or replace function lp_private.suggest_account(
  p_org_id          uuid,
  p_client_id       uuid,
  p_text            text,
  p_amount          numeric,
  p_vendor_id       uuid,
  p_hint            text default null,
  p_hint_confidence text default null)
returns table(account_id uuid, source text, confidence integer, evidence jsonb)
language plpgsql
stable
set search_path = public
as $$
declare
  v_key   text := lp_private.merchant_identity(p_org_id, p_client_id, p_text);
  v_text  text := lower(coalesce(p_text, ''));
  v_cat   text := case when p_client_id is null then 'learned' else 'learned:' || p_client_id end;
  v_id    uuid;
  v_name  text;
  v_rule  boolean;
  v_n     integer;
  v_pts   integer;
  v_c     jsonb := '[]'::jsonb;   -- candidates: {account_id, account_name, signal, points, detail, ...}
  v_seen_merchant boolean := false;
  v_seen_bank     boolean := false;
  h       record;
  w       record;
  r2      record;
  v_score integer;
  v_ev    jsonb;
begin
  -- 1. What this workspace confirmed (a rule decides alone).
  if v_key <> '' then
    select up.account_id, a.name, up.is_rule, up.match_count into v_id, v_name, v_rule, v_n
      from public.user_patterns up
      join public.accounts a on a.id = up.account_id
     where up.org_id = p_org_id and up.category = v_cat and up.keyword = v_key
       and up.is_active and a.is_active
       and a.client_id is not distinct from p_client_id
     limit 1;
    if v_id is not null and v_rule then
      return query select v_id, 'rule'::text, 99,
        jsonb_build_array(jsonb_build_object(
          'signal', 'rule', 'points', 99, 'account_id', v_id, 'account_name', v_name, 'merchant', v_key,
          'detail', format('Your rule: %s always goes to %s', v_key, v_name)));
      return;
    end if;
    if v_id is not null then
      v_pts := least(97, 70 + 8 * coalesce(v_n, 0));
      v_c := v_c || jsonb_build_object(
        'account_id', v_id, 'account_name', v_name, 'signal', 'learned', 'points', v_pts,
        'merchant', v_key, 'count', v_n,
        'detail', format('%s confirmed %s time(s) in %s', v_key, v_n, v_name));
    end if;
  end if;

  -- 2. The vendor's default account (money out).
  if p_vendor_id is not null and p_amount < 0 then
    v_id := null;
    select a.id, a.name into v_id, v_name
      from public.vendors v
      join public.accounts a on a.id = v.default_expense_account_id
     where v.id = p_vendor_id and v.org_id = p_org_id and a.is_active;
    if v_id is not null then
      v_c := v_c || jsonb_build_object(
        'account_id', v_id, 'account_name', v_name, 'signal', 'vendor', 'points', 85,
        'detail', format('Default account of this vendor: %s', v_name));
    end if;
  end if;

  -- 3. Planted knowledge: the first known merchant, the first bank category.
  for h in
    select s.* from lp_private.categorization_seeds s
     where (s.kind = 'merchant' and v_text ~ s.pattern)
        or (s.kind = 'plaid_category' and s.pattern = upper(coalesce(p_hint, '')))
     order by s.ord, s.id
  loop
    continue when sign(p_amount) <> h.sign;
    continue when h.kind = 'merchant' and v_seen_merchant;
    continue when h.kind = 'plaid_category' and v_seen_bank;
    select a.id, a.name into v_id, v_name
      from public.accounts a
     where a.org_id = p_org_id
       and a.client_id is not distinct from p_client_id
       and a.is_active
       and a.type = coalesce(h.account_type, case when h.sign < 0 then 'expense' else 'income' end)
       and lower(a.name) ~ h.account_pattern
       and lp_private.is_leaf_account(a.id)
     order by a.code
     limit 1;
    continue when v_id is null;
    if h.kind = 'merchant' then
      v_seen_merchant := true;
      v_c := v_c || jsonb_build_object(
        'account_id', v_id, 'account_name', v_name, 'signal', 'merchant', 'points', h.confidence,
        'detail', format('Known merchant: this kind of spending usually goes to %s', v_name));
    else
      v_seen_bank := true;
      v_pts := h.confidence + case when upper(coalesce(p_hint_confidence, '')) in ('HIGH', 'VERY_HIGH') then 10 else 0 end;
      v_c := v_c || jsonb_build_object(
        'account_id', v_id, 'account_name', v_name, 'signal', 'bank_category', 'points', v_pts,
        'category', upper(p_hint), 'bank_confidence', upper(p_hint_confidence),
        'detail', format('The bank classifies it as %s', upper(p_hint)));
    end if;
  end loop;

  -- 4. Money in and nothing else to go on.
  if jsonb_array_length(v_c) = 0 and p_amount > 0 then
    select a.id, a.name into v_id, v_name
      from public.accounts a
     where a.org_id = p_org_id
       and a.client_id is not distinct from p_client_id
       and a.is_active and a.type = 'income'
       and lp_private.is_leaf_account(a.id)
     order by a.code
     limit 1;
    if v_id is not null then
      v_c := v_c || jsonb_build_object(
        'account_id', v_id, 'account_name', v_name, 'signal', 'income', 'points', 40,
        'detail', format('Money in: first income account (%s)', v_name));
    end if;
  end if;

  if jsonb_array_length(v_c) = 0 then
    return;
  end if;

  -- Combine: per account, the strongest signal + 5 per other agreeing signal.
  select x.account_id, x.best, x.signals, x.src
    into w
    from (
      select (c ->> 'account_id')::uuid as account_id,
             max((c ->> 'points')::int)  as best,
             count(*)                    as signals,
             (array_agg(c ->> 'signal' order by (c ->> 'points')::int desc))[1] as src
        from jsonb_array_elements(v_c) c
       group by 1
    ) x
   order by least(97, x.best + 5 * (x.signals - 1)) desc, x.best desc
   limit 1;
  v_score := least(97, w.best + 5 * (w.signals - 1));

  select coalesce(jsonb_agg(c order by (c ->> 'points')::int desc), '[]'::jsonb) into v_ev
    from jsonb_array_elements(v_c) c
   where (c ->> 'account_id')::uuid = w.account_id;
  if w.signals > 1 then
    v_ev := v_ev || jsonb_build_object('signal', 'agreement', 'points', 5 * (w.signals - 1),
      'count', w.signals, 'detail', format('%s signals agree', w.signals));
  end if;

  -- The closest other account, if it is close.
  select (c ->> 'account_id')::uuid as account_id, c ->> 'account_name' as account_name,
         max((c ->> 'points')::int) as best, count(*) as signals
    into r2
    from jsonb_array_elements(v_c) c
   where (c ->> 'account_id')::uuid <> w.account_id
   group by 1, 2
   order by least(97, max((c ->> 'points')::int) + 5 * (count(*) - 1)) desc
   limit 1;
  if r2.account_id is not null
     and v_score - least(97, r2.best + 5 * (r2.signals - 1)) < 10 then
    v_score := v_score - 15;
    v_ev := v_ev || jsonb_build_object('signal', 'conflict', 'points', -15,
      'account_id', r2.account_id, 'account_name', r2.account_name,
      'detail', format('Could also be %s', r2.account_name));
  end if;

  return query select w.account_id, w.src, v_score, v_ev;
end;
$$;

revoke all on function lp_private.suggest_account(uuid, uuid, text, numeric, uuid, text, text) from public, anon, authenticated;

-- ── Callers: pass Plaid's confidence; For review returns the evidence ──────

create or replace function pg_temp.patch_function(p_fn regprocedure, p_from text[], p_to text[])
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  i     int;
begin
  for i in 1 .. array_length(p_from, 1) loop
    if position(p_from[i] in v_def) = 0 then
      raise exception '%: text to replace not found: %', p_fn, p_from[i];
    end if;
    v_def := replace(v_def, p_from[i], p_to[i]);
  end loop;
  execute v_def;
end;
$$;

select pg_temp.patch_function('public.get_review_queue(uuid, uuid, integer)',
  array[
    E't.metadata ->> ''plaid_category'') s on true',
    E'else s.confidence end                               as suggestion_confidence,'
  ],
  array[
    E't.metadata ->> ''plaid_category'', t.metadata ->> ''plaid_category_confidence'') s on true',
    E'else s.confidence end                               as suggestion_confidence,\n'
    || E'             case when (im.invoice_id is not null and v_ar is not null)\n'
    || E'                    or (pm.payment_id is not null and v_und is not null)\n'
    || E'                    or (bm.kind = ''open'' and v_ap is not null)\n'
    || E'                    or (bm.kind = ''in_transit'' and v_transit is not null) then null\n'
    || E'                  else s.evidence end                                 as suggestion_evidence,'
  ]);

select pg_temp.patch_function('public.auto_categorize_transactions(uuid, uuid[], uuid)',
  array[E'v_tx.metadata ->> ''plaid_category'');'],
  array[E'v_tx.metadata ->> ''plaid_category'', v_tx.metadata ->> ''plaid_category_confidence'');']);

-- ── Seal what the Brain suggested, and why, with the decision ──────────────

select pg_temp.patch_function('lp_private.categorize_transaction(uuid, jsonb, uuid, boolean)',
  array[E'      ''suggestion_source'',   p_item ->> ''source'','],
  array[E'      ''suggestion_source'',   p_item ->> ''source'',\n'
     || E'      ''brain'',               (select jsonb_build_object(\n'
     || E'                                 ''account_id'', s.account_id, ''source'', s.source,\n'
     || E'                                 ''confidence'', s.confidence, ''evidence'', s.evidence,\n'
     || E'                                 ''followed'', s.account_id = v_acct.id)\n'
     || E'                               from lp_private.suggest_account(\n'
     || E'                                 p_org_id, v_tx.client_id, coalesce(v_tx.merchant_name, v_tx.description),\n'
     || E'                                 v_tx.amount, v_tx.vendor_id, v_tx.metadata ->> ''plaid_category'',\n'
     || E'                                 v_tx.metadata ->> ''plaid_category_confidence'') s),']);
