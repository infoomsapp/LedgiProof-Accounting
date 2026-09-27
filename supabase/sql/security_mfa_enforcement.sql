-- Security: enforce MFA on the server, not just in the React router.
-- Applied 2026-09-27 as migration `security_mfa_enforcement`. Kept here as the
-- reference copy.
--
-- Before this, MFA only lived in the web client: a password-only (aal1)
-- session got full data access through the REST API, the mobile app, or even
-- the web app after a page reload. A session now counts as "MFA satisfied"
-- when it is aal2, or when the user has no verified factor at all (MFA is
-- opt-in / enforced per role by the enrollment wall in AppShell).
--
-- Three layers, because no single one covers every door:
--   1. PostgREST pre-request hook -- every REST and RPC call, including
--      SECURITY DEFINER functions that bypass RLS.
--   2. A RESTRICTIVE policy on every RLS table in `public` -- Realtime
--      (postgres_changes) evaluates RLS but never runs the pre-request hook.
--   3. A RESTRICTIVE policy on storage.objects -- the Storage API talks to
--      Postgres directly, also without the hook.
-- Service-role and internal (no-JWT) callers are unaffected.
--
-- Rollback: `alter role authenticator reset pgrst.db_pre_request; notify pgrst,
-- 'reload config';` and drop the `mfa_satisfied` policies.

create or replace function public.lp_mfa_satisfied()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or auth.uid() is null
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid()
           and f.status  = 'verified'
      )
$$;

revoke all on function public.lp_mfa_satisfied() from public;
grant execute on function public.lp_mfa_satisfied() to anon, authenticated, service_role;

-- 1. Pre-request hook ---------------------------------------------------------

create or replace function public.lp_pre_request()
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
     and not public.lp_mfa_satisfied() then
    raise exception 'mfa_required'
      using errcode = '42501',
            hint    = 'Complete two-factor verification to continue.';
  end if;
end;
$$;

revoke all on function public.lp_pre_request() from public;
grant execute on function public.lp_pre_request() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.lp_pre_request';
notify pgrst, 'reload config';

-- 2. Restrictive policy on every RLS table in public --------------------------
-- `(select ...)` makes Postgres evaluate it once per statement, not per row.

do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relrowsecurity
  loop
    execute format('drop policy if exists mfa_satisfied on public.%I', t.relname);
    execute format(
      'create policy mfa_satisfied on public.%I as restrictive for all to authenticated '
      'using ((select public.lp_mfa_satisfied())) with check ((select public.lp_mfa_satisfied()))',
      t.relname);
  end loop;
end $$;

-- 3. Storage ------------------------------------------------------------------

drop policy if exists mfa_satisfied on storage.objects;
create policy mfa_satisfied on storage.objects
  as restrictive for all to authenticated
  using ((select public.lp_mfa_satisfied()))
  with check ((select public.lp_mfa_satisfied()));
