-- Applied as migration `extra_companies` (2026-09-28).
-- Option B (chosen by the owner): any business on a paid plan can add more
-- companies, each extra one billed at a share of its plan (50%) inside the
-- SAME subscription. QuickBooks, Xero, Zoho and FreshBooks charge the full
-- price for every company; that difference is the point.
--   · plan_features.workspaces          = companies INCLUDED (Starter/Entrepreneur 1;
--                                         firm plans 2 = firm + own books; Enterprise -1)
--   · plan_features.extra_workspace_pct = price of each extra company, % of the plan
--   · Extras are never stored as a counter: extra = owned companies - included,
--     so billing can't drift from what exists.
--   · A firm adds companies as clients (LQ010). Adding a billed company needs
--     explicit acceptance (LQ011); without a paid/trial plan it is LQ009.
insert into public.plan_features (plan, feature_key, limit_value, is_enabled) values
  ('starter',      'extra_workspace_pct', 50, true),
  ('entrepreneur', 'extra_workspace_pct', 50, true)
on conflict do nothing;

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
           end as lim,
           case when p.plan in ('exempt', 'expired', 'none') then 0
                else coalesce((select case when pf.is_enabled then pf.limit_value else 0 end
                                 from public.plan_features pf
                                where pf.plan::text = p.plan and pf.feature_key = 'extra_workspace_pct'), 0)
           end as pct
      from p),
       u as (
    select count(*)::int as used,
           coalesce(bool_or(coalesce(o.is_firm, false)), false) as firm
      from public.organization_memberships m
      join public.organizations o on o.id = m.org_id
     where m.user_id = p_user and m.role = 'owner' and m.is_active
       and o.is_active and not coalesce(o.is_client, false))
  select jsonb_build_object(
           'plan',          l.plan,
           'limit',         l.lim,
           'used',          u.used,
           'is_firm',       u.firm,
           'extra_pct',     l.pct,
           'extra_in_use',  case when l.lim = -1 then 0 else greatest(0, u.used - l.lim) end,
           'next_is_extra', l.lim <> -1 and u.used >= l.lim,
           'can_create',    not u.firm
                            and (l.lim = -1 or u.used < l.lim or l.pct > 0))
    from l, u
$$;

drop function if exists public.create_workspace_org(text);
create or replace function public.create_workspace_org(p_name text, p_accept_extra boolean default false)
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
  if (v_allow ->> 'is_firm')::boolean then
    raise exception using errcode = 'LQ010',
      message = 'A firm adds companies as clients, not as new organizations.';
  end if;
  if not (v_allow ->> 'can_create')::boolean then
    raise exception using errcode = 'LQ009',
      message = format('Your %s plan includes up to %s workspace(s).', v_allow ->> 'plan', v_allow ->> 'limit'),
      detail  = jsonb_build_object('plan', v_allow ->> 'plan', 'limit', (v_allow ->> 'limit')::int)::text;
  end if;
  if (v_allow ->> 'next_is_extra')::boolean and not coalesce(p_accept_extra, false) then
    raise exception using errcode = 'LQ011',
      message = format('This company is billed as an extra company: %s%% of your %s plan each month.',
                       v_allow ->> 'extra_pct', v_allow ->> 'plan'),
      detail  = jsonb_build_object('pct', (v_allow ->> 'extra_pct')::int, 'plan', v_allow ->> 'plan')::text;
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

-- For the billing functions (service role): the same numbers for a given user.
create or replace function public.workspace_allowance_for_user(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select lp_private.workspace_allowance(p_user)
$$;

revoke all on function public.create_workspace_org(text, boolean)  from public, anon;
grant execute on function public.create_workspace_org(text, boolean) to authenticated;
revoke all on function public.workspace_allowance_for_user(uuid)   from public, anon, authenticated;
grant execute on function public.workspace_allowance_for_user(uuid) to service_role;
