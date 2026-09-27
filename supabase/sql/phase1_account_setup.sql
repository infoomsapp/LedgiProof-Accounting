-- Phase 1 onboarding: one setup screen after signup, a ready-to-use chart of
-- accounts, the right plan/trial for the account type, and trials that
-- actually end.
-- Applied 2026-09-27 as migration `phase1_account_setup`. Kept here as the
-- reference copy. Depends on `security_rpc_access_guards` (lp_private schema).
--
-- What was wrong before:
--   · seed_chart_of_accounts failed for EVERY org: it inserted self-mode
--     accounts (client_id NULL) without is_legacy = true, which violates
--     accounts_legacy_consistency. New self-employed users therefore never had
--     a chart of accounts and could not post anything.
--   · Signup forced the account-type choice up front, and Google sign-ups
--     (no metadata) silently became bookkeeping firms.
--   · Every signup got plan 'starter' (firms lost multi-client), and a trial
--     never ended: get_org_plan_limits accepted 'trialing' forever.

-- ── Setup flag ───────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists setup_completed_at timestamptz;

-- The industry picked at setup (= the account_templates category used for the
-- chart of accounts). Not business_type: that column is the legal form
-- (LLC, S-corp...) and has its own CHECK.
alter table public.organizations add column if not exists industry text;

-- Everyone who already exists has, by definition, already set up.
update public.profiles
   set setup_completed_at = coalesce(created_at, now())
 where setup_completed_at is null;

-- ── Chart of accounts from an industry template (self-mode) ─────────────────
-- Also maps each account to its Schedule C line and flags cash accounts for
-- the cash-flow statement -- none of the existing accounts had either, so the
-- Schedule C export showed everything as "unmapped".

create or replace function lp_private.seed_accounts_from_template(
  p_org_id   uuid,
  p_category text,
  p_user_id  uuid
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_count       integer;
begin
  select count(*) into v_count from public.accounts where org_id = p_org_id and client_id is null;
  if v_count > 0 then
    return 0;  -- never touch an org that already has self-mode accounts
  end if;

  select id into v_template_id
    from public.account_templates
   where category = p_category and is_system
   limit 1;
  if v_template_id is null then
    select id into v_template_id
      from public.account_templates
     where category = 'general' and is_system
     limit 1;
  end if;

  insert into public.accounts (
    org_id, client_id, is_legacy, code, name, type, normal_balance,
    parent_id, level, is_active, created_by, schedule_c_line, cash_flow_category
  )
  select
    p_org_id, null, true, i.code, i.name, i.type, i.normal_balance::public.entry_type_enum,
    null,
    case when i.parent_code is null then 1 else 2 end,
    true, p_user_id,
    case
      when i.parent_code is null then null                    -- section headers
      when i.type = 'income' then 1                           -- gross receipts
      when i.type <> 'expense' then null
      when n ~ '(cost of goods|cost of sales|cogs|materials purchased|inventory)' then null   -- Part III, not a line here
      when n ~ '(development|training|education|continuing)' then 27
      when n ~ '(advertis|marketing|promotion)' then 8
      when n ~ '(car |truck|vehicle|auto|fuel|gas|mileage)' then 9
      when n ~ 'commission' then 10
      when n ~ '(contract labor|contractor|subcontract)' then 11
      when n ~ 'depreciation' then 13
      when n ~ '(benefit)' then 14
      when n ~ '(insurance| ins$| ins )' then 15              -- "Professional Liability Ins"
      when n ~ 'interest' then 16
      when n ~ '(legal|professional|accounting|consulting)' then 17
      when n ~ '(pension|401|retirement|profit.sharing)' then 19
      when n ~ '(rent|lease)' then 20
      when n ~ '(repair|maintenance)' then 21
      when n ~ '(tax|license|permit)' then 23
      when n ~ '(travel|meal|lodging|entertainment)' then 24
      when n ~ '(utilit|electric|water|telephone|phone|internet)' then 25
      when n ~ '(wage|salar|payroll)' then 26
      when n ~ '(office|software|subscription|postage|printing)' then 18
      when n ~ '(suppl)' then 22
      else 27                                                 -- other expenses
    end,
    case when i.type = 'asset' and n ~ '(cash|checking|savings|bank|petty)' then 'cash' end
  from public.account_template_items i
  cross join lateral (select lower(i.name) as n) nm
  where i.template_id = v_template_id
  order by i.sort_order;

  get diagnostics v_count = row_count;

  -- Second pass: link children to their parent header within this org.
  update public.accounts child
     set parent_id = parent.id,
         level     = parent.level + 1
    from public.account_template_items ti
    join public.accounts parent
      on parent.org_id = p_org_id
     and parent.client_id is null
     and parent.code = ti.parent_code
   where child.org_id = p_org_id
     and child.client_id is null
     and child.code = ti.code
     and ti.template_id = v_template_id
     and ti.parent_code is not null;

  return v_count;
end;
$$;

revoke all on function lp_private.seed_accounts_from_template(uuid, text, uuid) from public, anon, authenticated;
grant execute on function lp_private.seed_accounts_from_template(uuid, text, uuid) to service_role;

-- The "Create standard accounts" button (ChartOfAccounts.tsx) and the
-- fallback OnboardingWizard now go through the same, working seed.
create or replace function public.seed_chart_of_accounts(p_org_id uuid, p_user_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_industry text;
begin
  perform lp_private.assert_org_access(p_org_id, array['owner','admin','accountant']::public.lp_role[]);
  perform lp_private.assert_is_caller(p_user_id);
  select coalesce(industry, 'general') into v_industry from public.organizations where id = p_org_id;
  perform lp_private.seed_accounts_from_template(p_org_id, v_industry, p_user_id);
  return (select count(*) from public.accounts where org_id = p_org_id and client_id is null)::integer;
end;
$$;

drop function if exists lp_private.seed_chart_of_accounts_impl(uuid, uuid);

-- ── The one setup step after signup ─────────────────────────────────────────

create or replace function public.complete_account_setup(
  p_account_type  text,
  p_business_name text,
  p_industry      text default 'general'
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_is_firm   boolean;
  v_name      text := nullif(btrim(p_business_name), '');
  v_industry  text := coalesce(nullif(btrim(p_industry), ''), 'general');
  v_org_id    uuid;
  v_role      public.system_role;
  v_kind      public.workspace_kind;
  v_plan      public.subscription_plan;
  v_intended  text;
  v_trial_end timestamptz;
  v_accounts  integer := 0;
  v_done_at   timestamptz;
  v_slug      text;
begin
  if v_uid is null then
    raise exception 'unauthorized: no session' using errcode = '42501';
  end if;
  if p_account_type is null or p_account_type not in ('self_employed', 'bookkeeper', 'accountant') then
    raise exception 'Choose who you keep the books for' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Enter your business name' using errcode = '22023';
  end if;
  v_name := left(v_name, 120);
  if not exists (select 1 from public.account_templates where category = v_industry and is_system) then
    v_industry := 'general';
  end if;

  -- Serialize double-clicks / two tabs on the same user.
  select setup_completed_at into v_done_at from public.profiles where id = v_uid for update;
  if v_done_at is not null then
    select m.org_id into v_org_id
      from public.organization_memberships m
      join public.organizations o on o.id = m.org_id
     where m.user_id = v_uid and m.role = 'owner' and m.is_active
     order by o.created_at
     limit 1;
    return jsonb_build_object('org_id', v_org_id, 'already_completed', true);
  end if;

  v_is_firm := p_account_type in ('bookkeeper', 'accountant');
  if v_is_firm then
    v_role := 'bookkeeper'; v_kind := 'pro';
  else
    v_role := 'client';     v_kind := 'solo';
  end if;

  -- The workspace handle_new_user created at signup (or a new one if that
  -- bootstrap failed).
  select m.org_id into v_org_id
    from public.organization_memberships m
    join public.organizations o on o.id = m.org_id
   where m.user_id = v_uid and m.role = 'owner' and m.is_active
   order by o.created_at
   limit 1;

  if v_org_id is null then
    v_slug := public.lp_slugify(v_name) || '-' || substr(md5(random()::text), 1, 4);
    insert into public.organizations (name, slug, currency, fiscal_year_start, is_active)
    values (v_name, v_slug, 'USD', 1, true)
    returning id into v_org_id;
    insert into public.organization_memberships (org_id, user_id, role, is_active)
    values (v_org_id, v_uid, 'owner', true)
    on conflict (org_id, user_id) do nothing;
    insert into public.org_billing_prefs (org_id, allow_overages, notify_at_pct)
    values (v_org_id, false, 80)
    on conflict (org_id) do nothing;
  end if;

  update public.organizations
     set name               = v_name,
         is_personal        = not v_is_firm,
         is_firm            = v_is_firm,
         is_accountant_firm = (p_account_type = 'accountant'),
         is_client          = false,
         industry           = v_industry,
         updated_at         = now()
   where id = v_org_id;

  -- protect_profile_tier blocks system_role changes unless a trusted
  -- server-side flow says otherwise (transaction-local).
  perform set_config('app.trusted_role_update', 'on', true);
  update public.profiles
     set account_type       = p_account_type::public.account_type,
         system_role        = v_role,
         workspace_kind     = v_kind,
         setup_completed_at = now(),
         updated_at         = now()
   where id = v_uid;
  update public.user_roles
     set role = v_role
   where user_id = v_uid and role <> 'super_admin';

  -- Self-employed books live in this org; firms keep books per client
  -- (a template is cloned when each client is added).
  if not v_is_firm then
    v_accounts := lp_private.seed_accounts_from_template(v_org_id, v_industry, v_uid);
  end if;

  -- Plan + trial, as advertised: Starter "first month free", everything else
  -- 15 days. The Pricing page can pre-select Entrepreneur via ?plan=.
  select raw_user_meta_data ->> 'intended_plan' into v_intended from auth.users where id = v_uid;
  v_plan := case
    when p_account_type = 'bookkeeper' then 'bookkeeper'
    when p_account_type = 'accountant' then 'accountant'
    when v_intended = 'entrepreneur'   then 'entrepreneur'
    else 'starter'
  end::public.subscription_plan;

  -- Only a still-unpaid trial is reshaped; a paid (Stripe) subscription is
  -- never touched here.
  update public.subscriptions
     set plan                 = v_plan,
         org_id               = v_org_id,
         trial_started_at     = coalesce(trial_started_at, now()),
         trial_ends_at        = coalesce(trial_started_at, now())
                                + case when v_plan = 'starter' then interval '30 days' else interval '15 days' end,
         current_period_start = coalesce(trial_started_at, now()),
         current_period_end   = coalesce(trial_started_at, now())
                                + case when v_plan = 'starter' then interval '30 days' else interval '15 days' end,
         updated_at           = now()
   where user_id = v_uid
     and status = 'trialing'
     and stripe_subscription_id is null
  returning trial_ends_at into v_trial_end;

  if not found and not exists (select 1 from public.subscriptions where user_id = v_uid) then
    insert into public.subscriptions (
      user_id, org_id, plan, status, trial_started_at, trial_ends_at,
      current_period_start, current_period_end
    ) values (
      v_uid, v_org_id, v_plan, 'trialing', now(),
      now() + case when v_plan = 'starter' then interval '30 days' else interval '15 days' end,
      now(),
      now() + case when v_plan = 'starter' then interval '30 days' else interval '15 days' end
    )
    returning trial_ends_at into v_trial_end;
  end if;

  return jsonb_build_object(
    'org_id',           v_org_id,
    'account_type',     p_account_type,
    'plan',             v_plan,
    'trial_ends_at',    v_trial_end,
    'accounts_created', v_accounts,
    'already_completed', false
  );
end;
$$;

revoke all on function public.complete_account_setup(text, text, text) from public, anon;
grant execute on function public.complete_account_setup(text, text, text) to authenticated, service_role;

-- ── Trials end ──────────────────────────────────────────────────────────────
-- An expired, unpaid trial no longer counts: limits fall back to Starter
-- (the same rule check_feature_access already applied).

create or replace function public.get_org_plan_limits(p_org_id uuid)
returns table(plan text, plaid_connections_limit integer, ai_queries_limit integer,
              transactions_limit integer, receipts_limit integer, mileage_trips_limit integer,
              invoices_limit integer, storage_mb_limit integer, allow_overages_eligible boolean)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_plan     text := 'starter';
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
    v_plan := coalesce(v_plan, 'starter');
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

-- ── Signup: invitees skip the setup screen ──────────────────────────────────
-- Client-portal invitees and staff joining a firm were brought in by someone
-- else; there is nothing for them to set up. Everyone else (email or Google)
-- answers the setup screen once.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_email          text;
  v_display_name   text;
  v_first_name     text;
  v_account_type   text;
  v_workspace_name text;

  v_lp_code        text;
  v_tier           public.lp_user_tier := 'user';
  v_system_role    public.system_role  := 'bookkeeper';
  v_workspace_kind public.workspace_kind := 'pro';
  v_is_portal_invite boolean := false;
  v_skip_setup     boolean := false;

  v_org_id         uuid;
  v_org_slug       text;
  v_slug_attempt   int := 0;
begin
  v_email := lower(coalesce(new.email, ''));

  v_display_name := coalesce(
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    split_part(v_email, '@', 1)
  );

  v_first_name := split_part(v_display_name, ' ', 1);

  v_account_type := coalesce(
    new.raw_user_meta_data->>'account_type',
    new.raw_user_meta_data->>'accountType',
    'bookkeeper'
  );

  v_workspace_name := coalesce(
    nullif(new.raw_user_meta_data->>'workspace_name', ''),
    nullif(new.raw_user_meta_data->>'workspaceName', ''),
    nullif(new.raw_user_meta_data->>'company', ''),
    v_first_name || '''s workspace'
  );

  v_is_portal_invite := coalesce(
    (new.raw_user_meta_data->>'is_client_portal_invite')::boolean, false
  );
  v_skip_setup := v_is_portal_invite
    or coalesce((new.raw_user_meta_data->>'skip_setup')::boolean, false);

  if v_account_type = 'self_employed' then
    v_system_role    := 'client';
    v_workspace_kind := 'solo';
  elsif v_account_type = 'pyme_client' then
    v_system_role    := 'client';
    v_workspace_kind := 'pro';
  else
    v_system_role    := 'bookkeeper';
    v_workspace_kind := 'pro';
  end if;

  v_lp_code := 'LP-' || lpad((floor(random() * 9999999))::text, 7, '0');

  begin
    insert into public.profiles (
      id, email, display_name, lp_user_code,
      tier, tier_assigned_at,
      user_type, client_id,
      system_role, account_type, workspace_kind,
      is_active, created_at, updated_at, setup_completed_at
    ) values (
      new.id, v_email, v_display_name, v_lp_code,
      v_tier, now(),
      'staff_user', null,
      v_system_role,
      v_account_type::public.account_type,
      v_workspace_kind,
      true, now(), now(),
      case when v_skip_setup then now() end
    )
    on conflict (id) do update
      set email          = excluded.email,
          display_name   = coalesce(public.profiles.display_name, excluded.display_name),
          system_role    = coalesce(public.profiles.system_role, excluded.system_role),
          account_type   = coalesce(public.profiles.account_type, excluded.account_type),
          workspace_kind = coalesce(public.profiles.workspace_kind, excluded.workspace_kind);
  exception when others then
    raise warning '[handle_new_user] profile: % %', sqlstate, sqlerrm;
  end;

  begin
    insert into public.user_roles (user_id, role, granted_at, notes)
    values (new.id, v_system_role, now(), null)
    on conflict (user_id) do update
      set role = excluded.role
     where user_roles.role <> 'super_admin';
  exception when others then
    raise warning '[handle_new_user] user_roles: % %', sqlstate, sqlerrm;
  end;

  if not v_is_portal_invite then
    begin
      v_org_slug := public.lp_slugify(v_workspace_name);

      while v_slug_attempt < 10 loop
        exit when not exists (select 1 from public.organizations where slug = v_org_slug);
        v_slug_attempt := v_slug_attempt + 1;
        v_org_slug := public.lp_slugify(v_workspace_name) || '-' || v_slug_attempt::text;
      end loop;

      if exists (select 1 from public.organizations where slug = v_org_slug) then
        v_org_slug := v_org_slug || '-' || lpad((floor(random() * 9999))::text, 4, '0');
      end if;

      insert into public.organizations (
        name, slug, currency, fiscal_year_start, is_active, created_at, updated_at,
        is_personal, is_firm, is_client, is_accountant_firm
      ) values (
        v_workspace_name, v_org_slug, 'USD', 1, true, now(), now(),
        (v_account_type = 'self_employed'),
        (v_account_type in ('bookkeeper', 'accountant')),
        (v_account_type = 'pyme_client'),
        (v_account_type = 'accountant')
      )
      returning id into v_org_id;

    exception when others then
      raise warning '[handle_new_user] organization: % %', sqlstate, sqlerrm;
      v_org_id := null;
    end;

    if v_org_id is not null then
      begin
        insert into public.organization_memberships (
          org_id, user_id, role, is_active, created_at, updated_at
        ) values (
          v_org_id, new.id, 'owner', true, now(), now()
        )
        on conflict (org_id, user_id) do nothing;
      exception when others then
        raise warning '[handle_new_user] membership: % %', sqlstate, sqlerrm;
      end;

      begin
        insert into public.subscriptions (
          user_id, org_id, plan, status,
          trial_started_at, trial_ends_at,
          current_period_start, current_period_end,
          created_at, updated_at
        ) values (
          new.id, v_org_id, 'starter', 'trialing',
          now(), now() + interval '30 days',
          now(), now() + interval '30 days',
          now(), now()
        )
        on conflict do nothing;
      exception when others then
        raise warning '[handle_new_user] subscription: % %', sqlstate, sqlerrm;
      end;

      begin
        insert into public.org_billing_prefs (
          org_id, allow_overages, notify_at_pct, created_at, updated_at
        ) values (
          v_org_id, false, 80, now(), now()
        )
        on conflict (org_id) do nothing;
      exception when others then
        null;
      end;
    end if;
  end if;

  return new;

exception when others then
  raise warning '[handle_new_user] CRITICAL: % %', sqlstate, sqlerrm;
  return new;
end;
$$;
