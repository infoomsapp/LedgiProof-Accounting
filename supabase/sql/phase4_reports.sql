-- Phase 4 (reports): one source of ledger lines; P&L by date range, trial
-- balance, general ledger, AR/AP aging and the dashboard snapshot on top of it.
-- Applied as migration `phase4_reports`. Reference copy.
--
-- Before:
--   · P&L only year-to-date by month; no trial balance, general ledger, or
--     AR/AP aging (get_firm_ar_aging: firm totals only, no detail).
--   · The solo and portal (pyme) dashboards computed "income", "expenses" and
--     "profit" by summing BANK transactions -- transfers, loans, owner money
--     and the deposit that pays an invoice (already revenue when the invoice
--     was issued) all counted as income. They never matched the P&L.
--
-- Now:
--   · lp_private.ledger_lines(org, client, from, to): every journal line of a
--     set of books with its real date (the transaction's date, or the batch's
--     effective date), reversed transaction lines and draft batches excluded --
--     the same rule every report already uses. All new reports read it.
--   · get_profit_and_loss_range(org, from, to, client): any date range.
--     get_profit_and_loss(year, month) is now that range from Jan 1 to the end
--     of the month (same output) -- one implementation, not two.
--   · get_trial_balance(org, as_of, client), get_general_ledger(org, from, to,
--     client, account), get_aging(org, 'ar'|'ap', as_of): documents by bucket
--     and party, plus the part of the AR/AP ledger balance no open document
--     explains (opening balances imported from another system).
--     get_firm_ar_aging keeps its output and derives from get_aging.
--   · get_books_snapshot(org, client): owed to you, you owe, cash, this
--     month's profit -- all from the ledger. The solo and pyme dashboards'
--     income / expenses / profit now come from the same place.
--   · lp_private.is_cash_account(): the one definition of "a bank or cash
--     account" (default_cash_account and the snapshot both use it).

-- ── Who may read a set of books ────────────────────────────────────────────

-- Staff of the org read any of its books; a client-portal user reads only
-- their own client's books. Same rule get_profit_and_loss always applied.
create or replace function lp_private.assert_books_access(p_org_id uuid, p_client_id uuid)
returns void
language plpgsql stable
set search_path = public
as $$
begin
  if lp_private.is_trusted_caller() or public.is_super_admin() or public.is_org_member(p_org_id) then
    return;
  end if;
  if p_client_id is not null and exists (
    select 1 from public.client_portal_users
     where client_id = p_client_id and profile_id = auth.uid() and is_active
  ) then
    return;
  end if;
  raise exception 'unauthorized: no access to these books' using errcode = '42501';
end;
$$;

-- ── The ledger, line by line ────────────────────────────────────────────────

create or replace function lp_private.ledger_lines(
  p_org_id uuid, p_client_id uuid, p_from date, p_to date)
returns table(
  line_id uuid, account_id uuid, entry_type public.entry_type_enum, amount numeric,
  line_date date, memo text, transaction_id uuid, batch_id uuid, entry_kind public.journal_entry_kind)
language sql stable
set search_path = public
as $$
  select je.id, je.account_id, je.entry_type, coalesce(je.amount_usd, je.amount),
         coalesce(t.transaction_date, b.effective_date),
         coalesce(je.memo, b.memo, t.merchant_name, t.description),
         je.transaction_id, je.batch_id, je.entry_kind
    from public.journal_entries je
    join public.accounts a on a.id = je.account_id
    left join public.transactions t on t.id = je.transaction_id
    left join public.manual_journal_batches b on b.id = je.batch_id
   where a.org_id = p_org_id
     and a.client_id is not distinct from p_client_id
     and je.is_reversed = false
     and (je.batch_id is null or b.status <> 'draft')
     and coalesce(t.transaction_date, b.effective_date) between coalesce(p_from, '1900-01-01') and coalesce(p_to, '2999-12-31')
$$;

-- "A bank or cash account": the one definition.
create or replace function lp_private.is_cash_account(p_account public.accounts)
returns boolean
language sql stable
set search_path = public
as $$
  select p_account.type = 'asset'
     and p_account.is_active
     and lp_private.is_leaf_account(p_account.id)
     and (p_account.cash_flow_category = 'cash' or lower(p_account.name) ~ '(checking|cash|bank)')
     and lower(p_account.name) !~ '(undeposited|in transit)'
$$;

create or replace function lp_private.default_cash_account(p_org_id uuid, p_client_id uuid)
returns uuid
language sql stable
set search_path = public
as $$
  select a.id
    from public.accounts a
   where a.org_id = p_org_id
     and a.client_id is not distinct from p_client_id
     and lp_private.is_cash_account(a)
   order by (a.cash_flow_category = 'cash') desc nulls last, a.code
   limit 1
$$;

-- ── P&L by date range ───────────────────────────────────────────────────────

create or replace function public.get_profit_and_loss_range(
  p_org_id uuid, p_from date, p_to date, p_client_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  perform lp_private.assert_books_access(p_org_id, p_client_id);
  if p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = 'LT001', message = 'Choose a valid date range';
  end if;

  select coalesce(jsonb_agg(r order by r ->> 'code'), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
               'account_id', a.id, 'code', a.code, 'name', a.name, 'type', a.type,
               'debit',  coalesce(sum(l.amount) filter (where l.entry_type = 'debit'),  0),
               'credit', coalesce(sum(l.amount) filter (where l.entry_type = 'credit'), 0)) r
        from lp_private.ledger_lines(p_org_id, p_client_id, p_from, p_to) l
        join public.accounts a on a.id = l.account_id
       where a.type in ('income', 'expense')
       group by a.id, a.code, a.name, a.type
    ) x;
  return v_rows;
end;
$$;

-- Year-to-date through a month: the same thing, one implementation.
create or replace function public.get_profit_and_loss(
  p_org_id uuid, p_year integer, p_month integer default 12, p_client_id uuid default null)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select public.get_profit_and_loss_range(
    p_org_id,
    make_date(p_year, 1, 1),
    (make_date(p_year, least(greatest(coalesce(p_month, 12), 1), 12), 1) + interval '1 month - 1 day')::date,
    p_client_id)
$$;

-- Income, expenses and net for a range (dashboards, snapshot).
create or replace function lp_private.pl_totals(p_org_id uuid, p_client_id uuid, p_from date, p_to date)
returns table(income numeric, expenses numeric, net numeric)
language sql stable
set search_path = public
as $$
  with s as (
    select a.type,
           sum(case when l.entry_type = 'credit' then l.amount else -l.amount end) as credit_net
      from lp_private.ledger_lines(p_org_id, p_client_id, p_from, p_to) l
      join public.accounts a on a.id = l.account_id
     where a.type in ('income', 'expense')
     group by a.type
  )
  select round(coalesce((select credit_net from s where type = 'income'), 0), 2),
         round(coalesce(-(select credit_net from s where type = 'expense'), 0), 2),
         round(coalesce((select sum(credit_net) from s), 0), 2)
$$;

-- ── Trial balance ───────────────────────────────────────────────────────────

create or replace function public.get_trial_balance(
  p_org_id uuid, p_as_of date default current_date, p_client_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_dr   numeric;
  v_cr   numeric;
begin
  perform lp_private.assert_books_access(p_org_id, p_client_id);

  with bal as (
    select a.id, a.code, a.name, a.type,
           sum(case when l.entry_type = 'debit' then l.amount else -l.amount end) as net
      from lp_private.ledger_lines(p_org_id, p_client_id, null, coalesce(p_as_of, current_date)) l
      join public.accounts a on a.id = l.account_id
     group by a.id, a.code, a.name, a.type
    having round(sum(case when l.entry_type = 'debit' then l.amount else -l.amount end), 2) <> 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'account_id', id, 'code', code, 'name', name, 'type', type,
           'debit',  case when net > 0 then round(net, 2) else 0 end,
           'credit', case when net < 0 then round(-net, 2) else 0 end) order by code), '[]'::jsonb),
         coalesce(sum(case when net > 0 then round(net, 2) else 0 end), 0),
         coalesce(sum(case when net < 0 then round(-net, 2) else 0 end), 0)
    into v_rows, v_dr, v_cr
    from bal;

  return jsonb_build_object(
    'as_of', coalesce(p_as_of, current_date), 'rows', v_rows,
    'total_debit', v_dr, 'total_credit', v_cr, 'balanced', v_dr = v_cr);
end;
$$;

-- ── General ledger ──────────────────────────────────────────────────────────

create or replace function public.get_general_ledger(
  p_org_id uuid, p_from date, p_to date, p_client_id uuid default null, p_account_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_accounts jsonb;
begin
  perform lp_private.assert_books_access(p_org_id, p_client_id);
  if p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = 'LT001', message = 'Choose a valid date range';
  end if;

  with opening as (
    select l.account_id, sum(case when l.entry_type = 'debit' then l.amount else -l.amount end) as net
      from lp_private.ledger_lines(p_org_id, p_client_id, null, p_from - 1) l
     group by l.account_id
  ), lines as (
    select l.*, sum(case when l.entry_type = 'debit' then l.amount else -l.amount end)
                  over (partition by l.account_id order by l.line_date, l.line_id) as running
      from lp_private.ledger_lines(p_org_id, p_client_id, p_from, p_to) l
  ), accts as (
    select a.id, a.code, a.name, a.type, a.normal_balance
      from public.accounts a
     where a.org_id = p_org_id and a.client_id is not distinct from p_client_id
       and (p_account_id is null or a.id = p_account_id)
       and (exists (select 1 from lines where lines.account_id = a.id)
            or coalesce((select round(net, 2) from opening where opening.account_id = a.id), 0) <> 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'account_id', a.id, 'code', a.code, 'name', a.name, 'type', a.type,
           'normal_balance', a.normal_balance,
           'opening', round(coalesce(o.net, 0), 2),
           'closing', round(coalesce(o.net, 0) + coalesce((select sum(case when l.entry_type = 'debit' then l.amount else -l.amount end)
                                                             from lines l where l.account_id = a.id), 0), 2),
           'lines', coalesce((select jsonb_agg(jsonb_build_object(
                        'date', l.line_date, 'memo', l.memo, 'kind', l.entry_kind,
                        'transaction_id', l.transaction_id, 'batch_id', l.batch_id,
                        'debit',  case when l.entry_type = 'debit'  then round(l.amount, 2) else 0 end,
                        'credit', case when l.entry_type = 'credit' then round(l.amount, 2) else 0 end,
                        'balance', round(coalesce(o.net, 0) + l.running, 2)) order by l.line_date, l.line_id)
                        from lines l where l.account_id = a.id), '[]'::jsonb)
         ) order by a.code), '[]'::jsonb)
    into v_accounts
    from accts a
    left join opening o on o.account_id = a.id;

  -- balances are debit-positive: a credit-normal account shows negative here;
  -- the UI flips the sign for display using normal_balance.
  return jsonb_build_object('from', p_from, 'to', p_to, 'accounts', v_accounts);
end;
$$;

-- ── AR / AP aging ───────────────────────────────────────────────────────────

create or replace function public.get_aging(
  p_org_id uuid, p_kind text, p_as_of date default current_date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_as_of  date := coalesce(p_as_of, current_date);
  v_ledger numeric;
  v_docs   jsonb;
  v_open   numeric;
  v_acct   uuid;
begin
  -- Invoices and bills live in the workspace's own books.
  perform lp_private.assert_books_access(p_org_id, null);
  if p_kind not in ('ar', 'ap') then
    raise exception using errcode = 'LT002', message = 'Aging is either receivables (ar) or payables (ap)';
  end if;

  with docs as (
    select i.id, i.invoice_number::text as number, i.issue_date as doc_date, i.due_date,
           i.balance_due as open_amount,
           coalesce(nullif(i.bill_to_company, ''), nullif(i.bill_to_name, ''), c.display_name, 'Customer')::text as party
      from public.invoices i
      left join public.clients c on c.id = i.client_id
     where p_kind = 'ar'
       and i.org_id = p_org_id
       and i.status in ('sent', 'viewed', 'partial', 'overdue')
       and i.balance_due > 0
       and i.issue_date <= v_as_of
    union all
    select b.id, b.bill_number, b.bill_date, b.due_date, b.amount,
           coalesce(nullif(btrim(v.dba_name), ''), v.legal_name, 'Vendor')::text
      from public.vendor_bills b
      left join public.vendors v on v.id = b.vendor_id
     where p_kind = 'ap'
       and b.org_id = p_org_id
       and b.client_id is null
       and b.status in ('pending', 'overdue')
       and b.bill_date <= v_as_of
  ), bucketed as (
    select d.*, (v_as_of - d.due_date) as days_past_due,
           case when v_as_of - d.due_date <= 0  then 'current'
                when v_as_of - d.due_date <= 30 then 'd1_30'
                when v_as_of - d.due_date <= 60 then 'd31_60'
                when v_as_of - d.due_date <= 90 then 'd61_90'
                else 'd90_plus' end as bucket
      from docs d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'number', number, 'party', party, 'date', doc_date, 'due_date', due_date,
           'amount', round(open_amount, 2), 'days_past_due', days_past_due, 'bucket', bucket)
           order by party, due_date), '[]'::jsonb),
         coalesce(sum(open_amount), 0)
    into v_docs, v_open
    from bucketed;

  v_acct := lp_private.find_system_account(p_org_id, case p_kind when 'ar' then 'ar' else 'ap' end);
  select coalesce(sum(case when l.entry_type = 'debit' then l.amount else -l.amount end), 0)
    into v_ledger
    from lp_private.ledger_lines(p_org_id, null, null, v_as_of) l
   where l.account_id = v_acct;
  if p_kind = 'ap' then
    v_ledger := -v_ledger;   -- AP is credit-normal
  end if;

  return jsonb_build_object(
    'kind', p_kind, 'as_of', v_as_of,
    'documents', v_docs,
    'buckets', (select jsonb_object_agg(k, coalesce((select round(sum((d ->> 'amount')::numeric), 2)
                                                      from jsonb_array_elements(v_docs) d where d ->> 'bucket' = k), 0))
                  from unnest(array['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus']) k),
    'bucket_counts', (select jsonb_object_agg(k, (select count(*) from jsonb_array_elements(v_docs) d where d ->> 'bucket' = k))
                        from unnest(array['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus']) k),
    'total_documents', round(v_open, 2),
    'ledger_balance', round(v_ledger, 2),
    -- The part of the ledger balance no open document explains (e.g. an
    -- opening balance imported from another system). Shown, never hidden.
    'unapplied', round(v_ledger - v_open, 2));
end;
$$;

-- The firm panel keeps its shape; the numbers come from get_aging.
create or replace function public.get_firm_ar_aging(p_org_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not (public.is_org_member(p_org_id) or public.is_super_admin()) then
    return jsonb_build_object('error', 'Not a member of this organization');
  end if;
  v := public.get_aging(p_org_id, 'ar', current_date);
  return jsonb_build_object(
    'generated_at', now(),
    'total_outstanding', v -> 'total_documents',
    'total_count', jsonb_array_length(v -> 'documents'),
    'buckets', (select jsonb_object_agg(k, jsonb_build_object(
                         'amount', v -> 'buckets' -> k, 'count', v -> 'bucket_counts' -> k))
                  from unnest(array['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus']) k));
end;
$$;

-- ── Dashboard snapshot ──────────────────────────────────────────────────────

create or replace function public.get_books_snapshot(p_org_id uuid, p_client_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', current_date)::date;
  v_mtd   record;
  v_prev  record;
  v_cash  numeric;
  v_ar    numeric := 0;
  v_ap    numeric := 0;
  v_ar_overdue numeric := 0;
  v_ap_overdue numeric := 0;
  v_review integer;
  v_aging jsonb;
begin
  perform lp_private.assert_books_access(p_org_id, p_client_id);

  select * into v_mtd  from lp_private.pl_totals(p_org_id, p_client_id, v_month_start, current_date);
  select * into v_prev from lp_private.pl_totals(p_org_id, p_client_id,
                                                  (v_month_start - interval '1 month')::date, v_month_start - 1);

  select coalesce(sum(case when l.entry_type = 'debit' then l.amount else -l.amount end), 0)
    into v_cash
    from lp_private.ledger_lines(p_org_id, p_client_id, null, current_date) l
    join public.accounts a on a.id = l.account_id
   where lp_private.is_cash_account(a);

  -- Receivables and payables live in the workspace's own books.
  if p_client_id is null then
    v_aging := public.get_aging(p_org_id, 'ar', current_date);
    v_ar := (v_aging ->> 'ledger_balance')::numeric;
    v_ar_overdue := (select coalesce(sum((d ->> 'amount')::numeric), 0)
                       from jsonb_array_elements(v_aging -> 'documents') d where (d ->> 'days_past_due')::int > 0);
    v_aging := public.get_aging(p_org_id, 'ap', current_date);
    v_ap := (v_aging ->> 'ledger_balance')::numeric;
    v_ap_overdue := (select coalesce(sum((d ->> 'amount')::numeric), 0)
                       from jsonb_array_elements(v_aging -> 'documents') d where (d ->> 'days_past_due')::int > 0);
  end if;

  select count(*) into v_review
    from public.transactions t
   where t.org_id = p_org_id and t.client_id is not distinct from p_client_id
     and t.is_current and t.locked_at is null
     and not exists (select 1 from public.journal_entries je where je.transaction_id = t.id and not je.is_reversed);

  return jsonb_build_object(
    'as_of',           current_date,
    'owed_to_you',     round(v_ar, 2),
    'owed_overdue',    round(v_ar_overdue, 2),
    'you_owe',         round(v_ap, 2),
    'you_owe_overdue', round(v_ap_overdue, 2),
    'cash',            round(v_cash, 2),
    'month', jsonb_build_object('from', v_month_start, 'to', current_date,
                                'income', v_mtd.income, 'expenses', v_mtd.expenses, 'profit', v_mtd.net),
    'last_month', jsonb_build_object('income', v_prev.income, 'expenses', v_prev.expenses, 'profit', v_prev.net),
    -- Not in the numbers above until categorized in "For review".
    'to_review', v_review);
end;
$$;

-- ── Dashboards read the ledger ──────────────────────────────────────────────
-- get_solo_dashboard and get_pyme_dashboard keep their output; their income /
-- expenses / profit are now the ledger's (lp_private.pl_totals), not the sum of
-- bank transactions. tx_count keeps counting bank transactions.

do $$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  -- solo: quarter and year-to-date
  v_def := pg_get_functiondef('public.get_solo_dashboard(uuid,integer,integer)'::regprocedure);
  if position('lp_private.pl_totals' in v_def) = 0 then
    v_def := replace(v_def, $o$  v_q_net_profit := v_q_income - v_q_expenses;$o$,
      $n$  SELECT income, expenses INTO v_q_income, v_q_expenses
    FROM lp_private.pl_totals(p_org_id, NULL, v_q_start, v_q_end);
  v_q_net_profit := v_q_income - v_q_expenses;$n$);
    v_def := replace(v_def, $o$  v_y_net_profit := v_y_income - v_y_expenses;$o$,
      $n$  SELECT income, expenses INTO v_y_income, v_y_expenses
    FROM lp_private.pl_totals(p_org_id, NULL, v_y_start, v_y_end);
  v_y_net_profit := v_y_income - v_y_expenses;$n$);
    if (length(v_def) - length(replace(v_def, 'lp_private.pl_totals', ''))) / length('lp_private.pl_totals') <> 2 then
      raise exception 'phase4_reports: solo dashboard KPI blocks not found';
    end if;
    execute v_def;
  end if;

  -- pyme: this month and last month
  v_def := pg_get_functiondef('public.get_pyme_dashboard(uuid)'::regprocedure);
  if position('lp_private.pl_totals' in v_def) = 0 then
    v_old := $o$  SELECT jsonb_build_object(
    'income',     income,
    'expenses',   expenses,
    'net_profit', income - expenses,
    'tx_count',   tx_count
  ) INTO v_kpis_this FROM this_month;$o$;
    v_new := $n$  SELECT jsonb_build_object(
    'income',     p.income,
    'expenses',   p.expenses,
    'net_profit', p.net,
    'tx_count',   tm.tx_count
  ) INTO v_kpis_this
    FROM this_month tm,
         lp_private.pl_totals(v_client_row.org_id, p_client_id, v_month_start, v_month_end) p;$n$;
    if position(v_old in v_def) = 0 then
      raise exception 'phase4_reports: pyme this-month block not found';
    end if;
    v_def := replace(v_def, v_old, v_new);
    v_old := $o$  SELECT jsonb_build_object(
    'income',     income,
    'expenses',   expenses,
    'net_profit', income - expenses,
    'tx_count',   tx_count
  ) INTO v_kpis_prev FROM last_month;$o$;
    v_new := $n$  SELECT jsonb_build_object(
    'income',     p.income,
    'expenses',   p.expenses,
    'net_profit', p.net,
    'tx_count',   lm.tx_count
  ) INTO v_kpis_prev
    FROM last_month lm,
         lp_private.pl_totals(v_client_row.org_id, p_client_id, v_last_month_start, v_last_month_end) p;$n$;
    if position(v_old in v_def) = 0 then
      raise exception 'phase4_reports: pyme last-month block not found';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on function lp_private.assert_books_access(uuid, uuid)                 from public, anon, authenticated;
revoke all on function lp_private.ledger_lines(uuid, uuid, date, date)            from public, anon, authenticated;
revoke all on function lp_private.is_cash_account(public.accounts)                from public, anon, authenticated;
revoke all on function lp_private.default_cash_account(uuid, uuid)                from public, anon, authenticated;
revoke all on function lp_private.pl_totals(uuid, uuid, date, date)               from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;

revoke all on function public.get_profit_and_loss_range(uuid, date, date, uuid)   from public, anon;
revoke all on function public.get_profit_and_loss(uuid, integer, integer, uuid)   from public, anon;
revoke all on function public.get_trial_balance(uuid, date, uuid)                 from public, anon;
revoke all on function public.get_general_ledger(uuid, date, date, uuid, uuid)    from public, anon;
revoke all on function public.get_aging(uuid, text, date)                         from public, anon;
revoke all on function public.get_firm_ar_aging(uuid)                             from public, anon;
revoke all on function public.get_books_snapshot(uuid, uuid)                      from public, anon;
grant execute on function public.get_profit_and_loss_range(uuid, date, date, uuid) to authenticated, service_role;
grant execute on function public.get_profit_and_loss(uuid, integer, integer, uuid) to authenticated, service_role;
grant execute on function public.get_trial_balance(uuid, date, uuid)               to authenticated, service_role;
grant execute on function public.get_general_ledger(uuid, date, date, uuid, uuid)  to authenticated, service_role;
grant execute on function public.get_aging(uuid, text, date)                       to authenticated, service_role;
grant execute on function public.get_firm_ar_aging(uuid)                           to authenticated, service_role;
grant execute on function public.get_books_snapshot(uuid, uuid)                    to authenticated, service_role;
