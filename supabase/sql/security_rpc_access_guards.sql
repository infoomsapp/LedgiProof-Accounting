-- Security: access guards on RPCs that trusted their caller.
-- Applied 2026-09-27 as migration `security_rpc_access_guards`. Kept here as the
-- reference copy.
--
-- Every function below was SECURITY DEFINER, executable by `anon` through
-- /rest/v1/rpc, and never checked who was calling -- so anyone holding the
-- public anon key could read another firm's P&L, close its reconciliations,
-- write into its decision hash-chain, or bump its usage meters.
--
-- Pattern for the long functions: the original body is moved untouched into
-- the private schema `lp_private` (not exposed by PostgREST) and a wrapper
-- with the SAME name and signature takes its place in `public`. The wrapper
-- checks access and then delegates, so existing callers (web, mobile, edge
-- functions, other SQL functions, triggers) keep working unchanged.
--
-- "Trusted" callers skip the membership check: the service role (edge
-- functions using the service key) and internal sessions with no JWT at all
-- (pg_cron, migrations). Every PostgREST request -- anon included -- carries
-- JWT claims, so a browser can never look "internal".

create schema if not exists lp_private;
revoke all on schema lp_private from public, anon, authenticated;
grant usage on schema lp_private to service_role;

-- ── Helpers ─────────────────────────────────────────────────────────────────

create or replace function lp_private.is_trusted_caller()
returns boolean
language sql stable
set search_path = public
as $$
  select auth.jwt() is null
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- Raises 42501 unless the caller may act on p_org_id.
--   p_roles       NULL = any active member; otherwise one of these roles.
--   p_allow_portal also admits an active client-portal user of that org.
create or replace function lp_private.assert_org_access(
  p_org_id       uuid,
  p_roles        public.lp_role[] default null,
  p_allow_portal boolean          default false
)
returns void
language plpgsql stable
set search_path = public
as $$
begin
  if lp_private.is_trusted_caller() then
    return;
  end if;
  if auth.uid() is null then
    raise exception 'unauthorized: no session' using errcode = '42501';
  end if;
  if public.is_super_admin() then
    return;
  end if;
  if p_roles is null then
    if public.is_org_member(p_org_id) then return; end if;
  elsif public.has_org_role(p_org_id, p_roles) then
    return;
  end if;
  if p_allow_portal and exists (
    select 1 from public.client_portal_users cpu
     where cpu.org_id = p_org_id
       and cpu.profile_id = auth.uid()
       and cpu.is_active = true
  ) then
    return;
  end if;
  raise exception 'unauthorized: no access to this organization' using errcode = '42501';
end;
$$;

-- Raises 42501 unless p_user_id is the caller (or the caller is trusted).
create or replace function lp_private.assert_is_caller(p_user_id uuid)
returns void
language plpgsql stable
set search_path = public
as $$
begin
  if lp_private.is_trusted_caller() then
    return;
  end if;
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'unauthorized: user id does not match the session' using errcode = '42501';
  end if;
end;
$$;

-- ── Move the original bodies out of the API ─────────────────────────────────

alter function public.check_feature_access(uuid, text)                 rename to check_feature_access_impl;
alter function public.check_quota(uuid, public.usage_metric, numeric)  rename to check_quota_impl;
alter function public.close_reconciliation_session(uuid, uuid)         rename to close_reconciliation_session_impl;
alter function public.compute_invoice_totals(uuid)                     rename to compute_invoice_totals_impl;
alter function public.get_firm_client_summary(uuid, integer, integer)  rename to get_firm_client_summary_impl;
alter function public.increment_feature_usage(uuid, text, integer)     rename to increment_feature_usage_impl;
alter function public.increment_usage(uuid, public.usage_metric, numeric) rename to increment_usage_impl;
alter function public.next_estimate_number(uuid)                       rename to next_estimate_number_impl;
alter function public.next_invoice_number(uuid)                        rename to next_invoice_number_impl;
alter function public.seed_chart_of_accounts(uuid, uuid)               rename to seed_chart_of_accounts_impl;

alter function public.check_feature_access_impl(uuid, text)                 set schema lp_private;
alter function public.check_quota_impl(uuid, public.usage_metric, numeric)  set schema lp_private;
alter function public.close_reconciliation_session_impl(uuid, uuid)         set schema lp_private;
alter function public.compute_invoice_totals_impl(uuid)                     set schema lp_private;
alter function public.get_firm_client_summary_impl(uuid, integer, integer)  set schema lp_private;
alter function public.increment_feature_usage_impl(uuid, text, integer)     set schema lp_private;
alter function public.increment_usage_impl(uuid, public.usage_metric, numeric) set schema lp_private;
alter function public.next_estimate_number_impl(uuid)                       set schema lp_private;
alter function public.next_invoice_number_impl(uuid)                        set schema lp_private;
alter function public.seed_chart_of_accounts_impl(uuid, uuid)               set schema lp_private;

-- check_quota writes usage_excess_events on the overage path; it was declared
-- STABLE, which makes that INSERT fail exactly when a customer goes over.
alter function lp_private.check_quota_impl(uuid, public.usage_metric, numeric) volatile;

-- ── Guarded wrappers (same names and signatures as before) ──────────────────

create or replace function public.get_firm_client_summary(
  p_org_id uuid, p_as_of_year integer, p_as_of_month integer default 12)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform lp_private.assert_org_access(p_org_id);
  return lp_private.get_firm_client_summary_impl(p_org_id, p_as_of_year, p_as_of_month);
end;
$$;

create or replace function public.close_reconciliation_session(p_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id from public.reconciliation_sessions where id = p_session_id;
  if not found then
    raise exception 'Session % not found', p_session_id;
  end if;
  -- Same roles the reconciliation_sessions UPDATE policy allows.
  perform lp_private.assert_org_access(v_org_id, array['owner','admin','accountant']::public.lp_role[]);
  -- closed_by / reconciled_by / the audit events are stamped with p_user_id.
  perform lp_private.assert_is_caller(p_user_id);
  return lp_private.close_reconciliation_session_impl(p_session_id, p_user_id);
end;
$$;

create or replace function public.compute_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id from public.invoices where id = p_invoice_id;
  if not found then
    return;  -- nothing to recompute (the original was a silent no-op too)
  end if;
  perform lp_private.assert_org_access(v_org_id);
  perform lp_private.compute_invoice_totals_impl(p_invoice_id);
end;
$$;

create or replace function public.check_quota(
  p_org_id uuid, p_metric public.usage_metric, p_amount numeric default 1)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  -- Portal clients are admitted: the bank-connection quota trigger runs this
  -- when a client connects a bank from the portal.
  perform lp_private.assert_org_access(p_org_id, null, true);
  return lp_private.check_quota_impl(p_org_id, p_metric, p_amount);
end;
$$;

create or replace function public.increment_usage(
  p_org_id uuid, p_metric public.usage_metric, p_amount numeric default 1)
returns numeric
language plpgsql security definer
set search_path = public
as $$
begin
  perform lp_private.assert_org_access(p_org_id, null, true);
  return lp_private.increment_usage_impl(p_org_id, p_metric, p_amount);
end;
$$;

create or replace function public.check_feature_access(p_user_id uuid, p_feature_key text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  perform lp_private.assert_is_caller(p_user_id);
  return lp_private.check_feature_access_impl(p_user_id, p_feature_key);
end;
$$;

create or replace function public.increment_feature_usage(
  p_user_id uuid, p_feature_key text, p_increment integer default 1)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform lp_private.assert_is_caller(p_user_id);
  perform lp_private.increment_feature_usage_impl(p_user_id, p_feature_key, p_increment);
end;
$$;

create or replace function public.next_invoice_number(p_org_id uuid)
returns character varying
language plpgsql security definer
set search_path = public
as $$
begin
  perform lp_private.assert_org_access(p_org_id);
  return lp_private.next_invoice_number_impl(p_org_id);
end;
$$;

create or replace function public.next_estimate_number(p_org_id uuid)
returns character varying
language plpgsql security definer
set search_path = public
as $$
begin
  perform lp_private.assert_org_access(p_org_id);
  return lp_private.next_estimate_number_impl(p_org_id);
end;
$$;

create or replace function public.seed_chart_of_accounts(p_org_id uuid, p_user_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
begin
  perform lp_private.assert_org_access(p_org_id, array['owner','admin','accountant']::public.lp_role[]);
  perform lp_private.assert_is_caller(p_user_id);
  return lp_private.seed_chart_of_accounts_impl(p_org_id, p_user_id);
end;
$$;

-- ── Short functions: guarded in place ───────────────────────────────────────

create or replace function public.get_fx_gains_losses(p_org_id uuid)
returns table(invoice_id uuid, invoice_number text, client_name text, currency text,
              invoice_amount numeric, fx_rate_at_creation numeric, payment_amount numeric,
              fx_rate_at_payment numeric, invoice_basis_usd numeric, payment_usd numeric,
              gain_loss_usd numeric, payment_date date)
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform lp_private.assert_org_access(p_org_id);
  return query
  select
    i.id,
    i.invoice_number::text,
    c.display_name::text                                              as client_name,
    i.currency::text,
    i.total                                                           as invoice_amount,
    i.fx_rate_at_creation,
    ip.amount                                                         as payment_amount,
    ip.fx_rate_at_payment,
    round(i.total   / nullif(i.fx_rate_at_creation, 0), 2)            as invoice_basis_usd,
    round(ip.amount / nullif(ip.fx_rate_at_payment,  0), 2)           as payment_usd,
    round(
      ip.amount / nullif(ip.fx_rate_at_payment,  0) -
      i.total   / nullif(i.fx_rate_at_creation, 0),
    2)                                                                as gain_loss_usd,
    ip.payment_date
  from  public.invoices          i
  join  public.clients           c  on c.id  = i.client_id
  join  public.invoice_payments  ip on ip.invoice_id = i.id
  where i.org_id              = p_org_id
    and i.currency           <> 'USD'
    and i.fx_rate_at_creation is not null
    and ip.fx_rate_at_payment  is not null
    and abs(
      ip.amount / nullif(ip.fx_rate_at_payment,  0) -
      i.total   / nullif(i.fx_rate_at_creation, 0)
    ) > 0.01
  order by ip.payment_date desc;
end;
$$;

create or replace function public.record_human_decision(
  p_org_id uuid, p_actor_id uuid, p_actor_role text, p_decision_type text,
  p_transaction_id uuid default null, p_suggestion_id uuid default null,
  p_before_state jsonb default '{}'::jsonb, p_after_state jsonb default '{}'::jsonb,
  p_reason text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id            uuid := gen_random_uuid();
  v_previous_hash char(64);
  v_proof_hash    char(64);
  v_now           timestamptz := now();
begin
  -- Same roles the decisions INSERT policy allows; the actor stamped into the
  -- hash chain must be the caller.
  perform lp_private.assert_org_access(p_org_id, array['owner','admin','accountant','approver']::public.lp_role[]);
  perform lp_private.assert_is_caller(p_actor_id);

  if p_transaction_id is not null and not exists (
    select 1 from public.transactions where id = p_transaction_id and org_id = p_org_id
  ) then
    raise exception 'transaction does not belong to this organization' using errcode = '42501';
  end if;

  -- Serialize writers per org so two decisions can't chain off the same parent.
  perform pg_advisory_xact_lock(hashtextextended('decisions:' || p_org_id::text, 0));

  select proof_hash into v_previous_hash
    from public.decisions
   where org_id = p_org_id
   order by created_at desc, id desc
   limit 1;

  v_proof_hash := public.sha256_text(
    coalesce(v_previous_hash, '') || '|' ||
    v_id::text                    || '|' ||
    p_org_id::text                || '|' ||
    p_actor_id::text              || '|' ||
    p_decision_type               || '|' ||
    coalesce(p_transaction_id::text, '') || '|' ||
    v_now::text
  );

  insert into public.decisions (
    id, org_id, transaction_id, suggestion_id,
    actor_id, actor_role, decision_type,
    before_state, after_state, reason,
    proof_hash, previous_hash, created_at
  ) values (
    v_id, p_org_id, p_transaction_id, p_suggestion_id,
    p_actor_id, p_actor_role, p_decision_type,
    p_before_state, p_after_state, p_reason,
    v_proof_hash, v_previous_hash, v_now
  );

  return v_id;
end;
$$;

-- Was: trusted p_requesting_admin_id, and returned `v_target.email` -- a
-- variable that doesn't exist, so it failed at runtime on every call.
create or replace function public.assign_tester(p_target_user_id uuid, p_requesting_admin_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_requester_tier text;
  v_target_email   text;
  v_target_code    varchar(20);
  v_new_code       varchar(20);
begin
  if p_requesting_admin_id is distinct from auth.uid() then
    raise exception 'p_requesting_admin_id does not match the authenticated user';
  end if;

  select tier into v_requester_tier from public.profiles where id = auth.uid();
  if v_requester_tier is distinct from 'admin' then
    raise exception 'Only admins can assign tester tier';
  end if;

  select email, lp_user_code into v_target_email, v_target_code
    from public.profiles where id = p_target_user_id;
  if not found then raise exception 'Target user not found'; end if;

  v_new_code := public.generate_lp_user_code('tester');

  update public.profiles
     set tier             = 'tester',
         lp_user_code     = v_new_code,
         tier_assigned_at = now(),
         tier_assigned_by = auth.uid(),
         updated_at       = now()
   where id = p_target_user_id;

  return jsonb_build_object(
    'user_id',     p_target_user_id,
    'email',       v_target_email,
    'old_code',    v_target_code,
    'new_code',    v_new_code,
    'assigned_by', auth.uid()
  );
end;
$$;

-- ── Signup no longer mints a super admin by email address ───────────────────
-- Anyone who registered support@ledgiproof.com first (the account didn't
-- exist) became super_admin. Super admins are now granted explicitly
-- (grant_role, or SQL by the project owner) -- never by signup metadata.

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
      is_active, created_at, updated_at
    ) values (
      new.id, v_email, v_display_name, v_lp_code,
      v_tier, now(),
      'staff_user', null,
      v_system_role,
      v_account_type::public.account_type,
      v_workspace_kind,
      true, now(), now()
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

  -- Organization bootstrap -- skipped for client-portal-invite signups.
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
          now(), now() + interval '14 days',
          now(), now() + interval '1 month',
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

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Functions are executable by PUBLIC by default; spell out who may call what.

-- Private bodies: only reachable through the wrappers (which run as owner).
revoke all on all functions in schema lp_private from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;

-- Guarded wrappers: signed-in users only (the guard does the rest).
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_firm_client_summary(uuid, integer, integer)',
    'public.close_reconciliation_session(uuid, uuid)',
    'public.compute_invoice_totals(uuid)',
    'public.check_quota(uuid, public.usage_metric, numeric)',
    'public.increment_usage(uuid, public.usage_metric, numeric)',
    'public.check_feature_access(uuid, text)',
    'public.increment_feature_usage(uuid, text, integer)',
    'public.next_invoice_number(uuid)',
    'public.next_estimate_number(uuid)',
    'public.seed_chart_of_accounts(uuid, uuid)',
    'public.get_fx_gains_losses(uuid)',
    'public.record_human_decision(uuid, uuid, text, text, uuid, uuid, jsonb, jsonb, text)',
    'public.assign_tester(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Internal-only: called from other SQL functions / triggers (which run as the
-- owner), never from a client.
revoke all on function public.accept_document_and_close(uuid, uuid, smallint) from public, anon, authenticated;
revoke all on function public.lp_recompute_estimate_totals(uuid)            from public, anon, authenticated;
revoke all on function public.mark_overdue_invoices()                       from public, anon, authenticated;
revoke all on function public.get_org_plan_limits(uuid)                     from public, anon, authenticated;
revoke all on function public.compute_workflow_state(uuid)                  from public, anon, authenticated;

-- Needed by signed-in users through invoker triggers / security_invoker views
-- or harmless reads, but never by anonymous visitors.
revoke all on function public.mark_read_model_dirty(uuid, text[])           from public, anon;
revoke all on function public.resolve_client_for_transaction(uuid)          from public, anon;
revoke all on function public.get_period_status(uuid, uuid, date)           from public, anon;
revoke all on function public.encrypt_tin(text)                             from public, anon;
grant execute on function public.mark_read_model_dirty(uuid, text[])        to authenticated, service_role;
grant execute on function public.resolve_client_for_transaction(uuid)       to authenticated, service_role;
grant execute on function public.get_period_status(uuid, uuid, date)        to authenticated, service_role;
grant execute on function public.encrypt_tin(text)                          to authenticated, service_role;

-- The scheduler-secret check is only ever called by an edge function using
-- the service key.
revoke all on function public.verify_scheduler_secret(text) from public, anon, authenticated;
grant execute on function public.verify_scheduler_secret(text) to service_role;
