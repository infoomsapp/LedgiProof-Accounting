-- Ledger integrity: opening balances that post, and reports that ignore drafts.
-- Applied as migration `ledger_integrity`. Kept here as the reference copy.
-- Depends on phase3_invoices_ledger (post_ledger_batch / reverse_ledger_batch).
--
-- Before:
--   · import_opening_balances() wrote to journal_lines (no such table) and to
--     journal_entries columns that don't exist -- it failed on every call. In
--     self mode it also resolved account codes across every client's chart,
--     and nothing stopped a second import from doubling every balance.
--   · post_ledger_batch() always wrote client_id NULL, so a firm client's
--     books could not receive a system-posted batch.
--   · Every report summed the lines of DRAFT manual batches (a batch whose
--     posting failed half-way still showed up in the P&L and balance sheet).
--
-- Now:
--   · Opening balances are one posted manual batch (entry_kind
--     'opening_balance') in the right scope, through post_ledger_batch -- the
--     same mechanism invoices use, visible and reversible in Journal Entries.
--     A second import is refused unless the caller asks to replace; replacing
--     reverses the old batch ON ITS OWN DATE, so history nets to zero.
--     accounts.opening_balance is NOT used (it stays 0): the ledger is the
--     single source of truth, so nothing is ever counted twice.
--   · Reports count a journal line only when it is not part of a draft batch.

-- ── post_ledger_batch / reverse_ledger_batch: scope-aware ──────────────────

drop function if exists lp_private.post_ledger_batch(uuid, public.journal_entry_kind, date, text, uuid, text, jsonb, uuid, uuid, uuid);

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
  p_reverses   uuid default null,
  p_client_id  uuid default null
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
    p_org_id, p_client_id, p_kind, p_date,
    extract(year from p_date)::smallint, extract(month from p_date)::smallint,
    p_memo, p_user, 'draft', p_invoice_id, p_payment_id, p_reverses
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

-- A dated reversal: an opposite batch on p_date (never before the original);
-- the original is marked reversed. Both stay in the ledger and net to zero.
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
    b.source_invoice_id, b.source_payment_id, b.id, b.client_id);

  update public.manual_journal_batches
     set status = 'reversed', reversed_by_batch_id = v_new
   where id = b.id;
  return v_new;
end;
$$;

-- ── Opening balances ────────────────────────────────────────────────────────

drop function if exists public.import_opening_balances(uuid, date, jsonb, text, uuid);

create or replace function public.import_opening_balances(
  p_org_id          uuid,
  p_transition_date date,
  p_rows            jsonb,
  p_memo            text    default 'Opening balances import',
  p_client_id       uuid    default null,
  p_replace         boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_row       jsonb;
  v_code      text;
  v_debit     numeric;
  v_credit    numeric;
  v_acct      public.accounts%rowtype;
  v_seen      text[] := '{}';
  v_missing   text[] := '{}';
  v_headers   text[] := '{}';
  v_lines     jsonb  := '[]'::jsonb;
  v_td        numeric := 0;
  v_tc        numeric := 0;
  v_cur       text;
  v_rate      numeric;
  v_usd_d     numeric := 0;
  v_usd_c     numeric := 0;
  v_existing  public.manual_journal_batches%rowtype;
  v_batch     uuid;
  v_n         integer := 0;
begin
  perform public.lp_assert_can_import(p_org_id);

  if p_transition_date is null then
    raise exception using errcode = 'LO001', message = 'Choose the date of these balances';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 2 then
    raise exception using errcode = 'LO002', message = 'Opening balances need at least two accounts with an amount';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception using errcode = 'LO003', message = 'At most 2,000 accounts per import';
  end if;
  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and org_id = p_org_id
  ) then
    raise exception 'That client is not part of this workspace' using errcode = '42501';
  end if;

  -- The books' currency: the client's when importing a firm client, else the workspace's.
  select upper(coalesce(
           case when p_client_id is not null
                then (select nullif(c.default_currency, '') from public.clients c where c.id = p_client_id) end,
           (select o.currency from public.organizations o where o.id = p_org_id),
           'USD'))
    into v_cur;
  v_rate := lp_private.usd_rate(v_cur);

  -- Validate every row before writing anything.
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_code   := btrim(v_row ->> 'account_code');
    v_debit  := round(coalesce(nullif(v_row ->> 'debit',  '')::numeric, 0), 2);
    v_credit := round(coalesce(nullif(v_row ->> 'credit', '')::numeric, 0), 2);

    if v_code is null or v_code = '' then
      raise exception using errcode = 'LO004', message = 'A row has no account code';
    end if;
    if v_code = any(v_seen) then
      raise exception using errcode = 'LO005', message = format('Account %s appears twice', v_code),
        detail = jsonb_build_object('code', v_code)::text;
    end if;
    v_seen := v_seen || v_code;
    if v_debit < 0 or v_credit < 0 then
      raise exception using errcode = 'LO006', message = format('Account %s: negative amounts are not allowed', v_code),
        detail = jsonb_build_object('code', v_code)::text;
    end if;
    if v_debit > 0 and v_credit > 0 then
      raise exception using errcode = 'LO007', message = format('Account %s: enter a debit or a credit, not both', v_code),
        detail = jsonb_build_object('code', v_code)::text;
    end if;
    if v_debit = 0 and v_credit = 0 then
      continue;   -- a zero balance has nothing to post
    end if;

    -- Exactly this scope's chart: the workspace's own accounts in self mode,
    -- the client's in firm mode -- never another client's account.
    select * into v_acct
      from public.accounts
     where org_id = p_org_id
       and client_id is not distinct from p_client_id
       and code = v_code
       and is_active
     limit 1;
    if not found then
      v_missing := v_missing || v_code;
      continue;
    end if;
    if not lp_private.is_leaf_account(v_acct.id) then
      v_headers := v_headers || v_code;
      continue;
    end if;

    v_td := v_td + v_debit;
    v_tc := v_tc + v_credit;
    v_lines := v_lines || jsonb_build_object(
      'account_id', v_acct.id,
      'entry_type', case when v_debit > 0 then 'debit' else 'credit' end,
      'amount',     greatest(v_debit, v_credit),
      'amount_usd', round(greatest(v_debit, v_credit) / v_rate, 2),
      'memo',       nullif(btrim(coalesce(v_row ->> 'memo', '')), ''));
    v_n := v_n + 1;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception using errcode = 'LO008',
      message = 'These account codes are not in this chart of accounts: ' || array_to_string(v_missing, ', '),
      detail  = jsonb_build_object('codes', array_to_string(v_missing, ', '))::text;
  end if;
  if array_length(v_headers, 1) > 0 then
    raise exception using errcode = 'LO009',
      message = 'These accounts are group headings; use their sub-accounts: ' || array_to_string(v_headers, ', '),
      detail  = jsonb_build_object('codes', array_to_string(v_headers, ', '))::text;
  end if;
  if v_n < 2 then
    raise exception using errcode = 'LO002', message = 'Opening balances need at least two accounts with an amount';
  end if;
  if v_td <> v_tc then
    raise exception using errcode = 'LO010',
      message = format('Debits (%s) and credits (%s) must be equal — difference %s', v_td, v_tc, v_td - v_tc),
      detail  = jsonb_build_object('debit', v_td, 'credit', v_tc, 'difference', v_td - v_tc)::text;
  end if;

  -- USD rounding: keep the USD side balanced too (the difference, at most a
  -- few cents, goes on the largest credit line).
  if v_rate <> 1 then
    select coalesce(sum((l ->> 'amount_usd')::numeric) filter (where l ->> 'entry_type' = 'debit'), 0),
           coalesce(sum((l ->> 'amount_usd')::numeric) filter (where l ->> 'entry_type' = 'credit'), 0)
      into v_usd_d, v_usd_c
      from jsonb_array_elements(v_lines) l;
    if v_usd_d <> v_usd_c then
      select jsonb_agg(case when x.i = (select i from jsonb_array_elements(v_lines) with ordinality as y(l, i)
                                         where y.l ->> 'entry_type' = 'credit'
                                         order by (y.l ->> 'amount')::numeric desc limit 1)
                            then jsonb_set(x.l, '{amount_usd}', to_jsonb((x.l ->> 'amount_usd')::numeric + (v_usd_d - v_usd_c)))
                            else x.l end order by x.i)
        into v_lines
        from jsonb_array_elements(v_lines) with ordinality as x(l, i);
    end if;
  end if;

  -- One set of opening balances per set of books.
  select * into v_existing
    from public.manual_journal_batches
   where org_id = p_org_id
     and client_id is not distinct from p_client_id
     and entry_kind = 'opening_balance'
     and status = 'posted'
     and reverses_batch_id is null
   order by created_at desc
   limit 1;
  if v_existing.id is not null then
    if not coalesce(p_replace, false) then
      raise exception using errcode = 'LO011',
        message = format('Opening balances were already imported for %s. Replace them?', v_existing.effective_date),
        detail  = jsonb_build_object('date', v_existing.effective_date)::text;
    end if;
    -- Reversed on its own date, so the old balances never existed.
    perform lp_private.reverse_ledger_batch(v_existing.id, v_uid, v_existing.effective_date,
                                            'Opening balances replaced');
  end if;

  v_batch := lp_private.post_ledger_batch(
    p_org_id, 'opening_balance', p_transition_date,
    -- manual_journal_batches_memo_check: at least 5 characters.
    case when length(btrim(coalesce(p_memo, ''))) >= 5 then btrim(p_memo) else 'Opening balances import' end,
    v_uid, v_cur, v_lines, null, null, null, p_client_id);

  return jsonb_build_object(
    'batch_id',         v_batch,
    'journal_entry_id', v_batch,
    'lines_count',      v_n,
    'total_debit',      v_td,
    'total_credit',     v_tc,
    'currency',         v_cur,
    'transition_date',  p_transition_date,
    'replaced',         v_existing.id is not null
  );
end;
$$;

-- ── Reports: a draft batch's lines are not in the books ────────────────────
-- Every report already filters reversed transaction lines on je.is_reversed;
-- the same predicate now also excludes lines of draft manual batches. Written
-- inline (not a helper) because compute_account_balance runs as the caller.

do $$
declare
  f      record;
  v_def  text;
  v_new  text;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.oid::regprocedure::text in (
       'lp_private.get_firm_client_summary_impl(uuid,integer,integer)',
       'check_budget_variance(uuid,uuid,numeric,numeric)',
       'compute_account_balance(uuid,uuid,integer,integer)',
       'get_balance_sheet(uuid,integer,integer,uuid)',
       'get_budget_vs_actual(uuid,integer,integer,uuid)',
       'get_cash_flow(uuid,integer,integer,uuid)',
       'get_firm_pl(uuid,integer,integer)',
       'get_profit_and_loss(uuid,integer,integer,uuid)',
       'get_schedule_c_data(uuid,integer)')
  loop
    v_def := pg_get_functiondef(f.oid);
    if position('b.id = je.batch_id' in v_def) > 0 then
      continue;   -- already applied
    end if;
    v_new := regexp_replace(v_def,
      '(COALESCE\(je\.is_reversed, FALSE\) = FALSE|je\.is_reversed\s*=\s*FALSE)',
      '\1 AND (je.batch_id IS NULL OR EXISTS (SELECT 1 FROM public.manual_journal_batches b WHERE b.id = je.batch_id AND b.status <> ''draft''))',
      'gi');
    if v_new = v_def then
      raise exception 'ledger_integrity: no is_reversed predicate found in %', f.sig;
    end if;
    execute v_new;
  end loop;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on function lp_private.post_ledger_batch(uuid, public.journal_entry_kind, date, text, uuid, text, jsonb, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function lp_private.reverse_ledger_batch(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;

revoke all on function public.import_opening_balances(uuid, date, jsonb, text, uuid, boolean) from public, anon;
grant execute on function public.import_opening_balances(uuid, date, jsonb, text, uuid, boolean) to authenticated, service_role;
