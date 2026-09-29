-- Phase 4 (close): month-end close that works, in one click.
-- Applied as migration `phase4_period_close`. Reference copy.
--
-- Before (verified on the live schema):
--   · period_controls had RLS on and no policy: every write from the app failed.
--   · Its primary key included client_id (NOT NULL): the workspace's own books
--     (client_id NULL) could never be closed at all.
--   · get_period_status compared client_id = p_client_id, so NULL never
--     matched and every date read OPEN; the transaction / journal-line /
--     payment locks explicitly skipped client_id NULL ("legacy") -- nothing
--     was ever locked.
--   · Invoice and payment locks checked the CUSTOMER's books (invoices.
--     client_id is the customer), not the workspace's books they post to.
--   · Reopening required super_admin, which no customer has.
--
-- Now (the QuickBooks / Xero "closing date" model):
--   · close_books_through(org, client, year, month): one click closes that
--     month and every earlier month with activity. Refused while transactions
--     in the period wait in "For review" (LP003) or a draft journal batch is
--     dated in it (LP004); months that haven't started can't be closed (LP007).
--     Needs the plan's period_closing feature (LQ008).
--   · reopen_books_from(org, client, year, month, reason): an owner or admin
--     (LP005) reopens that month and every later one, with a reason (LP006);
--     period_lock_history keeps who and why.
--   · Writes dated in a closed month are refused everywhere (LP001), in the
--     workspace's own books too; adjustment-status months accept only
--     adjusting journal batches (LP002).
--   · period_controls / period_lock_history: readable by the org's members,
--     written only through the two functions above.

-- ── Schema: the workspace's own books can be closed too ─────────────────────

alter table public.period_controls drop constraint if exists period_controls_pkey;
alter table public.period_controls add column if not exists id uuid not null default gen_random_uuid();
alter table public.period_controls add primary key (id);
alter table public.period_controls alter column client_id drop not null;
create unique index if not exists ux_period_controls_scope
  on public.period_controls (org_id, client_id, period_year, period_month) nulls not distinct;

alter table public.period_lock_history alter column client_id drop not null;

create or replace function public.get_period_status(p_org_id uuid, p_client_id uuid, p_date date)
returns public.period_status
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select status from public.period_controls
     where org_id = p_org_id
       and client_id is not distinct from p_client_id
       and period_year  = extract(year  from p_date)::smallint
       and period_month = extract(month from p_date)::smallint), 'OPEN')
$$;

-- ── The locks ───────────────────────────────────────────────────────────────

create or replace function lp_private.raise_period_locked(p_date date, p_status public.period_status)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_status = 'CLOSED' then
    raise exception using errcode = 'LP001',
      message = format('%s is closed. Reopen it to make changes.', to_char(p_date, 'FMMonth YYYY')),
      detail  = jsonb_build_object('period', to_char(p_date, 'YYYY-MM'))::text;
  elsif p_status = 'ADJUSTMENT' then
    raise exception using errcode = 'LP002',
      message = format('%s is in adjustment: only adjusting journal entries are allowed.', to_char(p_date, 'FMMonth YYYY')),
      detail  = jsonb_build_object('period', to_char(p_date, 'YYYY-MM'))::text;
  end if;
end;
$$;

create or replace function public.enforce_period_lock_on_transactions()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  v_status public.period_status;
begin
  -- The old and the new date both matter: moving a line out of a closed
  -- month is as much a change to it as moving one in.
  for r in
    select distinct d, c from (values
      (case when tg_op <> 'INSERT' then old.transaction_date end, case when tg_op <> 'INSERT' then old.client_id end, tg_op <> 'INSERT'),
      (case when tg_op <> 'DELETE' then new.transaction_date end, case when tg_op <> 'DELETE' then new.client_id end, tg_op <> 'DELETE')
    ) as x(d, c, used) where used and d is not null
  loop
    v_status := public.get_period_status(coalesce(new.org_id, old.org_id), r.c, r.d);
    if v_status <> 'OPEN' then
      perform lp_private.raise_period_locked(r.d, v_status);
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_period_lock_on_journal_entries()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_row       public.journal_entries%rowtype;
  v_date      date;
  v_client_id uuid;
  v_org_id    uuid;
  v_kind      public.journal_entry_kind;
  v_status    public.period_status;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_row.transaction_id is not null then
    select t.client_id, t.transaction_date, t.org_id into v_client_id, v_date, v_org_id
      from public.transactions t where t.id = v_row.transaction_id;
  elsif v_row.batch_id is not null then
    select b.client_id, b.effective_date, b.org_id, b.entry_kind into v_client_id, v_date, v_org_id, v_kind
      from public.manual_journal_batches b where b.id = v_row.batch_id;
  end if;
  if v_date is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_status := public.get_period_status(v_org_id, v_client_id, v_date);
  if v_status = 'CLOSED'
     or (v_status = 'ADJUSTMENT'
         and coalesce(v_kind::text, 'transaction_linked') not in ('manual_adjustment', 'closing_entry', 'depreciation')) then
    perform lp_private.raise_period_locked(v_date, v_status);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_period_lock_on_batches()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_row    public.manual_journal_batches%rowtype;
  v_status public.period_status;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  -- Marking a posted batch reversed (its reversal is dated today) is not a
  -- change to the closed month itself.
  if tg_op = 'UPDATE' and new.status = 'reversed' and old.status = 'posted'
     and new.effective_date = old.effective_date then
    return new;
  end if;
  v_status := public.get_period_status(v_row.org_id, v_row.client_id, v_row.effective_date);
  if v_status = 'CLOSED'
     or (v_status = 'ADJUSTMENT' and v_row.entry_kind not in ('manual_adjustment', 'closing_entry', 'depreciation')) then
    perform lp_private.raise_period_locked(v_row.effective_date, v_status);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Invoices and their payments post to the workspace's OWN books (client_id
-- NULL); invoices.client_id is the customer, not a set of books.
create or replace function lp_private.invoice_posting_state(p_status public.invoice_status)
returns text
language sql immutable
as $$
  select case when p_status::text in ('draft', 'void') then p_status::text else 'posted' end
$$;

create or replace function public.enforce_period_lock_on_invoices()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_status public.period_status;
begin
  -- Only what changes the invoice's own journal entry is locked: its date,
  -- amounts, currency, or moving in/out of draft or void. A payment recorded
  -- today on an invoice issued in a closed month (sent -> paid) is not.
  if tg_op = 'UPDATE'
     and new.issue_date is not distinct from old.issue_date
     and new.total      is not distinct from old.total
     and new.tax_total  is not distinct from old.tax_total
     and new.currency   is not distinct from old.currency
     and lp_private.invoice_posting_state(new.status) = lp_private.invoice_posting_state(old.status) then
    return new;
  end if;
  if tg_op <> 'INSERT' and old.issue_date is not null and old.status::text <> 'draft' then
    v_status := public.get_period_status(old.org_id, null, old.issue_date);
    if v_status <> 'OPEN' then
      perform lp_private.raise_period_locked(old.issue_date, v_status);
    end if;
  end if;
  if tg_op <> 'DELETE' and new.issue_date is not null and new.status::text <> 'draft' then
    v_status := public.get_period_status(new.org_id, null, new.issue_date);
    if v_status <> 'OPEN' then
      perform lp_private.raise_period_locked(new.issue_date, v_status);
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_period_lock_on_invoice_payments()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  v_status public.period_status;
begin
  -- Linking a payment to the bank deposit that brought it in (transaction_id)
  -- doesn't change the payment: only amount, date and currency are locked.
  if tg_op = 'UPDATE'
     and new.amount is not distinct from old.amount
     and new.payment_date is not distinct from old.payment_date
     and new.currency is not distinct from old.currency then
    return new;
  end if;
  for r in
    select distinct d from (values
      (case when tg_op <> 'INSERT' then old.payment_date end),
      (case when tg_op <> 'DELETE' then new.payment_date end)) as x(d)
     where d is not null
  loop
    v_status := public.get_period_status(coalesce(new.org_id, old.org_id), null, r.d);
    if v_status <> 'OPEN' then
      perform lp_private.raise_period_locked(r.d, v_status);
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- ── Transitions: history, reasons, who may reopen ──────────────────────────

create or replace function public.enforce_period_transition()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_old public.period_status := case when tg_op = 'INSERT' then null else old.status end;
begin
  if tg_op = 'UPDATE' and v_old = new.status then
    return new;
  end if;
  if (new.status <> 'OPEN' or v_old = 'CLOSED')
     and (new.reason is null or length(btrim(new.reason)) < 5) then
    raise exception using errcode = 'LP006', message = 'Give a reason of at least 5 characters';
  end if;
  if v_old = 'CLOSED' and new.status <> 'CLOSED'
     and not (lp_private.is_trusted_caller() or public.is_super_admin()
              or public.has_org_role(new.org_id, array['owner', 'admin']::public.lp_role[])) then
    raise exception using errcode = 'LP005', message = 'Only an owner or admin can reopen a closed period';
  end if;

  new.updated_at := now();
  insert into public.period_lock_history (
    org_id, client_id, period_year, period_month, from_status, to_status,
    changed_by, changed_at, reason, is_super_admin_override
  ) values (
    new.org_id, new.client_id, new.period_year, new.period_month, v_old, new.status,
    new.updated_by, new.updated_at, new.reason,
    v_old = 'CLOSED' and public.is_super_admin()
      and not public.has_org_role(new.org_id, array['owner', 'admin']::public.lp_role[])
  );
  return new;
end;
$$;

-- ── One click ───────────────────────────────────────────────────────────────

-- What still stands between the books and a close through this month.
create or replace function public.get_close_checklist(
  p_org_id uuid, p_client_id uuid, p_year integer, p_month integer)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_end date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
begin
  perform lp_private.assert_org_access(p_org_id);
  return jsonb_build_object(
    'through', v_end,
    'to_review', (select count(*) from public.transactions t
                   where t.org_id = p_org_id and t.client_id is not distinct from p_client_id
                     and t.is_current and t.transaction_date <= v_end
                     and not exists (select 1 from public.journal_entries je
                                      where je.transaction_id = t.id and not je.is_reversed)),
    'draft_batches', (select count(*) from public.manual_journal_batches b
                       where b.org_id = p_org_id and b.client_id is not distinct from p_client_id
                         and b.status = 'draft' and b.effective_date <= v_end),
    'open_reconciliations', (select count(*) from public.reconciliation_sessions s
                              where s.org_id = p_org_id and s.client_id is not distinct from p_client_id
                                and s.status = 'open' and s.period_end <= v_end),
    'closed_through', (select max(make_date(period_year, period_month, 1) + interval '1 month - 1 day')::date
                         from public.period_controls
                        where org_id = p_org_id and client_id is not distinct from p_client_id
                          and status = 'CLOSED'));
end;
$$;

create or replace function public.close_books_through(
  p_org_id uuid, p_client_id uuid, p_year integer, p_month integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_target date := make_date(p_year, p_month, 1);
  v_end    date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_first  date;
  v_m      date;
  v_check  jsonb;
  v_n      integer := 0;
  v_reason text := 'Books closed through ' || to_char(make_date(p_year, p_month, 1), 'FMMonth YYYY');
begin
  perform lp_private.assert_org_access(p_org_id, array['owner', 'admin', 'accountant']::public.lp_role[]);
  perform lp_private.assert_plan_feature(p_org_id, 'period_closing', 'LQ008', 'Period closing');
  if p_client_id is not null and not exists (select 1 from public.clients where id = p_client_id and org_id = p_org_id) then
    raise exception 'That client is not part of this workspace' using errcode = '42501';
  end if;
  if v_target > date_trunc('month', current_date)::date then
    raise exception using errcode = 'LP007', message = 'Only months that have started can be closed';
  end if;

  v_check := public.get_close_checklist(p_org_id, p_client_id, p_year, p_month);
  if (v_check ->> 'to_review')::int > 0 then
    raise exception using errcode = 'LP003',
      message = format('%s transaction(s) up to %s are still waiting in For review. Categorize them before closing.',
                       v_check ->> 'to_review', to_char(v_end, 'FMMonth DD, YYYY')),
      detail  = jsonb_build_object('count', (v_check ->> 'to_review')::int, 'through', v_end)::text;
  end if;
  if (v_check ->> 'draft_batches')::int > 0 then
    raise exception using errcode = 'LP004',
      message = format('%s draft journal entr(ies) are dated up to %s. Post or delete them before closing.',
                       v_check ->> 'draft_batches', to_char(v_end, 'FMMonth DD, YYYY')),
      detail  = jsonb_build_object('count', (v_check ->> 'draft_batches')::int, 'through', v_end)::text;
  end if;

  -- Every month from the first with activity: a closing date is cumulative.
  select least(
           (select min(transaction_date) from public.transactions
             where org_id = p_org_id and client_id is not distinct from p_client_id),
           (select min(effective_date) from public.manual_journal_batches
             where org_id = p_org_id and client_id is not distinct from p_client_id),
           v_target)
    into v_first;
  v_m := date_trunc('month', v_first)::date;

  while v_m <= v_target loop
    update public.period_controls
       set status = 'CLOSED', updated_by = v_uid, reason = v_reason
     where org_id = p_org_id and client_id is not distinct from p_client_id
       and period_year = extract(year from v_m) and period_month = extract(month from v_m)
       and status <> 'CLOSED';
    if not found and not exists (
      select 1 from public.period_controls
       where org_id = p_org_id and client_id is not distinct from p_client_id
         and period_year = extract(year from v_m) and period_month = extract(month from v_m)) then
      insert into public.period_controls (org_id, client_id, period_year, period_month, status, updated_by, reason)
      values (p_org_id, p_client_id, extract(year from v_m), extract(month from v_m), 'CLOSED', v_uid, v_reason);
      v_n := v_n + 1;
    elsif found then
      v_n := v_n + 1;
    end if;
    v_m := (v_m + interval '1 month')::date;
  end loop;

  return jsonb_build_object('closed_through', v_end, 'months_closed', v_n,
                            'open_reconciliations', (v_check ->> 'open_reconciliations')::int);
end;
$$;

create or replace function public.reopen_books_from(
  p_org_id uuid, p_client_id uuid, p_year integer, p_month integer, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  perform lp_private.assert_org_access(p_org_id);
  if not (public.is_super_admin() or public.has_org_role(p_org_id, array['owner', 'admin']::public.lp_role[])) then
    raise exception using errcode = 'LP005', message = 'Only an owner or admin can reopen a closed period';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception using errcode = 'LP006', message = 'Give a reason of at least 5 characters';
  end if;

  -- Reopening a month reopens every later one: the closing date moves back.
  update public.period_controls
     set status = 'OPEN', updated_by = v_uid, reason = btrim(p_reason)
   where org_id = p_org_id and client_id is not distinct from p_client_id
     and status <> 'OPEN'
     and make_date(period_year, period_month, 1) >= make_date(p_year, p_month, 1);
  get diagnostics v_n = row_count;

  return jsonb_build_object('reopened_from', make_date(p_year, p_month, 1), 'months_reopened', v_n);
end;
$$;

-- ── Access ──────────────────────────────────────────────────────────────────

drop policy if exists period_controls_select_members on public.period_controls;
create policy period_controls_select_members on public.period_controls
  for select to authenticated using (public.is_org_member(org_id) or public.is_super_admin());
drop policy if exists period_lock_history_select_members on public.period_lock_history;
create policy period_lock_history_select_members on public.period_lock_history
  for select to authenticated using (public.is_org_member(org_id) or public.is_super_admin());

revoke insert, update, delete on public.period_controls    from authenticated, anon;
revoke insert, update, delete on public.period_lock_history from authenticated, anon;

revoke all on function lp_private.raise_period_locked(date, public.period_status)          from public, anon, authenticated;
revoke all on function lp_private.invoice_posting_state(public.invoice_status)            from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;
revoke all on function public.get_close_checklist(uuid, uuid, integer, integer)           from public, anon;
revoke all on function public.close_books_through(uuid, uuid, integer, integer)           from public, anon;
revoke all on function public.reopen_books_from(uuid, uuid, integer, integer, text)       from public, anon;
grant execute on function public.get_close_checklist(uuid, uuid, integer, integer)        to authenticated, service_role;
grant execute on function public.close_books_through(uuid, uuid, integer, integer)        to authenticated, service_role;
grant execute on function public.reopen_books_from(uuid, uuid, integer, integer, text)    to authenticated, service_role;

-- ── Closing date (applied as period_close_closing_date, 2026-09-28) ──────────
-- Found live: closing through August left July (and every month before the
-- first activity) OPEN. A month with no row of its own takes the status of the
-- closing date: CLOSED when a later month in the same books is CLOSED.
create or replace function public.get_period_status(p_org_id uuid, p_client_id uuid, p_date date)
returns period_status
language sql stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select status from public.period_controls
      where org_id = p_org_id
        and client_id is not distinct from p_client_id
        and period_year  = extract(year  from p_date)::smallint
        and period_month = extract(month from p_date)::smallint),
    (select 'CLOSED'::public.period_status from public.period_controls
      where org_id = p_org_id
        and client_id is not distinct from p_client_id
        and status = 'CLOSED'
        and make_date(period_year, period_month, 1) > date_trunc('month', p_date)::date
      limit 1),
    'OPEN')
$function$;
