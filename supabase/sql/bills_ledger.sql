-- Bills post themselves to the ledger (accounts payable), mirroring how
-- phase3_invoices_ledger handles invoices -- same batches, same reversal
-- rules, same review-inbox matching, so a payment is never counted twice.
-- Applied as migrations `bills_entry_kinds` (enum values, committed first)
-- and `bills_ledger`. Kept here as the reference copy.
--
-- Before: vendor_bills only tracked amount / due date / "paid"; nothing
-- reached journal_entries -- no accounts payable on the balance sheet, and a
-- bill's expense appeared only if its bank withdrawal was categorized by hand.
--
-- Now (the workspace's own books, client_id NULL -- same scope as invoices):
--   · Entering a bill                       Dr expense account     amount
--                                           Cr Accounts Payable    amount
--     (on bill_date). Changing the amount, account or date of an unpaid bill
--     reverses that batch and posts a new one; deleting an unpaid bill
--     reverses it. A paid bill can't be changed or deleted.
--   · "Mark paid" (paid outside the app)    Dr Accounts Payable
--                                           Cr Bill Payments in Transit
--     "Mark unpaid" reverses it (only while no bank withdrawal is matched).
--   · The bank withdrawal, in the review inbox, is suggested as
--       "Payment for bill #X · Vendor" (an open bill, exact amount)
--          -> Dr AP Cr Bank, and the bill is marked paid (paid_via 'bank');
--       "Withdrawal of the payment for bill #X" (a bill marked paid, amount
--          in transit) -> Dr Bill Payments in Transit Cr Bank.
--     Either way the bank line clears exactly what the bill left open.
--   · The expense account defaults to the vendor's default expense account,
--     else "Uncategorized Expense". AP / In Transit / Uncategorized are found
--     by name in the chart, or created once.
--
-- Error codes (one per distinct error; see src/lib/errors.ts):
--   LB001 client-scoped bill   LB002 account not in chart   LB003 heading
--   LB004 partial payment      LB005 paid bill changed      LB006 matched
--   LB007 paid bill deleted    LB008 amount <= 0
--   (LB009, plan doesn't include bill tracking: plan_limits_server.sql)

-- ── Schema ──────────────────────────────────────────────────────────────────

alter table public.vendor_bills
  add column if not exists bill_date          date not null default current_date,
  add column if not exists expense_account_id uuid references public.accounts(id) on delete restrict,
  add column if not exists transaction_id     uuid references public.transactions(id) on delete restrict,
  add column if not exists paid_via           text;

alter table public.vendor_bills drop constraint if exists vendor_bills_paid_via_check;
alter table public.vendor_bills add constraint vendor_bills_paid_via_check
  check (paid_via is null or paid_via in ('manual', 'bank'));

create unique index if not exists vendor_bills_transaction_key
  on public.vendor_bills (transaction_id) where transaction_id is not null;

-- No FK: the batches (and their reversals) outlive a deleted bill in the audit trail.
alter table public.manual_journal_batches add column if not exists source_bill_id uuid;
create index if not exists ix_mjb_source_bill on public.manual_journal_batches (source_bill_id)
  where source_bill_id is not null;

-- ── Batches carry the bill they come from ───────────────────────────────────
-- A posted batch is immutable (enforce_batch_immutable_when_posted), so the
-- bill link must be written when the batch is created, and reversals keep it.

drop function if exists lp_private.post_ledger_batch(uuid, public.journal_entry_kind, date, text, uuid, text, jsonb, uuid, uuid, uuid, uuid);

create or replace function lp_private.post_ledger_batch(
  p_org_id     uuid,
  p_kind       public.journal_entry_kind,
  p_date       date,
  p_memo       text,
  p_user       uuid,
  p_currency   text,
  p_lines      jsonb,
  p_invoice_id uuid default null,
  p_payment_id uuid default null,
  p_reverses   uuid default null,
  p_client_id  uuid default null,
  p_bill_id    uuid default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_batch uuid;
  v_now   timestamptz := clock_timestamp();
begin
  insert into public.manual_journal_batches (
    org_id, client_id, entry_kind, effective_date, period_year, period_month,
    memo, prepared_by, status, source_invoice_id, source_payment_id, source_bill_id, reverses_batch_id
  ) values (
    p_org_id, p_client_id, p_kind, p_date,
    extract(year from p_date)::smallint, extract(month from p_date)::smallint,
    p_memo, p_user, 'draft', p_invoice_id, p_payment_id, p_bill_id, p_reverses
  ) returning id into v_batch;

  insert into public.journal_entries (
    batch_id, entry_kind, account_id, entry_type, amount, amount_usd,
    currency, memo, period_year, period_month
  )
  select v_batch, p_kind, (l ->> 'account_id')::uuid, (l ->> 'entry_type')::public.entry_type_enum,
         round((l ->> 'amount')::numeric, 2), round((l ->> 'amount_usd')::numeric, 2),
         upper(coalesce(p_currency, 'USD')), coalesce(nullif(l ->> 'memo', ''), p_memo),
         extract(year from p_date)::int, extract(month from p_date)::int
    from jsonb_array_elements(p_lines) l
   where round((l ->> 'amount')::numeric, 2) > 0;

  update public.manual_journal_batches
     set status = 'posted', posted_at = v_now, posted_by = p_user,
         approved_by = p_user, approved_at = v_now
   where id = v_batch;
  return v_batch;
end;
$$;

create or replace function lp_private.reverse_ledger_batch(p_batch_id uuid, p_user uuid, p_date date, p_memo text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  b     public.manual_journal_batches%rowtype;
  v_new uuid;
  v_cur text;
begin
  select * into b from public.manual_journal_batches where id = p_batch_id for update;
  if b.status <> 'posted' then
    return null;
  end if;
  select max(currency) into v_cur from public.journal_entries where batch_id = b.id;

  v_new := lp_private.post_ledger_batch(
    b.org_id, b.entry_kind, greatest(p_date, b.effective_date), p_memo, p_user, v_cur,
    (select jsonb_agg(jsonb_build_object(
              'account_id', je.account_id,
              'entry_type', case when je.entry_type = 'debit' then 'credit' else 'debit' end,
              'amount',     je.amount,
              'amount_usd', coalesce(je.amount_usd, je.amount)))
       from public.journal_entries je where je.batch_id = b.id),
    b.source_invoice_id, b.source_payment_id, b.id, b.client_id, b.source_bill_id);

  update public.manual_journal_batches
     set status = 'reversed', reversed_by_batch_id = v_new
   where id = b.id;
  return v_new;
end;
$$;

-- ── System accounts (adds ap, bills_in_transit, expense) ────────────────────

create or replace function lp_private.find_system_account(p_org_id uuid, p_role text)
returns uuid
language sql stable
set search_path = public
as $$
  select a.id
    from public.accounts a
   where a.org_id = p_org_id
     and a.client_id is null
     and a.is_active
     and lp_private.is_leaf_account(a.id)
     and case p_role
           when 'ar'               then a.type = 'asset'     and a.name ~* '(receivable|^a/?r\M)'
           when 'undeposited'      then a.type = 'asset'     and a.name ~* 'undeposited'
           when 'sales_tax'        then a.type = 'liability' and a.name ~* 'sales tax'
           when 'revenue'          then a.type = 'income'    and a.name !~* '(exchange|interest|refund|discount|adjust|reimburs)'
           when 'fx'               then a.type in ('income', 'expense') and a.name ~* '(foreign exchange|exchange gain|exchange loss|fx gain|fx loss|currency)'
           when 'ap'               then a.type = 'liability' and a.name ~* '(payable|^a/?p\M)' and a.name !~* '(tax|payroll|wage|interest|note)'
           when 'bills_in_transit' then a.type = 'liability' and a.name ~* 'in transit'
           when 'expense'          then a.type = 'expense'   and a.name ~* '(uncategori[sz]ed|ask my accountant|miscellaneous)'
           else false
         end
   order by case when p_role = 'revenue' and a.name ~* '(sales|service|revenue|fees)' then 0
                 when p_role = 'ar'      and a.name ~* 'accounts receivable'          then 0
                 when p_role = 'ar'      and a.name ~* '^a/?r\M'                     then 1
                 when p_role = 'ap'      and a.name ~* 'accounts payable'             then 0
                 when p_role = 'expense' and a.name ~* 'uncategori'                   then 0
                 else 2 end,
            a.code
   limit 1
$$;

create or replace function lp_private.ensure_system_account(p_org_id uuid, p_role text, p_user uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id    uuid := lp_private.find_system_account(p_org_id, p_role);
  v_code  integer;
  v_name  text;
  v_type  text;
  v_nb    public.entry_type_enum;
  v_cf    text;
begin
  if v_id is not null then
    return v_id;
  end if;

  select c, n, t, nb::public.entry_type_enum, cf into v_code, v_name, v_type, v_nb, v_cf
    from (values
      ('ar',               1200, 'Accounts Receivable',          'asset',     'debit',  'operating'),
      ('undeposited',      1150, 'Undeposited Funds',            'asset',     'debit',  'operating'),
      ('sales_tax',        2200, 'Sales Tax Payable',            'liability', 'credit', 'operating'),
      ('revenue',          4000, 'Sales',                        'income',    'credit', 'operating'),
      ('fx',               7900, 'Foreign Exchange Gain/Loss',   'income',    'credit', 'operating'),
      ('ap',               2000, 'Accounts Payable',             'liability', 'credit', 'operating'),
      ('bills_in_transit', 2050, 'Bill Payments in Transit',     'liability', 'credit', 'operating'),
      ('expense',          6999, 'Uncategorized Expense',        'expense',   'debit',  'operating')
    ) as r(role, c, n, t, nb, cf)
   where r.role = p_role;
  if v_name is null then
    raise exception 'Unknown system account role %', p_role;
  end if;

  while exists (select 1 from public.accounts
                 where org_id = p_org_id and client_id is null and code = v_code::text) loop
    v_code := v_code + 1;
  end loop;

  insert into public.accounts (org_id, client_id, is_legacy, code, name, type, normal_balance,
                               level, is_active, created_by, cash_flow_category, description)
  values (p_org_id, null, true, v_code::text, v_name, v_type, v_nb,
          1, true, p_user, v_cf, 'Created by LedgiProof for invoicing and bills')
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Bills ───────────────────────────────────────────────────────────────────

create or replace function lp_private.bill_label(p_bill public.vendor_bills)
returns text
language sql stable
set search_path = public
as $$
  select 'Bill' || coalesce(' ' || nullif(btrim(p_bill.bill_number), ''), '') || ' · ' ||
         coalesce((select coalesce(nullif(btrim(v.dba_name), ''), v.legal_name)
                     from public.vendors v where v.id = p_bill.vendor_id), 'Vendor')
$$;

-- The bill itself: Dr expense / Cr AP, kept in step with the bill row.
create or replace function lp_private.sync_bill_ledger(p_bill_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  b       public.vendor_bills%rowtype;
  v_user  uuid;
  v_cur   public.manual_journal_batches%rowtype;
  v_same  boolean := false;
  v_ap    uuid;
begin
  select * into b from public.vendor_bills where id = p_bill_id;
  v_user := coalesce(auth.uid(), b.created_by);

  select * into v_cur
    from public.manual_journal_batches
   where source_bill_id = p_bill_id and entry_kind = 'bill'
     and status = 'posted' and reverses_batch_id is null
   order by created_at desc limit 1;

  if v_cur.id is not null then
    select v_cur.effective_date = b.bill_date
       and coalesce(sum(je.amount) filter (where je.entry_type = 'debit'
                                            and je.account_id = b.expense_account_id), 0) = round(b.amount, 2)
      into v_same
      from public.journal_entries je
     where je.batch_id = v_cur.id;
  end if;
  if coalesce(v_same, false) then
    return;
  end if;

  if v_cur.id is not null then
    perform lp_private.reverse_ledger_batch(v_cur.id, v_user, current_date,
                                            lp_private.bill_label(b) || ' changed');
  end if;

  v_ap := lp_private.ensure_system_account(b.org_id, 'ap', v_user);
  perform lp_private.post_ledger_batch(
    b.org_id, 'bill', b.bill_date, lp_private.bill_label(b), v_user, 'USD',
    jsonb_build_array(
      jsonb_build_object('account_id', b.expense_account_id, 'entry_type', 'debit',
                         'amount', b.amount, 'amount_usd', b.amount),
      jsonb_build_object('account_id', v_ap, 'entry_type', 'credit',
                         'amount', b.amount, 'amount_usd', b.amount)),
    null, null, null, null, p_bill_id);
end;
$$;

-- A payment recorded by hand ("Mark paid"): Dr AP / Cr Bill Payments in
-- Transit. A payment matched from the bank (paid_via 'bank') posts nothing
-- here -- the bank line itself is Dr AP Cr Bank.
create or replace function lp_private.sync_bill_payment_ledger(p_bill_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  b       public.vendor_bills%rowtype;
  v_user  uuid;
  v_cur   uuid;
  v_want  boolean;
begin
  select * into b from public.vendor_bills where id = p_bill_id;
  v_user := coalesce(auth.uid(), b.created_by);
  v_want := b.status = 'paid' and b.paid_via = 'manual';

  select id into v_cur
    from public.manual_journal_batches
   where source_bill_id = p_bill_id and entry_kind = 'bill_payment'
     and status = 'posted' and reverses_batch_id is null
   order by created_at desc limit 1;

  if v_cur is not null and v_want then
    return;   -- amount can't change while paid (guarded), nothing to redo
  end if;
  if v_cur is not null then
    perform lp_private.reverse_ledger_batch(v_cur, v_user, current_date,
                                            lp_private.bill_label(b) || ' payment undone');
  end if;
  if not v_want then
    return;
  end if;

  perform lp_private.post_ledger_batch(
    b.org_id, 'bill_payment', coalesce(b.paid_at::date, current_date),
    'Payment of ' || lower(left(lp_private.bill_label(b), 1)) || substr(lp_private.bill_label(b), 2),
    v_user, 'USD',
    jsonb_build_array(
      jsonb_build_object('account_id', lp_private.ensure_system_account(b.org_id, 'ap', v_user),
                         'entry_type', 'debit', 'amount', b.amount, 'amount_usd', b.amount),
      jsonb_build_object('account_id', lp_private.ensure_system_account(b.org_id, 'bills_in_transit', v_user),
                         'entry_type', 'credit', 'amount', b.amount, 'amount_usd', b.amount)),
    null, null, null, null, p_bill_id);
end;
$$;

create or replace function lp_private.trg_vendor_bill_before()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_acct public.accounts%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then
      raise exception using errcode = 'LB007', message = 'A paid bill can''t be deleted. Mark it unpaid first.';
    end if;
    return old;
  end if;

  if new.client_id is not null then
    raise exception using errcode = 'LB001', message = 'Bills for a client''s books aren''t supported yet';
  end if;
  if new.amount is null or new.amount <= 0 then
    raise exception using errcode = 'LB008', message = 'Enter an amount greater than zero';
  end if;
  new.amount := round(new.amount, 2);

  if tg_op = 'UPDATE' and old.status = 'paid' and new.status = 'paid'
     and (new.amount <> old.amount or new.bill_date <> old.bill_date
          or new.expense_account_id is distinct from old.expense_account_id) then
    raise exception using errcode = 'LB005', message = 'This bill is paid; mark it unpaid before changing it';
  end if;

  -- The expense account: as chosen, else the vendor's default, else Uncategorized.
  if new.expense_account_id is null then
    select v.default_expense_account_id into new.expense_account_id
      from public.vendors v where v.id = new.vendor_id;
  end if;
  if new.expense_account_id is null then
    new.expense_account_id := lp_private.ensure_system_account(new.org_id, 'expense',
                                                                coalesce(auth.uid(), new.created_by));
  end if;
  select * into v_acct from public.accounts
   where id = new.expense_account_id and org_id = new.org_id and client_id is null and is_active;
  if not found then
    raise exception using errcode = 'LB002', message = 'Choose an account from this workspace''s chart of accounts';
  end if;
  if not lp_private.is_leaf_account(v_acct.id) then
    raise exception using errcode = 'LB003', message = 'Choose a specific account, not a group heading';
  end if;

  if new.status = 'paid' then
    new.paid_amount := round(coalesce(new.paid_amount, new.amount), 2);
    if new.paid_amount <> new.amount then
      raise exception using errcode = 'LB004',
        message = format('Partial bill payments aren''t supported yet — record the full amount (%s)', new.amount),
        detail  = jsonb_build_object('amount', new.amount)::text;
    end if;
    new.paid_at  := coalesce(new.paid_at, now());
    new.paid_via := coalesce(new.paid_via, 'manual');
  elsif tg_op = 'UPDATE' and old.status = 'paid' then
    -- Mark unpaid: only while no bank withdrawal is matched to the payment.
    if old.transaction_id is not null then
      raise exception using errcode = 'LB006',
        message = 'This bill''s payment is matched to a bank withdrawal and can''t be undone here';
    end if;
    new.paid_at     := null;
    new.paid_amount := null;
    new.paid_via    := null;
  end if;
  if new.status <> 'paid' then
    new.transaction_id := null;
  end if;
  return new;
end;
$$;

create or replace function lp_private.trg_vendor_bill_after()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_batch uuid;
begin
  if tg_op = 'DELETE' then
    -- Only an unpaid bill can be deleted (guarded before): reverse its entry.
    select id into v_batch
      from public.manual_journal_batches
     where source_bill_id = old.id and entry_kind = 'bill'
       and status = 'posted' and reverses_batch_id is null
     order by created_at desc limit 1;
    if v_batch is not null then
      perform lp_private.reverse_ledger_batch(v_batch, coalesce(auth.uid(), old.created_by), current_date,
                                              lp_private.bill_label(old) || ' removed');
    end if;
    return null;
  end if;
  -- pending <-> overdue only relabels the bill; nothing to post.
  if tg_op = 'UPDATE' and new.amount = old.amount and new.bill_date = old.bill_date
     and new.expense_account_id is not distinct from old.expense_account_id
     and (new.status = 'paid') = (old.status = 'paid')
     and new.paid_via is not distinct from old.paid_via then
    return null;
  end if;
  perform lp_private.sync_bill_ledger(new.id);
  perform lp_private.sync_bill_payment_ledger(new.id);
  return null;
end;
$$;

drop trigger if exists trg_vendor_bill_before on public.vendor_bills;
create trigger trg_vendor_bill_before
  before insert or update or delete on public.vendor_bills
  for each row execute function lp_private.trg_vendor_bill_before();

drop trigger if exists trg_vendor_bill_after on public.vendor_bills;
create trigger trg_vendor_bill_after
  after insert or update or delete on public.vendor_bills
  for each row execute function lp_private.trg_vendor_bill_after();

-- ── Review inbox: withdrawals that pay a bill ───────────────────────────────

-- An open bill for exactly this withdrawal ("Payment for bill #X"), or a bill
-- marked paid whose payment is still in transit ("Withdrawal of the payment
-- for bill #X"). USD only, like invoices. The vendor's name in the bank
-- description breaks ties.
create or replace function lp_private.withdrawal_bill_match(
  p_org_id uuid, p_amount numeric, p_currency text, p_date date, p_text text)
returns table(bill_id uuid, bill_number text, vendor_name text, kind text)
language sql stable
set search_path = public
as $$
  select b.id, b.bill_number,
         coalesce(nullif(btrim(v.dba_name), ''), v.legal_name)::text,
         case when b.status = 'paid' then 'in_transit' else 'open' end
    from public.vendor_bills b
    join public.vendors v on v.id = b.vendor_id
   where p_amount < 0
     and b.org_id = p_org_id
     and b.client_id is null
     and upper(coalesce(p_currency, 'USD')) = 'USD'
     and abs(b.amount - abs(p_amount)) < 0.005
     and b.transaction_id is null
     and (b.status in ('pending', 'overdue')
          -- recorded in the app before or after the bank line (a check clears
          -- days later; people often record the payment afterwards)
          or (b.status = 'paid' and b.paid_via = 'manual'
              and abs(b.paid_at::date - p_date) <= 30))
   order by (lp_private.receipt_word(coalesce(nullif(v.dba_name, ''), v.legal_name)) is not null
             and position(lp_private.receipt_word(coalesce(nullif(v.dba_name, ''), v.legal_name))
                          in lower(coalesce(p_text, ''))) > 0) desc,
            (b.status = 'paid') desc,
            b.due_date
   limit 1
$$;

create or replace function public.get_review_queue(
  p_org_id    uuid,
  p_client_id uuid default null,
  p_limit     integer default 100
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_items   jsonb;
  v_total   integer;
  v_ar      uuid := lp_private.find_system_account(p_org_id, 'ar');
  v_und     uuid := lp_private.find_system_account(p_org_id, 'undeposited');
  v_ap      uuid := lp_private.find_system_account(p_org_id, 'ap');
  v_transit uuid := lp_private.find_system_account(p_org_id, 'bills_in_transit');
begin
  perform lp_private.assert_org_access(p_org_id);

  select count(*) into v_total
    from public.transactions t
   where t.org_id = p_org_id
     and t.client_id is not distinct from p_client_id
     and t.is_current
     and t.locked_at is null
     and not exists (select 1 from public.journal_entries je
                      where je.transaction_id = t.id and not je.is_reversed);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_date desc, x.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select t.id, t.transaction_date, t.created_at, t.description, t.merchant_name,
             t.amount, t.currency, t.semaphore, t.status_reason,
             lp_private.merchant_key(coalesce(t.merchant_name, t.description)) as merchant_key,
             coalesce(case when im.invoice_id is not null then v_ar end,
                      case when pm.payment_id is not null then v_und end,
                      case bm.kind when 'open' then v_ap when 'in_transit' then v_transit end,
                      s.account_id)                                   as suggested_account_id,
             case when im.invoice_id is not null and v_ar  is not null then 'invoice'
                  when pm.payment_id is not null and v_und is not null then 'deposit'
                  when bm.kind = 'open'       and v_ap      is not null then 'bill'
                  when bm.kind = 'in_transit' and v_transit is not null then 'bill_payment'
                  else s.source end                                   as suggestion_source,
             case when (im.invoice_id is not null and v_ar is not null)
                    or (pm.payment_id is not null and v_und is not null)
                    or (bm.kind = 'open' and v_ap is not null)
                    or (bm.kind = 'in_transit' and v_transit is not null) then 95
                  else s.confidence end                               as suggestion_confidence,
             a.code        as suggested_account_code,
             a.name        as suggested_account_name,
             case when im.invoice_id is not null and v_ar is not null then jsonb_build_object(
                    'invoice_id', im.invoice_id, 'invoice_number', im.invoice_number,
                    'client_name', im.client_name, 'balance_due', im.balance_due) end as invoice_match,
             case when im.invoice_id is null and pm.payment_id is not null and v_und is not null then jsonb_build_object(
                    'payment_id', pm.payment_id, 'invoice_number', pm.invoice_number,
                    'payment_date', pm.payment_date, 'method', pm.method) end        as deposit_match,
             case when (bm.kind = 'open' and v_ap is not null)
                    or (bm.kind = 'in_transit' and v_transit is not null) then jsonb_build_object(
                    'bill_id', bm.bill_id, 'bill_number', bm.bill_number,
                    'vendor_name', bm.vendor_name, 'kind', bm.kind) end              as bill_match,
             lp_private.transaction_has_receipt(t.transaction_group_id) as has_receipt
        from public.transactions t
        left join lateral lp_private.deposit_invoice_match(
               t.org_id, t.amount, t.currency,
               coalesce(t.merchant_name, '') || ' ' || coalesce(t.description, '')) im
               on p_client_id is null
        left join lateral lp_private.deposit_payment_match(
               t.org_id, t.amount, t.currency, t.transaction_date) pm
               on p_client_id is null and im.invoice_id is null
        left join lateral lp_private.withdrawal_bill_match(
               t.org_id, t.amount, t.currency, t.transaction_date,
               coalesce(t.merchant_name, '') || ' ' || coalesce(t.description, '')) bm
               on p_client_id is null
        left join lateral lp_private.suggest_account(
               t.org_id, t.client_id, coalesce(t.merchant_name, t.description), t.amount, t.vendor_id) s on true
        left join public.accounts a on a.id = coalesce(
               case when im.invoice_id is not null then v_ar end,
               case when pm.payment_id is not null then v_und end,
               case bm.kind when 'open' then v_ap when 'in_transit' then v_transit end,
               s.account_id)
       where t.org_id = p_org_id
         and t.client_id is not distinct from p_client_id
         and t.is_current
         and t.locked_at is null
         and not exists (select 1 from public.journal_entries je
                          where je.transaction_id = t.id and not je.is_reversed)
       order by t.transaction_date desc, t.created_at desc
       limit least(greatest(coalesce(p_limit, 100), 1), 200)
    ) x;

  return jsonb_build_object(
    'items',        v_items,
    'total',        v_total,
    'bank_account', lp_private.default_cash_account(p_org_id, p_client_id)
  );
end;
$$;

-- post_reviewed_transactions: an item may now carry
--   "invoice_id"  -> the deposit pays that invoice: category = AR, and the
--                    payment is recorded against the invoice;
--   "payment_id"  -> the deposit brings in a recorded payment: category =
--                    Undeposited Funds, and the payment is marked deposited.
--   "bill_id"     -> the withdrawal pays that bill: an open bill -> category =
--                    Accounts Payable and the bill is marked paid (paid_via
--                    'bank'); a bill marked paid by hand -> category = Bill
--                    Payments in Transit, and the bill is linked to the line.
-- None of them teaches a merchant rule (these descriptions don't identify a
-- category the way a merchant does).
create or replace function public.post_reviewed_transactions(p_org_id uuid, p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_item    jsonb;
  v_tx      public.transactions%rowtype;
  v_acct    public.accounts%rowtype;
  v_inv     public.invoices%rowtype;
  v_pay     public.invoice_payments%rowtype;
  v_bill    public.vendor_bills%rowtype;
  v_inv_id  uuid;
  v_pay_id  uuid;
  v_bill_id uuid;
  v_bank    uuid;
  v_amt     numeric;
  v_usd     numeric;
  v_rate    numeric;
  v_cur     text;
  v_prev    text;
  v_now     timestamptz;
  v_hash    text;
  v_key     text;
  v_cat     text;
  v_count   integer;
  v_is_rule boolean;
  v_posted  jsonb := '[]'::jsonb;
  v_failed  jsonb := '[]'::jsonb;
  v_prompts jsonb := '[]'::jsonb;
begin
  perform lp_private.assert_org_access(p_org_id, array['owner','admin','accountant']::public.lp_role[]);
  if v_uid is null then
    raise exception 'A signed-in user is required to verify transactions' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('posted', v_posted, 'failed', v_failed, 'rule_prompts', v_prompts);
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception using errcode = 'LV001', message = 'At most 200 transactions per batch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('audit_events:' || p_org_id::text, 0));

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_inv_id := nullif(v_item ->> 'invoice_id', '')::uuid;
      v_pay_id := nullif(v_item ->> 'payment_id', '')::uuid;
      v_bill_id := nullif(v_item ->> 'bill_id', '')::uuid;

      select * into v_tx
        from public.transactions
       where id = (v_item ->> 'transaction_id')::uuid
         and org_id = p_org_id
         and is_current
       for update;
      if not found then
        raise exception 'Transaction not found';
      end if;
      if v_tx.locked_at is not null then
        raise exception 'This transaction is locked';
      end if;
      if exists (select 1 from public.journal_entries je
                  where je.transaction_id = v_tx.id and not je.is_reversed) then
        raise exception 'Already categorized';
      end if;

      if v_inv_id is not null then
        select * into v_inv from public.invoices where id = v_inv_id and org_id = p_org_id for update;
        if not found or v_tx.client_id is not null then
          raise exception 'That invoice is not part of this workspace';
        end if;
        if v_inv.status not in ('sent', 'viewed', 'partial', 'overdue') then
          raise exception 'Invoice % is not open', v_inv.invoice_number;
        end if;
        if v_tx.amount <= 0 or abs(v_tx.amount) > v_inv.balance_due + 0.005
           or upper(v_inv.currency) <> upper(v_tx.currency) then
          raise exception 'This deposit doesn''t fit the balance of invoice %', v_inv.invoice_number;
        end if;
        select * into v_acct from public.accounts
         where id = lp_private.ensure_system_account(p_org_id, 'ar', v_uid);
      elsif v_pay_id is not null then
        select * into v_pay from public.invoice_payments
         where id = v_pay_id and org_id = p_org_id and transaction_id is null for update;
        if not found or v_tx.client_id is not null then
          raise exception 'That payment is not waiting for a deposit';
        end if;
        if v_tx.amount <= 0 or abs(abs(v_tx.amount) - v_pay.amount) > 0.005
           or upper(v_pay.currency) <> upper(v_tx.currency) then
          raise exception 'This deposit doesn''t match the recorded payment';
        end if;
        select * into v_acct from public.accounts
         where id = lp_private.ensure_system_account(p_org_id, 'undeposited', v_uid);
      elsif v_bill_id is not null then
        select * into v_bill from public.vendor_bills
         where id = v_bill_id and org_id = p_org_id and transaction_id is null for update;
        if not found or v_bill.client_id is not null or v_tx.client_id is not null then
          raise exception 'That bill is not waiting for a payment from this workspace''s bank';
        end if;
        if v_tx.amount >= 0 or abs(abs(v_tx.amount) - v_bill.amount) > 0.005
           or upper(coalesce(v_tx.currency, 'USD')) <> 'USD' then
          raise exception 'This withdrawal doesn''t match the bill amount';
        end if;
        if v_bill.status in ('pending', 'overdue') then
          select * into v_acct from public.accounts
           where id = lp_private.ensure_system_account(p_org_id, 'ap', v_uid);
        elsif v_bill.status = 'paid' and v_bill.paid_via = 'manual' then
          select * into v_acct from public.accounts
           where id = lp_private.ensure_system_account(p_org_id, 'bills_in_transit', v_uid);
        else
          raise exception 'That bill was already paid from the bank';
        end if;
      else
        select * into v_acct
          from public.accounts
         where id = (v_item ->> 'account_id')::uuid
           and org_id = p_org_id
           and client_id is not distinct from v_tx.client_id
           and is_active;
        if not found then
          raise exception 'Choose a category from this workspace''s chart of accounts';
        end if;
      end if;
      if not lp_private.is_leaf_account(v_acct.id) then
        raise exception 'Choose a specific account, not a group heading';
      end if;

      v_bank := nullif(v_item ->> 'bank_account_id', '')::uuid;
      if v_bank is not null and not exists (
        select 1 from public.accounts
         where id = v_bank and org_id = p_org_id
           and client_id is not distinct from v_tx.client_id and is_active
      ) then
        raise exception 'That bank account is not part of this workspace';
      end if;
      v_bank := coalesce(v_bank, lp_private.default_cash_account(p_org_id, v_tx.client_id));
      if v_bank is null then
        raise exception 'Add a bank or cash account to your chart of accounts first';
      end if;
      if v_bank = v_acct.id then
        raise exception 'The category can''t be the bank account itself';
      end if;

      v_amt := abs(v_tx.amount);
      if v_amt = 0 then
        raise exception 'A zero-amount transaction has nothing to post';
      end if;
      v_cur := upper(coalesce(v_tx.currency, 'USD'));
      if v_cur = 'USD' then
        v_usd := v_amt;
      else
        select usd_rate into v_rate from public.exchange_rates where currency = v_cur;
        if v_rate is null or v_rate = 0 then
          raise exception 'No exchange rate available for %', v_cur;
        end if;
        v_usd := round(v_amt / v_rate, 2);
      end if;

      insert into public.journal_entries (
        transaction_id, entry_kind, account_id, entry_type, amount, amount_usd,
        currency, memo, period_year, period_month
      ) values
        (v_tx.id, 'transaction_linked', case when v_tx.amount < 0 then v_acct.id else v_bank end,
         'debit',  v_amt, v_usd, v_cur, v_tx.description,
         extract(year from v_tx.transaction_date)::int, extract(month from v_tx.transaction_date)::int),
        (v_tx.id, 'transaction_linked', case when v_tx.amount < 0 then v_bank else v_acct.id end,
         'credit', v_amt, v_usd, v_cur, v_tx.description,
         extract(year from v_tx.transaction_date)::int, extract(month from v_tx.transaction_date)::int);

      v_now := clock_timestamp();
      update public.transactions
         set semaphore     = 'blue',
             approved_by   = v_uid,
             approved_at   = v_now,
             review_status = 'confirmed'
       where id = v_tx.id;

      select entry_hash into v_prev
        from public.audit_events
       where org_id = p_org_id
       order by created_at desc, id desc
       limit 1;

      v_hash := public.sha256_text(
        '{"previousHash":'        || coalesce(to_json(v_prev)::text, 'null') ||
        ',"transactionId":'       || to_json(v_tx.id::text)::text ||
        ',"transactionVersion":'  || v_tx.version ||
        ',"eventType":"approved"' ||
        ',"timestamp":'           || to_json(to_char(v_now at time zone 'UTC',
                                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text ||
        ',"actorId":'             || to_json(v_uid::text)::text || '}'
      );

      insert into public.audit_events (
        org_id, transaction_id, transaction_group_id, transaction_version,
        event_type, actor_id, previous_hash, entry_hash, metadata, created_at
      ) values (
        p_org_id, v_tx.id, v_tx.transaction_group_id, v_tx.version,
        'approved', v_uid, v_prev, v_hash,
        jsonb_build_object(
          'note',                'Categorized from the review inbox',
          'prev_semaphore',      v_tx.semaphore,
          'category_account_id', v_acct.id,
          'bank_account_id',     v_bank,
          'suggestion_source',   v_item ->> 'source',
          'invoice_id',          v_inv_id,
          'payment_id',          v_pay_id,
          'bill_id',             v_bill_id
        ),
        v_now
      );

      if v_inv_id is not null then
        -- The payment itself (its trigger sees transaction_id and posts nothing
        -- more: the deposit's entry above is Dr Bank Cr AR).
        insert into public.invoice_payments (
          invoice_id, org_id, amount, currency, payment_date, method,
          reference, notes, recorded_by, transaction_id
        ) values (
          v_inv.id, p_org_id, v_amt, v_cur, v_tx.transaction_date, 'bank_transfer',
          left(coalesce(v_tx.merchant_name, v_tx.description), 100),
          'Matched from the bank deposit', v_uid, v_tx.id
        );
        perform lp_private.compute_invoice_totals_impl(v_inv.id);
      elsif v_pay_id is not null then
        update public.invoice_payments set transaction_id = v_tx.id where id = v_pay_id;
      elsif v_bill_id is not null then
        -- The bank line above is the payment (Dr AP / Dr In Transit, Cr Bank);
        -- paid_via 'bank' tells the bill trigger to post nothing more.
        if v_bill.status = 'paid' then
          update public.vendor_bills set transaction_id = v_tx.id where id = v_bill.id;
        else
          update public.vendor_bills
             set status = 'paid', paid_via = 'bank', paid_amount = v_bill.amount,
                 paid_at = v_tx.transaction_date::timestamptz, transaction_id = v_tx.id
           where id = v_bill.id;
        end if;
      else
        v_key := lp_private.merchant_key(coalesce(v_tx.merchant_name, v_tx.description));
        if v_key <> '' then
          v_cat := case when v_tx.client_id is null then 'learned' else 'learned:' || v_tx.client_id end;
          insert into public.user_patterns (
            org_id, created_by, keyword, merchant_name, account_id, category,
            confidence_boost, match_count, is_active, confirmed_at
          ) values (
            p_org_id, v_uid, v_key, v_key, v_acct.id, v_cat, 20, 1, true, v_now
          )
          on conflict (org_id, keyword, category) do update set
            match_count      = case when user_patterns.account_id = excluded.account_id
                                    then user_patterns.match_count + 1 else 1 end,
            confidence_boost = least(50, case when user_patterns.account_id = excluded.account_id
                                              then user_patterns.confidence_boost + 5 else 20 end),
            is_rule          = case when user_patterns.account_id = excluded.account_id
                                    then user_patterns.is_rule else false end,
            account_id       = excluded.account_id,
            is_active        = true,
            confirmed_at     = excluded.confirmed_at
          returning match_count, is_rule into v_count, v_is_rule;

          if v_count = 2 and not v_is_rule then
            v_prompts := v_prompts || jsonb_build_object(
              'merchant_key', v_key,
              'client_id',    v_tx.client_id,
              'account_id',   v_acct.id,
              'account_name', v_acct.name,
              'example',      coalesce(v_tx.merchant_name, v_tx.description)
            );
          end if;
        end if;
      end if;

      v_posted := v_posted || to_jsonb(v_tx.id);
    exception when others then
      v_failed := v_failed || jsonb_build_object(
        'transaction_id', v_item ->> 'transaction_id',
        'error',          sqlerrm
      );
    end;
  end loop;

  return jsonb_build_object('posted', v_posted, 'failed', v_failed, 'rule_prompts', v_prompts);
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on function lp_private.post_ledger_batch(uuid, public.journal_entry_kind, date, text, uuid, text, jsonb, uuid, uuid, uuid, uuid, uuid)
                                                                                  from public, anon, authenticated;
revoke all on function lp_private.reverse_ledger_batch(uuid, uuid, date, text)    from public, anon, authenticated;
revoke all on function lp_private.find_system_account(uuid, text)                 from public, anon, authenticated;
revoke all on function lp_private.ensure_system_account(uuid, text, uuid)          from public, anon, authenticated;
revoke all on function lp_private.bill_label(public.vendor_bills)                 from public, anon, authenticated;
revoke all on function lp_private.sync_bill_ledger(uuid)                          from public, anon, authenticated;
revoke all on function lp_private.sync_bill_payment_ledger(uuid)                  from public, anon, authenticated;
revoke all on function lp_private.trg_vendor_bill_before()                        from public, anon, authenticated;
revoke all on function lp_private.trg_vendor_bill_after()                         from public, anon, authenticated;
revoke all on function lp_private.withdrawal_bill_match(uuid, numeric, text, date, text) from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;

revoke all on function public.get_review_queue(uuid, uuid, integer)        from public, anon;
revoke all on function public.post_reviewed_transactions(uuid, jsonb)      from public, anon;
grant execute on function public.get_review_queue(uuid, uuid, integer)     to authenticated, service_role;
grant execute on function public.post_reviewed_transactions(uuid, jsonb)   to authenticated, service_role;
