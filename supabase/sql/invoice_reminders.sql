-- Invoice reminders + the scheduler that emails invoices on its own.
-- Applied 2026-09-25 as migrations `invoice_reminders_and_scheduler` and
-- `valid_overdue_days_fixed_search_path`. Kept here as the reference copy.
--
-- Emails are sent by the `invoice-scheduler` edge function (verify_jwt OFF),
-- called by pg_cron through pg_net and authenticated by a shared secret in
-- Vault. Schedule (run once, after the function is deployed):
--
--   select cron.schedule('invoice-initial-emails', '30 6 * * *', $$select net.http_post(
--     url:='https://<project-ref>.supabase.co/functions/v1/invoice-scheduler',
--     headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-secret',
--       (select decrypted_secret from vault.decrypted_secrets where name='invoice_scheduler_secret')),
--     body:='{"mode":"initial"}'::jsonb)$$);
--   select cron.schedule('invoice-reminders-daily', '0 14 * * *', $$select net.http_post(
--     url:='https://<project-ref>.supabase.co/functions/v1/invoice-scheduler',
--     headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-secret',
--       (select decrypted_secret from vault.decrypted_secrets where name='invoice_scheduler_secret')),
--     body:='{"mode":"all"}'::jsonb)$$);

create extension if not exists pg_net;

create or replace function public.valid_overdue_days(p integer[])
returns boolean language sql immutable set search_path = public, pg_catalog as $$
  select p is not null
     and coalesce(cardinality(p), 0) <= 6
     and not exists (select 1 from unnest(p) d where d is null or d < 1 or d > 90)
$$;

-- Per-firm reminder policy. Off until a firm turns it on.
create table public.invoice_reminder_settings (
  org_id       uuid primary key references public.organizations(id) on delete cascade,
  enabled      boolean not null default false,
  days_before  integer not null default 3 check (days_before between 0 and 30),
  on_due       boolean not null default true,
  overdue_days integer[] not null default '{3,7,14}' check (public.valid_overdue_days(overdue_days)),
  updated_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now()
);
alter table public.invoice_reminder_settings enable row level security;
create policy irs_select on public.invoice_reminder_settings for select using (
  exists (select 1 from public.organization_memberships m
           where m.org_id = invoice_reminder_settings.org_id and m.user_id = auth.uid())
  or public.is_super_admin());

-- What was emailed, so nothing is ever sent twice. Written only by the scheduler.
create table public.invoice_email_log (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  kind        text not null check (kind in ('initial','before_due','on_due','overdue')),
  day_offset  integer not null default 0,
  sent_to     text,
  sent_at     timestamptz not null default now(),
  unique (invoice_id, kind, day_offset)
);
create index invoice_email_log_org_idx on public.invoice_email_log (org_id, sent_at desc);
alter table public.invoice_email_log enable row level security;
create policy iel_select on public.invoice_email_log for select using (
  exists (select 1 from public.organization_memberships m
           where m.org_id = invoice_email_log.org_id and m.user_id = auth.uid())
  or public.is_super_admin());

grant select on public.invoice_reminder_settings, public.invoice_email_log to authenticated;
grant all on public.invoice_reminder_settings, public.invoice_email_log to service_role;

-- The only way to change the policy: checks the role and the values.
create or replace function public.set_invoice_reminder_settings(
  p_org_id uuid, p_enabled boolean, p_days_before integer,
  p_on_due boolean, p_overdue_days integer[]
) returns public.invoice_reminder_settings
language plpgsql security definer set search_path = public as $$
declare v public.invoice_reminder_settings;
begin
  if not (public.has_org_role(p_org_id, array['owner','admin','accountant']::lp_role[]) or public.is_super_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_days_before is null or p_days_before < 0 or p_days_before > 30 then
    raise exception 'days_before must be between 0 and 30' using errcode = '22023';
  end if;
  p_overdue_days := coalesce(
    (select array_agg(distinct d order by d) from unnest(p_overdue_days) d), '{}');
  if not public.valid_overdue_days(p_overdue_days) then
    raise exception 'overdue_days: up to 6 values between 1 and 90' using errcode = '22023';
  end if;
  insert into public.invoice_reminder_settings as s
    (org_id, enabled, days_before, on_due, overdue_days, updated_by, updated_at)
  values (p_org_id, coalesce(p_enabled,false), p_days_before, coalesce(p_on_due,true), p_overdue_days, auth.uid(), now())
  on conflict (org_id) do update set
    enabled = excluded.enabled, days_before = excluded.days_before, on_due = excluded.on_due,
    overdue_days = excluded.overdue_days, updated_by = auth.uid(), updated_at = now()
  returning * into v;
  return v;
end $$;
revoke all on function public.set_invoice_reminder_settings(uuid,boolean,integer,boolean,integer[]) from public, anon;
grant execute on function public.set_invoice_reminder_settings(uuid,boolean,integer,boolean,integer[]) to authenticated;

-- Shared secret the cron sends to the scheduler function (kept in Vault).
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'invoice_scheduler_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'invoice_scheduler_secret');
  end if;
end $$;

create or replace function public.verify_scheduler_secret(p text)
returns boolean language sql security definer set search_path = public as $$
  select coalesce(p, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'invoice_scheduler_secret' and decrypted_secret = p)
$$;
revoke all on function public.verify_scheduler_secret(text) from public, anon, authenticated;
grant execute on function public.verify_scheduler_secret(text) to service_role;
