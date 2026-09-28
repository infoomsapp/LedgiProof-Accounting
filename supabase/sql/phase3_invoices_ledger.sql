-- Phase 3: invoices and payments post themselves to the ledger (accrual).
-- Applied 2026-09-27 as migrations `phase3a_invoice_entry_kinds` (the two
-- enum values, which must commit before use) and `phase3_invoices_ledger`.
-- Kept here as the reference copy. Depends on phase2_review_inbox and
-- phase2b_receipt_matching.
--
-- Before: invoices, payments and bills never touched journal_entries -- no
-- accounts receivable on the balance sheet, revenue only when a deposit was
-- categorized by hand, and a paid invoice could still be edited.
--
-- Now (QuickBooks/Xero model, in the workspace's own books, client_id NULL):
--   · Issuing an invoice (leaving draft)   Dr Accounts Receivable  total
--                                          Cr Sales / revenue      total - tax
--                                          Cr Sales Tax Payable    tax
--     Editing an issued invoice reverses that batch and posts a new one;
--     voiding reverses it. Every change is a dated reversal, never an edit.
--   · Recording a payment                  Dr Undeposited Funds    amount
--                                          Cr Accounts Receivable  amount
--     (non-USD: AR is relieved at the invoice's rate, the difference goes to
--     Foreign Exchange Gain/Loss).
--   · The bank deposit, in the review inbox, is suggested as
--       "Payment for INV-0007" (an open invoice, exact balance) -> Dr Bank
--        Cr AR, and the payment is recorded against the invoice; or
--       "Deposit of a recorded payment" (Undeposited Funds, exact amount)
--        -> Dr Bank Cr Undeposited Funds, and the payment is marked deposited.
--   · The accounts it needs (AR, Undeposited Funds, Sales Tax Payable, a
--     revenue account, FX gain/loss) are found by name in the chart, or
--     created once if the chart has none.
--   · Items of a paid / partially paid / void invoice can't be changed, and
--     an invoice with payments can't be voided.

-- ── Schema ──────────────────────────────────────────────────────────────────

alter table public.manual_journal_batches
  add column if not exists source_invoice_id uuid references public.invoices(id) on delete restrict,
  add column if not exists source_payment_id uuid;

create index if not exists ix_mjb_source_invoice on public.manual_journal_batches (source_invoice_id)
  where source_invoice_id is not null;
create index if not exists ix_mjb_source_payment on public.manual_journal_batches (source_payment_id)
  where source_payment_id is not null;

-- The bank transaction the money landed in (set when the deposit is matched).
alter table public.invoice_payments
  add column if not exists transaction_id uuid references public.transactions(id) on delete restrict;

create unique index if not exists invoice_payments_transaction_key
  on public.invoice_payments (transaction_id) where transaction_id is not null;

-- Stripe may deliver the same event twice: one payment per payment intent.
create unique index if not exists invoice_payments_stripe_reference_key
  on public.invoice_payments (reference) where method = 'stripe' and reference is not null;

-- ── System accounts ─────────────────────────────────────────────────────────

-- The workspace's own (self-mode) account playing a role, or null.
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
           when 'ar'          then a.type = 'asset'     and a.name ~* '(receivable|^a/?r\M)'
           when 'undeposited' then a.type = 'asset'     and a.name ~* 'undeposited'
           when 'sales_tax'   then a.type = 'liability' and a.name ~* 'sales tax'
           when 'revenue'     then a.type = 'income'    and a.name !~* '(exchange|interest|refund|discount|adjust|reimburs)'
           when 'fx'          then a.type in ('income', 'expense') and a.name ~* '(foreign exchange|exchange gain|exchange loss|fx gain|fx loss|currency)'
           else false
         end
   order by case when p_role = 'revenue' and a.name ~* '(sales|service|revenue|fees)' then 0
                 when p_role = 'ar'      and a.name ~* 'accounts receivable'          then 0
                 when p_role = 'ar'      and a.name ~* '^a/?r\M'                     then 1
                 else 2 end,
            a.code
   limit 1
$$;

-- Same, creating the account the first time the chart has none.
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
      ('ar',          1200, 'Accounts Receivable',          'asset',     'debit',  'operating'),
      ('undeposited', 1150, 'Undeposited Funds',            'asset',     'debit',  'operating'),
      ('sales_tax',   2200, 'Sales Tax Payable',            'liability', 'credit', 'operating'),
      ('revenue',     4000, 'Sales',                        'income',    'credit', 'operating'),
      ('fx',          7900, 'Foreign Exchange Gain/Loss',   'income',    'credit', 'operating')
    ) as r(role, c, n, t, nb, cf)
   where r.role = p_role;
  if v_name is null then
    raise exception 'Unknown system account role %', p_role;
  end if;

  -- First free code at or after the usual one.
  while exists (select 1 from public.accounts
                 where org_id = p_org_id and client_id is null and code = v_code::text) loop
    v_code := v_code + 1;
  end loop;

  insert into public.accounts (org_id, client_id, is_legacy, code, name, type, normal_balance,
                               level, is_active, created_by, cash_flow_category, description)
  values (p_org_id, null, true, v_code::text, v_name, v_type, v_nb,
          1, true, p_user, v_cf, 'Created by LedgiProof for invoicing')
  returning id into v_id;
  return v_id;
end;
$$;

-- units of p_currency per USD (exchange_rates semantics); 1 for USD.
create or replace function lp_private.usd_rate(p_currency text)
returns numeric
language plpgsql stable
set search_path = public
as $$
declare
  v_rate numeric;
begin
  if upper(coalesce(p_currency, 'USD')) = 'USD' then
    return 1;
  end if;
  select usd_rate into v_rate from public.exchange_rates where currency = upper(p_currency);
  if v_rate is null or v_rate = 0 then
    raise exception 'No exchange rate available for %', upper(p_currency) using errcode = '22023';
  end if;
  return v_rate;
end;
$$;

-- ── Batches ─────────────────────────────────────────────────────────────────

-- p_lines: [{ "account_id": uuid, "entry_type": "debit"|"credit",
--             "amount": numeric, "amount_usd": numeric }]
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
  p_reverses   uuid default null
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
    memo, prepared_by, status, source_invoice_id, source_payment_id, reverses_batch_id
  ) values (
    p_org_id, null, p_kind, p_date,
    extract(year from p_date)::smallint, extract(month from p_date)::smallint,
    p_memo, p_user, 'draft', p_invoice_id, p_payment_id, p_reverses
  ) returning id into v_batch;

  insert into public.journal_entries (
    batch_id, entry_kind, account_id, entry_type, amount, amount_usd,
    currency, memo, period_year, period_month
  )
  select v_batch, p_kind, (l ->> 'account_id')::uuid, (l ->> 'entry_type')::public.entry_type_enum,
         round((l ->> 'amount')::numeric, 2), round((l ->> 'amount_usd')::numeric, 2),
         upper(coalesce(p_currency, 'USD')), p_memo,
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

-- A dated reversal: an opposite batch on p_date; the original is marked
-- reversed. Both stay in the ledger and net to zero.
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
    b.source_invoice_id, b.source_payment_id, b.id);

  update public.manual_journal_batches
     set status = 'reversed', reversed_by_batch_id = v_new
   where id = b.id;
  return v_new;
end;
$$;

-- ── Invoices ────────────────────────────────────────────────────────────────

create or replace function lp_private.sync_invoice_ledger(p_invoice_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  inv      public.invoices%rowtype;
  v_user   uuid;
  v_cur    public.manual_journal_batches%rowtype;
  v_want   boolean;
  v_same   boolean := false;
  v_rate   numeric;
  v_rev    numeric;
  v_ar     uuid;
  v_sales  uuid;
  v_tax    uuid;
  v_memo   text;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found then
    return;
  end if;
  v_user := coalesce(auth.uid(), inv.created_by);
  v_want := inv.status not in ('draft', 'void') and inv.total > 0;

  select * into v_cur
    from public.manual_journal_batches
   where source_invoice_id = inv.id
     and entry_kind = 'invoice'
     and status = 'posted'
     and reverses_batch_id is null
   order by created_at desc
   limit 1;

  if v_cur.id is not null and v_want then
    select v_cur.effective_date = inv.issue_date
       and max(je.currency) = upper(inv.currency)
       and coalesce(sum(je.amount) filter (where je.entry_type = 'debit'), 0) = round(inv.total, 2)
       and coalesce(sum(je.amount) filter (where je.entry_type = 'credit'
                                            and je.account_id = lp_private.find_system_account(inv.org_id, 'sales_tax')), 0)
           = round(inv.tax_total, 2)
      into v_same
      from public.journal_entries je
     where je.batch_id = v_cur.id;
  end if;

  if coalesce(v_same, false) then
    return;
  end if;

  if v_cur.id is not null then
    perform lp_private.reverse_ledger_batch(
      v_cur.id, v_user, current_date,
      case when inv.status = 'void' then 'Invoice ' || inv.invoice_number || ' voided'
           else 'Invoice ' || inv.invoice_number || ' changed' end);
  end if;

  if not v_want then
    return;
  end if;

  v_rate  := coalesce(nullif(inv.fx_rate_at_creation, 0), lp_private.usd_rate(inv.currency));
  v_rev   := round(inv.total - inv.tax_total, 2);
  v_ar    := lp_private.ensure_system_account(inv.org_id, 'ar', v_user);
  v_sales := lp_private.ensure_system_account(inv.org_id, 'revenue', v_user);
  v_memo  := 'Invoice ' || inv.invoice_number ||
             coalesce(' · ' || nullif(btrim(coalesce(inv.bill_to_company, inv.bill_to_name, '')), ''), '');
  if inv.tax_total > 0 then
    v_tax := lp_private.ensure_system_account(inv.org_id, 'sales_tax', v_user);
  end if;

  perform lp_private.post_ledger_batch(
    inv.org_id, 'invoice', inv.issue_date, v_memo, v_user, inv.currency,
    jsonb_build_array(
      jsonb_build_object('account_id', v_ar,    'entry_type', 'debit',
                         'amount', inv.total,     'amount_usd', round(inv.total / v_rate, 2)),
      jsonb_build_object('account_id', v_sales, 'entry_type', 'credit',
                         'amount', v_rev,         'amount_usd', round(inv.total / v_rate, 2)
                                                              - round(inv.tax_total / v_rate, 2))
    ) || case when inv.tax_total > 0 then jsonb_build_array(
      jsonb_build_object('account_id', v_tax,   'entry_type', 'credit',
                         'amount', inv.tax_total, 'amount_usd', round(inv.tax_total / v_rate, 2)))
         else '[]'::jsonb end,
    inv.id, null, null);
end;
$$;

create or replace function lp_private.trg_invoice_ledger()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status = 'void' and old.status <> 'void' and new.amount_paid > 0 then
    raise exception 'This invoice has payments. Remove them before voiding it.' using errcode = '23514';
  end if;
  perform lp_private.sync_invoice_ledger(new.id);
  return null;
end;
$$;

drop trigger if exists trg_invoice_ledger on public.invoices;
create trigger trg_invoice_ledger
  after insert or update of status, total, tax_total, issue_date, currency on public.invoices
  for each row execute function lp_private.trg_invoice_ledger();

-- A paid, partially paid or void invoice is a closed document.
create or replace function lp_private.trg_guard_invoice_items()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_status public.invoice_status;
begin
  select status into v_status from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if v_status in ('paid', 'partial', 'void') then
    raise exception 'This invoice is % and its items can no longer be changed.', v_status
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_items on public.invoice_items;
create trigger trg_guard_invoice_items
  before insert or update or delete on public.invoice_items
  for each row execute function lp_private.trg_guard_invoice_items();

-- ── Payments ────────────────────────────────────────────────────────────────

create or replace function lp_private.sync_payment_ledger(p_payment_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  p        public.invoice_payments%rowtype;
  inv      public.invoices%rowtype;
  v_user   uuid;
  v_cur    uuid;
  v_inv_r  numeric;
  v_pay_r  numeric;
  v_ar_usd numeric;
  v_cash   numeric;
  v_diff   numeric;
  v_lines  jsonb;
begin
  select * into p from public.invoice_payments where id = p_payment_id;
  if not found then
    return;
  end if;
  select * into inv from public.invoices where id = p.invoice_id;
  v_user := coalesce(auth.uid(), p.recorded_by);

  select id into v_cur
    from public.manual_journal_batches
   where source_payment_id = p.id and entry_kind = 'invoice_payment'
     and status = 'posted' and reverses_batch_id is null
   order by created_at desc limit 1;
  if v_cur is not null then
    perform lp_private.reverse_ledger_batch(v_cur, v_user, current_date,
      'Payment on invoice ' || inv.invoice_number || ' changed');
  end if;

  v_pay_r  := coalesce(nullif(p.fx_rate_at_payment, 0), lp_private.usd_rate(p.currency));
  v_inv_r  := coalesce(nullif(inv.fx_rate_at_creation, 0), v_pay_r);
  v_cash   := round(p.amount / v_pay_r, 2);
  v_ar_usd := round(p.amount / v_inv_r, 2);
  v_diff   := v_cash - v_ar_usd;   -- > 0 gain, < 0 loss

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', lp_private.ensure_system_account(p.org_id, 'undeposited', v_user),
                       'entry_type', 'debit',  'amount', p.amount, 'amount_usd', v_cash),
    jsonb_build_object('account_id', lp_private.ensure_system_account(p.org_id, 'ar', v_user),
                       'entry_type', 'credit', 'amount', p.amount, 'amount_usd', v_ar_usd));
  -- The FX difference exists only in USD: amount 0.01 in the document
  -- currency keeps the line valid, amount_usd carries the real figure.
  if v_diff <> 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', lp_private.ensure_system_account(p.org_id, 'fx', v_user),
      'entry_type', case when v_diff > 0 then 'credit' else 'debit' end,
      'amount', 0.01, 'amount_usd', abs(v_diff)));
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', lp_private.ensure_system_account(p.org_id, 'fx', v_user),
      'entry_type', case when v_diff > 0 then 'debit' else 'credit' end,
      'amount', 0.01, 'amount_usd', 0));
  end if;

  perform lp_private.post_ledger_batch(
    p.org_id, 'invoice_payment', p.payment_date,
    'Payment on invoice ' || inv.invoice_number || coalesce(' · ' || nullif(p.method, ''), ''),
    v_user, p.currency, v_lines, inv.id, p.id, null);
end;
$$;

create or replace function lp_private.trg_invoice_payment_before()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.transaction_id is not null then
      raise exception 'This payment is matched to a bank deposit. Undo it from the transaction.'
        using errcode = '23514';
    end if;
    return old;
  end if;
  new.currency := upper(new.currency);
  if new.fx_rate_at_payment is null then
    new.fx_rate_at_payment := lp_private.usd_rate(new.currency);
  end if;
  return new;
end;
$$;

create or replace function lp_private.trg_invoice_payment_after()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_batch uuid;
  v_inv   text;
begin
  if tg_op = 'DELETE' then
    select b.id, i.invoice_number into v_batch, v_inv
      from public.manual_journal_batches b
      join public.invoices i on i.id = old.invoice_id
     where b.source_payment_id = old.id and b.entry_kind = 'invoice_payment'
       and b.status = 'posted' and b.reverses_batch_id is null
     order by b.created_at desc limit 1;
    if v_batch is not null then
      perform lp_private.reverse_ledger_batch(v_batch, coalesce(auth.uid(), old.recorded_by), current_date,
        'Payment on invoice ' || v_inv || ' removed');
    end if;
    return null;
  end if;

  -- A payment created from its bank deposit is posted by the review inbox
  -- (Dr Bank Cr AR, linked to the transaction) -- nothing to add here.
  if tg_op = 'INSERT' and new.transaction_id is not null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.amount = old.amount and new.payment_date = old.payment_date
     and new.currency = old.currency then
    return null;   -- e.g. the deposit being matched
  end if;
  if tg_op = 'UPDATE' and new.transaction_id is not null then
    raise exception 'This payment is matched to a bank deposit and can''t be changed.' using errcode = '23514';
  end if;
  perform lp_private.sync_payment_ledger(new.id);
  return null;
end;
$$;

drop trigger if exists trg_invoice_payment_before on public.invoice_payments;
create trigger trg_invoice_payment_before
  before insert or update or delete on public.invoice_payments
  for each row execute function lp_private.trg_invoice_payment_before();

drop trigger if exists trg_invoice_payment_after on public.invoice_payments;
create trigger trg_invoice_payment_after
  after insert or update or delete on public.invoice_payments
  for each row execute function lp_private.trg_invoice_payment_after();

-- ── Review inbox: deposits that pay an invoice ──────────────────────────────

-- An open invoice whose balance is exactly this deposit (USD only: a foreign
-- currency invoice goes through a recorded payment, which handles FX).
create or replace function lp_private.deposit_invoice_match(
  p_org_id uuid, p_amount numeric, p_currency text, p_text text)
returns table(invoice_id uuid, invoice_number text, client_name text, balance_due numeric)
language sql stable
set search_path = public
as $$
  select i.id, i.invoice_number::text,
         coalesce(nullif(i.bill_to_company, ''), nullif(i.bill_to_name, ''), c.display_name)::text,
         i.balance_due
    from public.invoices i
    left join public.clients c on c.id = i.client_id
   where p_amount > 0
     and i.org_id = p_org_id
     and i.status in ('sent', 'viewed', 'partial', 'overdue')
     and upper(i.currency) = 'USD'
     and upper(coalesce(p_currency, 'USD')) = 'USD'
     and abs(i.balance_due - p_amount) < 0.005
   order by (lp_private.receipt_word(coalesce(nullif(i.bill_to_company, ''), i.bill_to_name, c.display_name)) is not null
             and position(lp_private.receipt_word(coalesce(nullif(i.bill_to_company, ''), i.bill_to_name, c.display_name))
                          in lower(coalesce(p_text, ''))) > 0) desc,
            i.due_date
   limit 1
$$;

-- A recorded payment (sitting in Undeposited Funds) this deposit brings in.
create or replace function lp_private.deposit_payment_match(
  p_org_id uuid, p_amount numeric, p_currency text, p_date date)
returns table(payment_id uuid, invoice_number text, payment_date date, method text)
language sql stable
set search_path = public
as $$
  select p.id, i.invoice_number::text, p.payment_date, p.method
    from public.invoice_payments p
    join public.invoices i on i.id = p.invoice_id
   where p_amount > 0
     and p.org_id = p_org_id
     and p.transaction_id is null
     and upper(p.currency) = 'USD'
     and upper(coalesce(p_currency, 'USD')) = 'USD'
     and abs(p.amount - p_amount) < 0.005
     and p.payment_date between p_date - 30 and p_date
     and exists (select 1 from public.manual_journal_batches b
                  where b.source_payment_id = p.id and b.status = 'posted' and b.reverses_batch_id is null)
   order by p.payment_date desc
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
  v_items jsonb;
  v_total integer;
  v_ar    uuid := lp_private.find_system_account(p_org_id, 'ar');
  v_und   uuid := lp_private.find_system_account(p_org_id, 'undeposited');
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
                      s.account_id)                                   as suggested_account_id,
             case when im.invoice_id is not null and v_ar  is not null then 'invoice'
                  when pm.payment_id is not null and v_und is not null then 'deposit'
                  else s.source end                                   as suggestion_source,
             case when (im.invoice_id is not null and v_ar is not null)
                    or (pm.payment_id is not null and v_und is not null) then 95
                  else s.confidence end                               as suggestion_confidence,
             a.code        as suggested_account_code,
             a.name        as suggested_account_name,
             case when im.invoice_id is not null and v_ar is not null then jsonb_build_object(
                    'invoice_id', im.invoice_id, 'invoice_number', im.invoice_number,
                    'client_name', im.client_name, 'balance_due', im.balance_due) end as invoice_match,
             case when im.invoice_id is null and pm.payment_id is not null and v_und is not null then jsonb_build_object(
                    'payment_id', pm.payment_id, 'invoice_number', pm.invoice_number,
                    'payment_date', pm.payment_date, 'method', pm.method) end        as deposit_match,
             lp_private.transaction_has_receipt(t.transaction_group_id) as has_receipt
        from public.transactions t
        left join lateral lp_private.deposit_invoice_match(
               t.org_id, t.amount, t.currency,
               coalesce(t.merchant_name, '') || ' ' || coalesce(t.description, '')) im
               on p_client_id is null
        left join lateral lp_private.deposit_payment_match(
               t.org_id, t.amount, t.currency, t.transaction_date) pm
               on p_client_id is null and im.invoice_id is null
        left join lateral lp_private.suggest_account(
               t.org_id, t.client_id, coalesce(t.merchant_name, t.description), t.amount, t.vendor_id) s on true
        left join public.accounts a on a.id = coalesce(
               case when im.invoice_id is not null then v_ar end,
               case when pm.payment_id is not null then v_und end,
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
-- Neither teaches a merchant rule (deposit descriptions don't identify a
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
  v_inv_id  uuid;
  v_pay_id  uuid;
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
    raise exception 'At most 200 transactions per batch' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('audit_events:' || p_org_id::text, 0));

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_inv_id := nullif(v_item ->> 'invoice_id', '')::uuid;
      v_pay_id := nullif(v_item ->> 'payment_id', '')::uuid;

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
          'payment_id',          v_pay_id
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

revoke all on function lp_private.find_system_account(uuid, text)                       from public, anon, authenticated;
revoke all on function lp_private.ensure_system_account(uuid, text, uuid)                from public, anon, authenticated;
revoke all on function lp_private.usd_rate(text)                                         from public, anon, authenticated;
revoke all on function lp_private.post_ledger_batch(uuid, public.journal_entry_kind, date, text, uuid, text, jsonb, uuid, uuid, uuid)
                                                                                         from public, anon, authenticated;
revoke all on function lp_private.reverse_ledger_batch(uuid, uuid, date, text)           from public, anon, authenticated;
revoke all on function lp_private.sync_invoice_ledger(uuid)                              from public, anon, authenticated;
revoke all on function lp_private.sync_payment_ledger(uuid)                              from public, anon, authenticated;
revoke all on function lp_private.trg_invoice_ledger()                                   from public, anon, authenticated;
revoke all on function lp_private.trg_guard_invoice_items()                              from public, anon, authenticated;
revoke all on function lp_private.trg_invoice_payment_before()                           from public, anon, authenticated;
revoke all on function lp_private.trg_invoice_payment_after()                            from public, anon, authenticated;
revoke all on function lp_private.deposit_invoice_match(uuid, numeric, text, text)       from public, anon, authenticated;
revoke all on function lp_private.deposit_payment_match(uuid, numeric, text, date)       from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;

revoke all on function public.get_review_queue(uuid, uuid, integer)        from public, anon;
revoke all on function public.post_reviewed_transactions(uuid, jsonb)      from public, anon;
grant execute on function public.get_review_queue(uuid, uuid, integer)     to authenticated, service_role;
grant execute on function public.post_reviewed_transactions(uuid, jsonb)   to authenticated, service_role;
