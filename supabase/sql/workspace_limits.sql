-- Applied as migration `workspace_limits` (2026-09-28).
-- How many workspaces (own books) an owner may have, by plan -- the source of
-- truth is plan_features like every other limit. Like QuickBooks and Xero,
-- one subscription = one company; firm plans include the firm + a personal
-- workspace; Enterprise is multi-entity.
insert into public.plan_features (plan, feature_key, limit_value, is_enabled) values
  ('starter',      'workspaces',  1, true),
  ('entrepreneur', 'workspaces',  1, true),
  ('bookkeeper',   'workspaces',  2, true),
  ('accountant',   'workspaces',  2, true),
  ('enterprise',   'workspaces', -1, true)
on conflict do nothing;

-- The plan of a PERSON (subscriptions are per user). org_effective_plan now
-- asks this for the org's owner, so there is one definition of "your plan".
create or replace function lp_private.user_effective_plan(p_user uuid)
returns text language plpgsql stable set search_path = public as $$
declare
  v_plan text;
begin
  if p_user is null then
    return 'none';
  end if;
  if public.lp_is_billing_exempt(p_user) then
    return 'exempt';
  end if;
  select s.plan::text into v_plan
    from public.subscriptions s
   where s.user_id = p_user
     and (s.status in ('active', 'past_due')
          or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now())))
   order by s.created_at desc
   limit 1;
  if v_plan is not null then
    return v_plan;
  end if;
  if not exists (select 1 from public.subscriptions s where s.user_id = p_user) then
    return 'none';
  end if;
  return 'expired';
end;
$$;

create or replace function lp_private.org_effective_plan(p_org_id uuid)
returns text language sql stable set search_path = public as $$
  select lp_private.user_effective_plan(lp_private.org_owner(p_org_id))
$$;

-- What the switcher needs to decide whether to offer "Create organization".
create or replace function lp_private.workspace_allowance(p_user uuid)
returns jsonb language sql stable set search_path = public as $$
  with p as (select lp_private.user_effective_plan(p_user) as plan),
       l as (
    select p.plan,
           case p.plan
             when 'exempt'  then -1
             when 'expired' then 0
             when 'none'    then 1
             else coalesce((select case when pf.is_enabled then pf.limit_value else 0 end
                              from public.plan_features pf
                             where pf.plan::text = p.plan and pf.feature_key = 'workspaces'), 1)
           end as lim
      from p),
       u as (
    select count(*)::int as used
      from public.organization_memberships m
      join public.organizations o on o.id = m.org_id
     where m.user_id = p_user and m.role = 'owner' and m.is_active
       and o.is_active and not coalesce(o.is_client, false))
  select jsonb_build_object('plan', l.plan, 'limit', l.lim, 'used', u.used,
                            'can_create', l.lim = -1 or u.used < l.lim)
    from l, u
$$;

create or replace function public.get_workspace_allowance()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized: no session' using errcode = '42501';
  end if;
  return lp_private.workspace_allowance(auth.uid());
end;
$$;

-- Create another organization with its own books, within the plan.
create or replace function public.create_workspace_org(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_allow jsonb;
  v_name  text := btrim(coalesce(p_name, ''));
  v_org   uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized: no session' using errcode = '42501';
  end if;
  if length(v_name) < 2 then
    raise exception using errcode = 'LA003', message = 'Give the organization a name';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspaces:' || v_uid::text, 0));
  v_allow := lp_private.workspace_allowance(v_uid);
  if not (v_allow ->> 'can_create')::boolean then
    raise exception using errcode = 'LQ009',
      message = format('Your %s plan includes up to %s workspace(s).', v_allow ->> 'plan', v_allow ->> 'limit'),
      detail  = jsonb_build_object('plan', v_allow ->> 'plan', 'limit', (v_allow ->> 'limit')::int)::text;
  end if;

  insert into public.organizations (name, slug, currency, fiscal_year_start,
                                    is_active, is_personal, is_firm, is_client)
  values (v_name, 'org-' || substr(gen_random_uuid()::text, 1, 8), 'USD', 1,
          true, true, false, false)
  returning id into v_org;

  insert into public.organization_memberships (org_id, user_id, role, is_active)
  values (v_org, v_uid, 'owner', true);

  -- Its own books, ready to use: the standard chart of accounts.
  perform public.seed_chart_of_accounts(v_org, v_uid);
  return v_org;
end;
$$;

revoke all on function public.get_workspace_allowance()  from public, anon;
revoke all on function public.create_workspace_org(text) from public, anon;
grant execute on function public.get_workspace_allowance()  to authenticated;
grant execute on function public.create_workspace_org(text) to authenticated;
