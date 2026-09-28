-- Plan limits enforced by the server, from ONE source: the organization
-- owner's subscription + plan_features (the numbers the pricing page shows).
-- Applied as migration `plan_limits_server`. Reference copy.
--
-- Before:
--   · Only AI queries and Plaid connections were checked (and AI twice).
--     Invoices, receipts, mileage trips and transactions never touched a
--     quota; clients / team members were checked only in the browser.
--   · Two plan systems: per-organization (get_org_plan_limits, check_quota,
--     usage_meters) and per-user (check_feature_access, usage_tracking --
--     never incremented). A firm's employee read their OWN (missing)
--     subscription and lost features the firm pays for. The user-level
--     functions are dropped (archived in sql/archive/user_level_feature_usage.sql).
--   · plan_features was writable by any signed-in user (INSERT/UPDATE grants).
--
-- Now:
--   · lp_private.org_effective_plan(org)  'exempt' | 'none' (sign-up still in
--     progress: no subscription yet) | 'expired' | the plan.
--   · lp_private.org_feature_limit(org, key)  -1 unlimited, 0 not included.
--   · get_org_plan_limits() and check_quota() read the same helper.
--   · Triggers: invoices (LQ001), receipts (LQ002), mileage trips (LQ003) --
--     monthly caps from plan_features; transactions are never blocked, they
--     are counted and anything over the cap is logged for overage billing
--     (usage_excess_events, as check_quota always did); clients (LQ004) and
--     team members (LQ005) -- standing counts of real rows; time tracking
--     (LQ006) and bill tracking (LB009) -- features the plan must include;
--     an ended plan blocks all of them (LQ007).
--   · public.get_workspace_plan(org): the one read the apps use for plan,
--     trial, features, this month's usage and seats.
--   · Currencies without an exchange rate are refused where they enter
--     (LX002): workspace, client default, invoice, transaction.

-- ── The plan of an organization ────────────────────────────────────────────

create or replace function lp_private.org_owner(p_org_id uuid)
returns uuid
language sql stable
set search_path = public
as $$
  select m.user_id
    from public.organization_memberships m
   where m.org_id = p_org_id and m.role = 'owner' and coalesce(m.is_active, true)
   order by m.created_at
   limit 1
$$;

create or replace function lp_private.org_effective_plan(p_org_id uuid)
returns text
language plpgsql stable
set search_path = public
as $$
declare
  v_owner uuid := lp_private.org_owner(p_org_id);
  v_plan  text;
begin
  if v_owner is null then
    return 'none';
  end if;
  if public.lp_is_billing_exempt(v_owner) then
    return 'exempt';
  end if;
  select s.plan::text into v_plan
    from public.subscriptions s
   where s.user_id = v_owner
     and (s.status in ('active', 'past_due')
          or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now())))
   order by s.created_at desc
   limit 1;
  if v_plan is not null then
    return v_plan;
  end if;
  if not exists (select 1 from public.subscriptions s where s.user_id = v_owner) then
    return 'none';
  end if;
  return 'expired';
end;
$$;

-- -1 = unlimited, 0 = not included in the plan, n = cap.
create or replace function lp_private.org_feature_limit(p_org_id uuid, p_key text)
returns integer
language sql stable
set search_path = public
as $$
  select case lp_private.org_effective_plan(p_org_id)
           when 'exempt'  then -1
           when 'none'    then -1
           when 'expired' then 0
           else coalesce((select case when pf.is_enabled then pf.limit_value else 0 end
                            from public.plan_features pf
                           where pf.plan::text = lp_private.org_effective_plan(p_org_id)
                             and pf.feature_key = p_key), 0)
         end
$$;

create or replace function public.get_org_plan_limits(p_org_id uuid)
returns table(plan text, plaid_connections_limit integer, ai_queries_limit integer, transactions_limit integer,
              receipts_limit integer, mileage_trips_limit integer, invoices_limit integer,
              storage_mb_limit integer, allow_overages_eligible boolean)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_plan text := lp_private.org_effective_plan(p_org_id);
begin
  if v_plan = 'exempt' then
    return query select 'exempt'::text, -1, -1, -1, -1, -1, -1, -1, true;
    return;
  end if;
  if v_plan in ('expired', 'none') then
    return query select 'expired'::text, 0, 0, 0, 0, 0, 0, 0, false;
    return;
  end if;
  return query
  select v_plan,
         lp_private.org_feature_limit(p_org_id, 'plaid_connections'),
         lp_private.org_feature_limit(p_org_id, 'ai_queries'),
         lp_private.org_feature_limit(p_org_id, 'transactions'),
         lp_private.org_feature_limit(p_org_id, 'receipts_per_mo'),
         lp_private.org_feature_limit(p_org_id, 'mileage_trips'),
         lp_private.org_feature_limit(p_org_id, 'invoices'),
         lp_private.org_feature_limit(p_org_id, 'storage_mb'),
         v_plan in ('bookkeeper', 'accountant', 'enterprise');
end;
$$;

-- ── Enforcement helpers ─────────────────────────────────────────────────────

create or replace function lp_private.assert_plan_active(p_org_id uuid)
returns void
language plpgsql stable
set search_path = public
as $$
begin
  if lp_private.org_effective_plan(p_org_id) = 'expired' then
    raise exception using errcode = 'LQ007',
      message = 'Your plan has ended. Choose a plan to keep working.';
  end if;
end;
$$;

-- A monthly cap (invoices / receipts / mileage trips): refuse past the cap
-- (unless the plan allows pay-as-you-go and the org turned it on -- the
-- decision check_quota_impl already makes), otherwise count it.
create or replace function lp_private.consume_monthly_quota(p_org_id uuid, p_metric public.usage_metric, p_code text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_plan text := lp_private.org_effective_plan(p_org_id);
  v_res  jsonb;
begin
  if v_plan not in ('exempt', 'none') then
    perform lp_private.assert_plan_active(p_org_id);
    v_res := lp_private.check_quota_impl(p_org_id, p_metric, 1);
    if not coalesce((v_res ->> 'allowed')::boolean, false) then
      raise exception using errcode = p_code,
        message = format('You''ve reached this month''s limit of %s %s on the %s plan.',
                         v_res ->> 'limit_value', replace(p_metric::text, '_', ' '), v_plan),
        detail  = jsonb_build_object('limit', (v_res ->> 'limit_value')::int, 'plan', v_plan)::text;
    end if;
  end if;
  perform lp_private.increment_usage_impl(p_org_id, p_metric, 1);
end;
$$;

create or replace function lp_private.assert_plan_feature(p_org_id uuid, p_key text, p_code text, p_label text)
returns void
language plpgsql stable
set search_path = public
as $$
declare
  v_plan text := lp_private.org_effective_plan(p_org_id);
begin
  if v_plan in ('exempt', 'none') then
    return;
  end if;
  perform lp_private.assert_plan_active(p_org_id);
  if lp_private.org_feature_limit(p_org_id, p_key) = 0 then
    raise exception using errcode = p_code,
      message = format('%s isn''t included in the %s plan.', p_label, v_plan),
      detail  = jsonb_build_object('plan', v_plan)::text;
  end if;
end;
$$;

-- ── Monthly caps ────────────────────────────────────────────────────────────

create or replace function lp_private.trg_quota_invoices()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform lp_private.consume_monthly_quota(new.org_id, 'invoices', 'LQ001');
  return null;
end;
$$;

create or replace function lp_private.trg_quota_receipts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.document_kind = 'receipt' then
    perform lp_private.consume_monthly_quota(new.org_id, 'receipts', 'LQ002');
  end if;
  return null;
end;
$$;

create or replace function lp_private.trg_quota_mileage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform lp_private.consume_monthly_quota(new.org_id, 'mileage_trips', 'LQ003');
  return null;
end;
$$;

-- Transactions always flow (a bank import is never cut in half): counted,
-- and anything past the cap logged for overage billing by check_quota_impl.
create or replace function lp_private.trg_quota_transactions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.version = 1 and lp_private.org_effective_plan(new.org_id) not in ('exempt', 'none', 'expired') then
    perform lp_private.check_quota_impl(new.org_id, 'transactions', 1);
  end if;
  if new.version = 1 then
    perform lp_private.increment_usage_impl(new.org_id, 'transactions', 1);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_quota_invoices on public.invoices;
create trigger trg_quota_invoices after insert on public.invoices
  for each row execute function lp_private.trg_quota_invoices();

drop trigger if exists trg_quota_receipts on public.documents;
create trigger trg_quota_receipts after insert on public.documents
  for each row execute function lp_private.trg_quota_receipts();

drop trigger if exists trg_quota_mileage on public.mileage_entries;
create trigger trg_quota_mileage after insert on public.mileage_entries
  for each row execute function lp_private.trg_quota_mileage();

drop trigger if exists trg_quota_transactions on public.transactions;
create trigger trg_quota_transactions after insert on public.transactions
  for each row execute function lp_private.trg_quota_transactions();

-- ── Seats (standing counts of real rows) ────────────────────────────────────

create or replace function lp_private.trg_seat_clients()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_used  integer;
begin
  if not coalesce(new.is_active, true)
     or (tg_op = 'UPDATE' and coalesce(old.is_active, true)) then
    return new;
  end if;
  if lp_private.org_effective_plan(new.org_id) in ('exempt', 'none') then
    return new;
  end if;
  perform lp_private.assert_plan_active(new.org_id);
  v_limit := lp_private.org_feature_limit(new.org_id, 'clients');
  if v_limit = -1 then
    return new;
  end if;
  select count(*) into v_used from public.clients
   where org_id = new.org_id and coalesce(is_active, true) and id <> new.id;
  if v_used >= v_limit then
    raise exception using errcode = 'LQ004',
      message = format('Your %s plan includes up to %s client(s).', lp_private.org_effective_plan(new.org_id), v_limit),
      detail  = jsonb_build_object('limit', v_limit, 'plan', lp_private.org_effective_plan(new.org_id))::text;
  end if;
  return new;
end;
$$;

create or replace function lp_private.trg_seat_members()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_used  integer;
begin
  -- plan_features.team_members counts everyone, owner included (Starter's 1 =
  -- just the owner). The owner's own row is never refused: it IS the account.
  if new.role = 'owner'
     or not coalesce(new.is_active, true)
     or (tg_op = 'UPDATE' and coalesce(old.is_active, true)) then
    return new;
  end if;
  if lp_private.org_effective_plan(new.org_id) in ('exempt', 'none') then
    return new;
  end if;
  perform lp_private.assert_plan_active(new.org_id);
  v_limit := lp_private.org_feature_limit(new.org_id, 'team_members');
  if v_limit = -1 then
    return new;
  end if;
  select count(*) into v_used from public.organization_memberships
   where org_id = new.org_id and coalesce(is_active, true) and id <> new.id;
  if v_used >= v_limit then
    raise exception using errcode = 'LQ005',
      message = format('Your %s plan includes up to %s team member(s).', lp_private.org_effective_plan(new.org_id), v_limit),
      detail  = jsonb_build_object('limit', v_limit, 'plan', lp_private.org_effective_plan(new.org_id))::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seat_clients on public.clients;
create trigger trg_seat_clients before insert or update of is_active on public.clients
  for each row execute function lp_private.trg_seat_clients();

drop trigger if exists trg_seat_members on public.organization_memberships;
create trigger trg_seat_members before insert or update of is_active on public.organization_memberships
  for each row execute function lp_private.trg_seat_members();

-- ── Features the plan must include ──────────────────────────────────────────

create or replace function lp_private.trg_feature_time_tracking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform lp_private.assert_plan_feature(new.org_id, 'time_tracking', 'LQ006', 'Time tracking');
  return new;
end;
$$;

drop trigger if exists trg_feature_time_tracking on public.time_entries;
create trigger trg_feature_time_tracking before insert on public.time_entries
  for each row execute function lp_private.trg_feature_time_tracking();

create or replace function lp_private.trg_feature_bill_tracking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform lp_private.assert_plan_feature(new.org_id, 'bill_tracking', 'LB009', 'Bill tracking');
  return new;
end;
$$;

drop trigger if exists trg_feature_bill_tracking on public.vendor_bills;
create trigger trg_feature_bill_tracking before insert on public.vendor_bills
  for each row execute function lp_private.trg_feature_bill_tracking();

-- ── One read for the apps ───────────────────────────────────────────────────

create or replace function public.get_workspace_plan(p_org_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_plan  text;
  v_owner uuid;
  v_sub   public.subscriptions%rowtype;
  v_usage public.usage_meters%rowtype;
begin
  perform lp_private.assert_org_access(p_org_id);
  v_plan  := lp_private.org_effective_plan(p_org_id);
  v_owner := lp_private.org_owner(p_org_id);

  select * into v_sub from public.subscriptions
   where user_id = v_owner order by created_at desc limit 1;
  select * into v_usage from public.usage_meters
   where org_id = p_org_id and period_start = date_trunc('month', current_date)::date;

  return jsonb_build_object(
    'plan',     v_plan,
    'is_owner', v_owner = auth.uid(),
    'subscription', case when v_sub.id is null then null else jsonb_build_object(
        'plan',               v_sub.plan,
        'status',             v_sub.status,
        'trial_started_at',   v_sub.trial_started_at,
        'trial_ends_at',      v_sub.trial_ends_at,
        'current_period_end', v_sub.current_period_end,
        'canceled_at',        v_sub.canceled_at) end,
    'features', coalesce((
        select jsonb_object_agg(k.feature_key, lp_private.org_feature_limit(p_org_id, k.feature_key))
          from (select distinct feature_key from public.plan_features) k), '{}'::jsonb),
    'usage', jsonb_build_object(
        'transactions',      coalesce(v_usage.transactions_count, 0),
        'receipts',          coalesce(v_usage.receipts_count, 0),
        'mileage_trips',     coalesce(v_usage.mileage_trips_count, 0),
        'invoices',          coalesce(v_usage.invoices_count, 0),
        'ai_queries',        coalesce(v_usage.ai_queries_count, 0),
        'plaid_connections', coalesce(v_usage.plaid_connections_count, 0),
        'storage_mb',        coalesce(v_usage.storage_mb, 0)),
    'seats', jsonb_build_object(
        'clients',      (select count(*) from public.clients
                          where org_id = p_org_id and coalesce(is_active, true)),
        -- People in the workspace, owner included: plan_features.team_members
        -- is the total seat count (Starter's 1 = just the owner).
        'team_members', (select count(*) from public.organization_memberships
                          where org_id = p_org_id and coalesce(is_active, true)))
  );
end;
$$;

-- ── Recurring invoices: one workspace at its cap can't stop the others ──────

create or replace function public.cron_generate_all_recurring_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec  record;
  v_n  integer := 0;
begin
  for rec in
    select id from public.recurring_invoices
     where status = 'active' and next_run_date <= current_date
     order by org_id, next_run_date
  loop
    begin
      if public.generate_recurring_invoice(rec.id) is not null then
        v_n := v_n + 1;
      end if;
    exception when others then
      raise warning '[recurring invoices] % skipped: % (%)', rec.id, sqlerrm, sqlstate;
    end;
  end loop;
  return v_n;
end;
$$;

-- ── Currencies: only those with an exchange rate ────────────────────────────

create or replace function lp_private.assert_supported_currency(p_currency text)
returns void
language plpgsql stable
set search_path = public
as $$
begin
  if p_currency is null or upper(p_currency) = 'USD' then
    return;
  end if;
  if not exists (select 1 from public.exchange_rates where currency = upper(p_currency)) then
    raise exception using errcode = 'LX002',
      message = format('%s isn''t supported yet: there''s no exchange rate for it.', upper(p_currency)),
      detail  = jsonb_build_object('currency', upper(p_currency))::text;
  end if;
end;
$$;

create or replace function lp_private.trg_supported_currency()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cur text := to_jsonb(new) ->> tg_argv[0];
begin
  if tg_op = 'UPDATE' and v_cur is not distinct from (to_jsonb(old) ->> tg_argv[0]) then
    return new;
  end if;
  perform lp_private.assert_supported_currency(v_cur);
  return new;
end;
$$;

drop trigger if exists trg_supported_currency on public.organizations;
create trigger trg_supported_currency before insert or update of currency on public.organizations
  for each row execute function lp_private.trg_supported_currency('currency');

drop trigger if exists trg_supported_currency on public.clients;
create trigger trg_supported_currency before insert or update of default_currency on public.clients
  for each row execute function lp_private.trg_supported_currency('default_currency');

drop trigger if exists trg_supported_currency on public.invoices;
create trigger trg_supported_currency before insert or update of currency on public.invoices
  for each row execute function lp_private.trg_supported_currency('currency');

drop trigger if exists trg_supported_currency on public.transactions;
create trigger trg_supported_currency before insert on public.transactions
  for each row execute function lp_private.trg_supported_currency('currency');

-- ── Drop the per-user plan system (archived) ────────────────────────────────

drop function if exists public.enforce_and_consume_feature(uuid, text, integer);
drop function if exists public.revert_feature_usage(uuid, text, integer);
drop function if exists public.increment_feature_usage(uuid, text, integer);
drop function if exists lp_private.increment_feature_usage_impl(uuid, text, integer);
drop function if exists public.check_feature_access(uuid, text);
drop function if exists lp_private.check_feature_access_impl(uuid, text);

-- ── plan_features: readable by everyone (the pricing page), writable by no client

revoke insert, update, delete on public.plan_features from authenticated, anon;
grant select on public.plan_features to anon, authenticated;
drop policy if exists plan_features_select_public on public.plan_features;
create policy plan_features_select_public on public.plan_features for select to anon using (true);

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on function lp_private.org_owner(uuid)                                        from public, anon, authenticated;
revoke all on function lp_private.org_effective_plan(uuid)                               from public, anon, authenticated;
revoke all on function lp_private.org_feature_limit(uuid, text)                          from public, anon, authenticated;
revoke all on function lp_private.assert_plan_active(uuid)                               from public, anon, authenticated;
revoke all on function lp_private.consume_monthly_quota(uuid, public.usage_metric, text) from public, anon, authenticated;
revoke all on function lp_private.assert_plan_feature(uuid, text, text, text)            from public, anon, authenticated;
revoke all on function lp_private.assert_supported_currency(text)                        from public, anon, authenticated;
revoke all on function lp_private.trg_quota_invoices()                                   from public, anon, authenticated;
revoke all on function lp_private.trg_quota_receipts()                                   from public, anon, authenticated;
revoke all on function lp_private.trg_quota_mileage()                                    from public, anon, authenticated;
revoke all on function lp_private.trg_quota_transactions()                               from public, anon, authenticated;
revoke all on function lp_private.trg_seat_clients()                                     from public, anon, authenticated;
revoke all on function lp_private.trg_seat_members()                                     from public, anon, authenticated;
revoke all on function lp_private.trg_feature_time_tracking()                            from public, anon, authenticated;
revoke all on function lp_private.trg_feature_bill_tracking()                            from public, anon, authenticated;
revoke all on function lp_private.trg_supported_currency()                               from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;

revoke all on function public.get_workspace_plan(uuid)          from public, anon;
grant execute on function public.get_workspace_plan(uuid)       to authenticated, service_role;
revoke all on function public.cron_generate_all_recurring_invoices() from public, anon, authenticated;
grant execute on function public.cron_generate_all_recurring_invoices() to service_role;

-- ── The paywall reads the same decision ─────────────────────────────────────
-- get_org_access (paywall_after_trial.sql) had its own copy of "owner ->
-- latest subscription" and took the latest row whatever its status, while the
-- limits take the latest ACTIVE one: with an old active row and a newer
-- canceled one they disagreed. It now derives from org_effective_plan.
-- ('none' -- no subscription row at all -- only exists inside the sign-up
-- trigger; the paywall shows it as 'expired', as before.)

create or replace function public.get_org_access(p_org_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_owner uuid := lp_private.org_owner(p_org_id);
  v_plan  text;
  v_sub   public.subscriptions%rowtype;
  v_state text;
begin
  perform lp_private.assert_org_access(p_org_id, null, true);
  v_plan := lp_private.org_effective_plan(p_org_id);

  if v_plan = 'exempt' then
    return jsonb_build_object('state', 'exempt', 'plan', 'exempt',
                              'is_owner', v_owner = auth.uid());
  end if;

  if v_plan not in ('expired', 'none') then
    -- the same row org_effective_plan chose
    select * into v_sub from public.subscriptions s
     where s.user_id = v_owner
       and (s.status in ('active', 'past_due')
            or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now())))
     order by s.created_at desc limit 1;
    v_state := v_sub.status::text;
  else
    select * into v_sub from public.subscriptions s
     where s.user_id = v_owner order by s.created_at desc limit 1;
    v_state := 'expired';
  end if;

  return jsonb_build_object(
    'state',         v_state,
    'plan',          v_sub.plan,
    'trial_ends_at', v_sub.trial_ends_at,
    'days_left',     case when v_state = 'trialing' and v_sub.trial_ends_at is not null
                          then greatest(0, ceil(extract(epoch from (v_sub.trial_ends_at - now())) / 86400))::int
                     end,
    'is_owner',      v_owner is not null and v_owner = auth.uid()
  );
end;
$$;
