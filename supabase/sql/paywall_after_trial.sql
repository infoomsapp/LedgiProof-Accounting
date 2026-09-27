-- No free plans: every plan starts with a free trial (Starter 30 days, the
-- rest 15), and when it ends without a paid subscription the workspace must
-- choose a plan to keep working.
-- Applied 2026-09-27 as migration `paywall_after_trial`. Kept here as the
-- reference copy. Depends on `phase1_account_setup`.
--
--   · get_org_access()      -- one answer for the web/mobile gate: trialing,
--                              active, past_due, expired or exempt.
--   · get_org_plan_limits() -- an expired org gets zero, not Starter.
--   · a daily job flips unpaid, ended trials to 'expired'.

create or replace function public.get_org_access(p_org_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_sub      public.subscriptions%rowtype;
  v_state    text;
begin
  -- Portal clients are admitted: they only need to know whether the firm is
  -- active; staff need it to decide whether to show the paywall.
  perform lp_private.assert_org_access(p_org_id, null, true);

  select m.user_id into v_owner_id
    from public.organization_memberships m
   where m.org_id = p_org_id
     and m.role = 'owner'
     and coalesce(m.is_active, true) = true
   order by m.created_at
   limit 1;

  if v_owner_id is not null and public.lp_is_billing_exempt(v_owner_id) then
    return jsonb_build_object('state', 'exempt', 'plan', 'exempt',
                              'is_owner', v_owner_id = auth.uid());
  end if;

  select * into v_sub
    from public.subscriptions s
   where s.user_id = v_owner_id
   order by s.created_at desc
   limit 1;

  v_state := case
    when v_sub.id is null                                            then 'expired'
    when v_sub.status = 'active'                                     then 'active'
    when v_sub.status = 'past_due'                                   then 'past_due'
    when v_sub.status = 'trialing'
     and (v_sub.trial_ends_at is null or v_sub.trial_ends_at > now()) then 'trialing'
    else 'expired'
  end;

  return jsonb_build_object(
    'state',         v_state,
    'plan',          v_sub.plan,
    'trial_ends_at', v_sub.trial_ends_at,
    'days_left',     case when v_state = 'trialing' and v_sub.trial_ends_at is not null
                          then greatest(0, ceil(extract(epoch from (v_sub.trial_ends_at - now())) / 86400))::int
                     end,
    'is_owner',      v_owner_id is not null and v_owner_id = auth.uid()
  );
end;
$$;

revoke all on function public.get_org_access(uuid) from public, anon;
grant execute on function public.get_org_access(uuid) to authenticated, service_role;

-- An org with no active, past_due or still-running trial gets zero quota.
create or replace function public.get_org_plan_limits(p_org_id uuid)
returns table(plan text, plaid_connections_limit integer, ai_queries_limit integer,
              transactions_limit integer, receipts_limit integer, mileage_trips_limit integer,
              invoices_limit integer, storage_mb_limit integer, allow_overages_eligible boolean)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_plan     text;
begin
  select m.user_id into v_owner_id
    from public.organization_memberships m
   where m.org_id = p_org_id
     and m.role = 'owner'
     and coalesce(m.is_active, true) = true
   order by m.created_at
   limit 1;

  -- Internal test accounts: -1 is what check_quota reads as unlimited.
  if v_owner_id is not null and public.lp_is_billing_exempt(v_owner_id) then
    return query select 'exempt'::text, -1, -1, -1, -1, -1, -1, -1, true;
    return;
  end if;

  if v_owner_id is not null then
    select s.plan into v_plan
      from public.subscriptions s
     where s.user_id = v_owner_id
       and (
         s.status in ('active', 'past_due')
         or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
       )
     order by s.created_at desc
     limit 1;
  end if;

  if v_plan is null then
    return query select 'expired'::text, 0, 0, 0, 0, 0, 0, 0, false;
    return;
  end if;

  -- Every number comes from plan_features. A disabled feature row means zero,
  -- not unlimited; a missing row also means zero (fails closed).
  return query
  with f as (
    select pf.feature_key,
           case when pf.is_enabled then pf.limit_value else 0 end as v
      from public.plan_features pf
     where pf.plan = v_plan::public.subscription_plan
  )
  select
    v_plan,
    coalesce((select v from f where feature_key = 'plaid_connections'), 0),
    coalesce((select v from f where feature_key = 'ai_queries'), 0),
    coalesce((select v from f where feature_key = 'transactions'), 0),
    coalesce((select v from f where feature_key = 'receipts_per_mo'), 0),
    coalesce((select v from f where feature_key = 'mileage_trips'), 0),
    coalesce((select v from f where feature_key = 'invoices'), 0),
    coalesce((select v from f where feature_key = 'storage_mb'), 0),
    v_plan in ('bookkeeper', 'accountant', 'enterprise');
end;
$$;

revoke all on function public.get_org_plan_limits(uuid) from public, anon, authenticated;

-- Daily: an unpaid trial that has ended becomes 'expired' (so billing,
-- admin views and emails see the same thing the gate does).
create or replace function lp_private.expire_ended_trials()
returns integer
language sql
set search_path = public
as $$
  with x as (
    update public.subscriptions
       set status = 'expired', updated_at = now()
     where status = 'trialing'
       and trial_ends_at < now()
       and stripe_subscription_id is null
    returning 1
  )
  select count(*)::integer from x;
$$;

revoke all on function lp_private.expire_ended_trials() from public, anon, authenticated;

select cron.schedule('expire-ended-trials-daily', '15 0 * * *',
                     $$select lp_private.expire_ended_trials();$$);
