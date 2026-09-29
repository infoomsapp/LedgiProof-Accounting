-- ════════════════════════════════════════════════════════════════════════════
-- Semaphore v2 -- one meaning, one place, one categorization engine
-- Applied as migration `semaphore_v2` (2026-09-28).
--
-- LedgiProof's rule:
--   blue  = VERIFIED. A person confirmed it (owner categorizing in For review,
--           or the accountant verifying). Never set by a machine.
--   green = READY. It is in the books and nothing is flagged; it waits for a
--           person to verify it.
--   amber = NEEDS YOUR EYES. Not in the books yet, or a review rule fired.
--   red   = PROBLEM. A critical rule fired (possible duplicate, over the
--           approval limit…) or someone rejected it.
--
-- The colour is DERIVED here, never written by callers:
--   derive_semaphore(risk_status, review_status, verified?, in the books?)
-- risk_status is the Brain's verdict at ingest (red|amber|green, never blue).
-- "In the books" = at least one live (non-reversed) journal line.
--
-- What this replaces (all removed):
--   · score_to_semaphore / sync_semaphore_from_score: a confidence of 90+
--     turned a transaction blue -- including one a client had just REJECTED.
--   · accept_document_and_close: unused, callable by anyone with any reviewer id.
--   · plaid-sync's own category map, which posted journal lines straight into
--     the ledger (transfers as revenue, card spend against checking, invoice
--     payments counted twice) and painted them blue with no one looking.
--
-- Automation ("seeded learning"):
--   · SEEDS (lp_private.categorization_seeds): known merchants and Plaid
--     categories suggest an account from day one. Suggestions only.
--   · LEARNING (user_patterns): every confirmation of a merchant raises its
--     confidence; confirming a different account resets it.
--   · GRADUATION: a merchant confirmed to the same account 3 times in a row
--     (confidence 94+), or an explicit rule, posts by itself -> green.
--     Exact, unique matches to an open invoice, a recorded payment or a bill
--     post by themselves too. Everything else waits in For review.
--   · CORRECTION: removing an automatic category sends the merchant back to
--     "ask me" (its learned count drops to zero).
--
-- Error codes (one per error): LV004 verified without Verify, LV005 verify
-- before categorizing, LV006 remove a category that isn't there, LV007
-- reconciled, LV008 matched to an invoice/bill/payment, LV009 un-verify by a
-- direct edit.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. Old score→colour machinery ───────────────────────────────────────────
drop trigger  if exists trg_sync_semaphore_from_score on public.transactions;
drop function if exists public.sync_semaphore_from_score();
drop function if exists public.accept_document_and_close(uuid, uuid, smallint);
drop function if exists public.score_to_semaphore(smallint);

-- ── 1. The Brain's verdict gets its own column ──────────────────────────────
alter table public.transactions
  add column if not exists risk_status public.semaphore_status not null default 'green';
do $$ begin
  alter table public.transactions
    add constraint transactions_risk_status_not_blue check (risk_status <> 'blue');
exception when duplicate_object then null; end $$;
comment on column public.transactions.risk_status is
  'Brain verdict at ingest: red (critical rule), amber (review rule), green (nothing flagged). Never blue.';
comment on column public.transactions.semaphore is
  'Derived by lp_private.trg_derive_semaphore -- do not write. blue verified, green ready, amber needs eyes, red problem.';

-- ── 2. Derivation ────────────────────────────────────────────────────────────
create or replace function lp_private.transaction_in_books(p_tx uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from public.journal_entries je
                  where je.transaction_id = p_tx and not je.is_reversed)
$$;

create or replace function lp_private.derive_semaphore(
  p_risk public.semaphore_status, p_review public.review_status,
  p_verified boolean, p_in_books boolean)
returns public.semaphore_status language sql immutable as $$
  select (case
    when p_review = 'rejected'                                    then 'red'
    when p_verified and p_in_books                                then 'blue'
    when p_risk = 'red'                                           then 'red'
    when not p_in_books or p_risk = 'amber' or p_review = 'escalated' then 'amber'
    else 'green'
  end)::public.semaphore_status
$$;

-- security definer: lp_private is invisible to signed-in users, and this runs
-- on their inserts/updates (applied as semaphore_v2_f/g/h).
create or replace function lp_private.trg_derive_semaphore()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_in_books  boolean;
  v_verifying boolean := coalesce(current_setting('lp.verifying', true), '') = 'on';
begin
  -- Verification is a person's act and goes through Verify / For review only.
  if new.approved_by is not null
     and (tg_op = 'INSERT' or new.approved_by is distinct from old.approved_by)
     and not v_verifying then
    raise exception using errcode = 'LV004',
      message = 'Use Verify to mark a transaction as verified';
  end if;

  v_in_books := tg_op = 'UPDATE' and lp_private.transaction_in_books(new.id);

  -- Un-verifying is not a direct edit either: only removing the category
  -- (uncategorize, or a retired version) clears it, and that is audited.
  if tg_op = 'UPDATE' and old.approved_by is not null and new.approved_by is null
     and v_in_books and not v_verifying then
    raise exception using errcode = 'LV009',
      message = 'A verified transaction stays verified. Remove its category to change it.';
  end if;

  -- A verification is of a categorization: no categorization, nothing verified.
  if not v_in_books then
    new.approved_by := null;
    new.approved_at := null;
  end if;

  new.semaphore := lp_private.derive_semaphore(
    new.risk_status, new.review_status, new.approved_by is not null, v_in_books);
  new.requires_review := new.semaphore in ('amber', 'red');
  return new;
end;
$$;
revoke all on function lp_private.trg_derive_semaphore() from public;

-- Named to sort first, so guard_reconciled_transaction sees the derived colour.
drop trigger if exists trg_0_derive_semaphore on public.transactions;
create trigger trg_0_derive_semaphore
  before insert or update on public.transactions
  for each row execute function lp_private.trg_derive_semaphore();

-- Journal lines coming or going re-derive their transaction.
create or replace function lp_private.trg_journal_touch_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' and old.transaction_id is not null then
    update public.transactions set updated_at = now() where id = old.transaction_id;
  end if;
  if tg_op <> 'DELETE' and new.transaction_id is not null
     and (tg_op = 'INSERT' or new.transaction_id is distinct from old.transaction_id
          or new.is_reversed is distinct from old.is_reversed) then
    update public.transactions set updated_at = now() where id = new.transaction_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_journal_touch_transaction on public.journal_entries;
create trigger trg_journal_touch_transaction
  after insert or update or delete on public.journal_entries
  for each row execute function lp_private.trg_journal_touch_transaction();

-- ── 3. Period lock: verifying is not changing the books ─────────────────────
create or replace function public.enforce_period_lock_on_transactions()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_status public.period_status;
begin
  -- Review/verification columns may change in a closed month; the money may not.
  if tg_op = 'UPDATE'
     and new.org_id = old.org_id
     and new.client_id        is not distinct from old.client_id
     and new.amount           is not distinct from old.amount
     and new.currency         is not distinct from old.currency
     and new.transaction_date is not distinct from old.transaction_date
     and new.is_current       is not distinct from old.is_current then
    return new;
  end if;

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

-- ── 4. A retired version takes its journal lines with it ────────────────────
-- Editing a transaction creates a new version; Plaid can withdraw one. Either
-- way the old row stops being current and its lines must stop counting, or the
-- ledger double-counts (old lines live, new version back in For review).
create or replace function lp_private.transaction_link(p_tx uuid)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select 'invoice ' || i.invoice_number from public.invoice_payments p
       join public.invoices i on i.id = p.invoice_id where p.transaction_id = p_tx limit 1),
    (select 'bill ' || coalesce(nullif(b.bill_number, ''), 'for ' || b.amount::text)
       from public.vendor_bills b where b.transaction_id = p_tx limit 1))
$$;

create or replace function lp_private.trg_retire_transaction_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_link text;
begin
  if old.is_current and not new.is_current and lp_private.transaction_in_books(new.id) then
    v_link := lp_private.transaction_link(new.id);
    if v_link is not null then
      raise exception using errcode = 'LV008',
        message = format('This transaction is matched to %s. Undo that match first.', v_link),
        detail  = jsonb_build_object('document', v_link)::text;
    end if;
    update public.journal_entries
       set is_reversed = true
     where transaction_id = new.id and not is_reversed and batch_id is null;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_retire_transaction_version on public.transactions;
create trigger trg_retire_transaction_version
  after update of is_current on public.transactions
  for each row execute function lp_private.trg_retire_transaction_version();

-- ── 5. Seeds ─────────────────────────────────────────────────────────────────
create table if not exists lp_private.categorization_seeds (
  id              serial primary key,
  kind            text     not null check (kind in ('merchant', 'plaid_category')),
  ord             integer  not null,
  pattern         text     not null,   -- regex on the merchant text, or a Plaid primary category
  account_pattern text     not null,   -- regex on the account name
  sign            smallint not null check (sign in (-1, 1)),
  confidence      integer  not null check (confidence between 1 and 89)
);
comment on table lp_private.categorization_seeds is
  'Planted knowledge: suggests an account before LedgiProof has learned anything. Suggestions only -- a seed never posts by itself.';

truncate lp_private.categorization_seeds;
insert into lp_private.categorization_seeds (kind, ord, pattern, account_pattern, sign, confidence) values
  ('merchant',  1, '(ubereats|uber eats|doordash|grubhub|postmates|starbucks|mcdonald|chipotle|restaurant|\mcafe\M|coffee|pizza|burger|taco|dunkin|panera|subway)', '(meal)', -1, 60),
  ('merchant',  2, '(amazon web services|\maws\M|adobe|google (workspace|cloud|gsuite|storage)|microsoft|github|slack|zoom\.us|\mzoom\M|dropbox|notion|figma|canva|openai|anthropic|intuit|quickbooks|shopify|squarespace|\mwix\M|godaddy|atlassian|hubspot|apple\.com|icloud|netflix|spotify)', '(software|subscription)', -1, 60),
  ('merchant',  3, '(google ads|facebook|\mmeta\M|fb ads|linkedin|\myelp\M|instagram|tiktok|mailchimp)', '(advertis|marketing)', -1, 60),
  ('merchant',  4, '(\muber\M|\mlyft\M|\mtaxi|airbnb|\mdelta\M|united air|american air|southwest|jetblue|marriott|hilton|hyatt|expedia|booking\.com|\mhotel|airline|amtrak|parking)', '(travel)', -1, 60),
  ('merchant',  5, '(\mshell\M|chevron|exxon|\mmobil\M|texaco|sunoco|valero|marathon|speedway|citgo|\mwawa\M|circle k|\mfuel)', '(car|truck|vehicle|auto|fuel|\mgas)', -1, 60),
  ('merchant',  6, '(verizon|at&t|\matt\M|t.mobile|comcast|xfinity|spectrum|cox comm|frontier|wireless|internet)', '(telephone|phone|internet|utilit)', -1, 60),
  ('merchant',  7, '(electric|\mpower\M|energy|\mwater\M|utilit|pg&e|coned|duke energy)', '(utilit)', -1, 60),
  ('merchant',  8, '(geico|state farm|progressive|allstate|insurance|liberty mutual|nationwide)', '(insurance| ins$| ins )', -1, 60),
  ('merchant',  9, '(gusto|\madp\M|paychex|payroll)', '(wage|salar|payroll)', -1, 60),
  ('merchant', 10, '(\mrent\M|\mlease\M|property m)', '(\mrent|lease)', -1, 60),
  ('merchant', 11, '(service charge|monthly fee|overdraft|wire fee|atm fee|bank fee|maintenance fee|stripe fee|paypal fee)', '(bank|fee)', -1, 60),
  ('merchant', 12, '(staples|office depot|officemax|home depot|lowe|walmart|\mtarget\M|costco|amazon|best buy)', '(office|suppl)', -1, 60),
  ('merchant', 13, '(\mirs\M|\mtax\M|\mdmv\M|license|permit)', '(tax|license)', -1, 60),
  ('merchant', 14, '(attorney|law office|\mlegal\M|\mcpa\M|accounting|bookkeeping)', '(legal|professional|accounting)', -1, 60),
  ('merchant', 20, '(deposit|stripe|square|paypal|venmo|zelle|shopify|payout|transfer from|client payment|\minvoice)', '(revenue|sales|fee|income)', 1, 60),
  -- Plaid's own category, when the merchant text says nothing we know.
  -- Deliberately absent: TRANSFER_IN/OUT and LOAN_PAYMENTS (not income or
  -- expense), MEDICAL, PERSONAL_CARE, HOME_IMPROVEMENT (often personal).
  ('plaid_category', 30, 'FOOD_AND_DRINK',            '(meal)', -1, 55),
  ('plaid_category', 31, 'ENTERTAINMENT',             '(meal|entertain)', -1, 55),
  ('plaid_category', 32, 'TRAVEL',                    '(travel)', -1, 55),
  ('plaid_category', 33, 'TRANSPORTATION',            '(travel|car|truck|vehicle|auto|fuel)', -1, 55),
  ('plaid_category', 34, 'RENT_AND_UTILITIES',        '(\mrent|lease|utilit)', -1, 55),
  ('plaid_category', 35, 'BANK_FEES',                 '(bank|fee)', -1, 55),
  ('plaid_category', 36, 'GENERAL_MERCHANDISE',       '(office|suppl)', -1, 55),
  ('plaid_category', 37, 'GENERAL_SERVICES',          '(professional|contract|service)', -1, 55),
  ('plaid_category', 38, 'GOVERNMENT_AND_NON_PROFIT', '(tax|license)', -1, 55),
  ('plaid_category', 39, 'INCOME',                    '(revenue|sales|income)', 1, 55);

-- ── 6. One suggestion engine: rule > learned > vendor > seeds > income ──────
drop function if exists lp_private.suggest_account(uuid, uuid, text, numeric, uuid);
create or replace function lp_private.suggest_account(
  p_org_id uuid, p_client_id uuid, p_text text, p_amount numeric, p_vendor_id uuid,
  p_hint text default null)
returns table(account_id uuid, source text, confidence integer)
language plpgsql stable set search_path = public as $$
declare
  v_key  text := lp_private.merchant_key(p_text);
  v_text text := lower(coalesce(p_text, ''));
  v_cat  text := case when p_client_id is null then 'learned' else 'learned:' || p_client_id end;
  v_id   uuid;
  v_rule boolean;
  v_n    integer;
  h      record;
begin
  if v_key <> '' then
    select up.account_id, up.is_rule, up.match_count into v_id, v_rule, v_n
      from public.user_patterns up
      join public.accounts a on a.id = up.account_id
     where up.org_id = p_org_id
       and up.category = v_cat
       and up.keyword = v_key
       and up.is_active
       and a.is_active
       and a.client_id is not distinct from p_client_id
     limit 1;
    if v_id is not null then
      return query select v_id,
                          case when v_rule then 'rule' else 'learned' end,
                          case when v_rule then 99 else least(97, 70 + 8 * coalesce(v_n, 0)) end;
      return;
    end if;
  end if;

  if p_vendor_id is not null and p_amount < 0 then
    select v.default_expense_account_id into v_id
      from public.vendors v
      join public.accounts a on a.id = v.default_expense_account_id
     where v.id = p_vendor_id and v.org_id = p_org_id and a.is_active;
    if v_id is not null then
      return query select v_id, 'vendor'::text, 85;
      return;
    end if;
  end if;

  for h in
    select s.* from lp_private.categorization_seeds s
     where (s.kind = 'merchant' and v_text ~ s.pattern)
        or (s.kind = 'plaid_category' and s.pattern = upper(coalesce(p_hint, '')))
     order by s.ord
  loop
    continue when sign(p_amount) <> h.sign;
    select a.id into v_id
      from public.accounts a
     where a.org_id = p_org_id
       and a.client_id is not distinct from p_client_id
       and a.is_active
       and a.type = case when h.sign < 0 then 'expense' else 'income' end
       and lower(a.name) ~ h.account_pattern
       and lp_private.is_leaf_account(a.id)
     order by a.code
     limit 1;
    if v_id is not null then
      return query select v_id, case when h.kind = 'merchant' then 'merchant' else 'bank_category' end, h.confidence;
      return;
    end if;
  end loop;

  if p_amount > 0 then
    select a.id into v_id
      from public.accounts a
     where a.org_id = p_org_id
       and a.client_id is not distinct from p_client_id
       and a.is_active
       and a.type = 'income'
       and lp_private.is_leaf_account(a.id)
     order by a.code
     limit 1;
    if v_id is not null then
      return query select v_id, 'income'::text, 40;
    end if;
  end if;
end;
$$;

-- ── 7. Matches say whether they are exact and unique ────────────────────────
drop function if exists lp_private.deposit_invoice_match(uuid, numeric, text, text);
create or replace function lp_private.deposit_invoice_match(p_org_id uuid, p_amount numeric, p_currency text, p_text text)
returns table(invoice_id uuid, invoice_number text, client_name text, balance_due numeric,
              name_match boolean, candidates integer)
language sql stable set search_path = public as $$
  select x.id, x.invoice_number, x.client_name, x.balance_due, x.name_match, x.candidates
    from (
      select i.id, i.invoice_number::text as invoice_number,
             coalesce(nullif(i.bill_to_company, ''), nullif(i.bill_to_name, ''), c.display_name)::text as client_name,
             i.balance_due, i.due_date,
             coalesce(lp_private.receipt_word(coalesce(nullif(i.bill_to_company, ''), i.bill_to_name, c.display_name)) is not null
               and position(lp_private.receipt_word(coalesce(nullif(i.bill_to_company, ''), i.bill_to_name, c.display_name))
                            in lower(coalesce(p_text, ''))) > 0, false) as name_match,
             (count(*) over ())::int as candidates
        from public.invoices i
        left join public.clients c on c.id = i.client_id
       where p_amount > 0
         and i.org_id = p_org_id
         and i.status in ('sent', 'viewed', 'partial', 'overdue')
         and upper(i.currency) = 'USD'
         and upper(coalesce(p_currency, 'USD')) = 'USD'
         and abs(i.balance_due - p_amount) < 0.005
    ) x
   order by x.name_match desc, x.due_date
   limit 1
$$;

drop function if exists lp_private.deposit_payment_match(uuid, numeric, text, date);
create or replace function lp_private.deposit_payment_match(p_org_id uuid, p_amount numeric, p_currency text, p_date date)
returns table(payment_id uuid, invoice_number text, payment_date date, method text, candidates integer)
language sql stable set search_path = public as $$
  select p.id, i.invoice_number::text, p.payment_date, p.method, (count(*) over ())::int
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

drop function if exists lp_private.withdrawal_bill_match(uuid, numeric, text, date, text);
create or replace function lp_private.withdrawal_bill_match(p_org_id uuid, p_amount numeric, p_currency text, p_date date, p_text text)
returns table(bill_id uuid, bill_number text, vendor_name text, kind text, name_match boolean, candidates integer)
language sql stable set search_path = public as $$
  select x.id, x.bill_number, x.vendor_name, x.kind, x.name_match, x.candidates
    from (
      select b.id, b.bill_number, b.due_date, b.status,
             coalesce(nullif(btrim(v.dba_name), ''), v.legal_name)::text as vendor_name,
             case when b.status = 'paid' then 'in_transit' else 'open' end as kind,
             coalesce(lp_private.receipt_word(coalesce(nullif(v.dba_name, ''), v.legal_name)) is not null
               and position(lp_private.receipt_word(coalesce(nullif(v.dba_name, ''), v.legal_name))
                            in lower(coalesce(p_text, ''))) > 0, false) as name_match,
             (count(*) over ())::int as candidates
        from public.vendor_bills b
        join public.vendors v on v.id = b.vendor_id
       where p_amount < 0
         and b.org_id = p_org_id
         and b.client_id is null
         and upper(coalesce(p_currency, 'USD')) = 'USD'
         and abs(b.amount - abs(p_amount)) < 0.005
         and b.transaction_id is null
         and (b.status in ('pending', 'overdue')
              or (b.status = 'paid' and b.paid_via = 'manual'
                  and abs(b.paid_at::date - p_date) <= 30))
    ) x
   order by x.name_match desc, (x.status = 'paid') desc, x.due_date
   limit 1
$$;

-- ── 8. Audit and learning, written once ─────────────────────────────────────
create or replace function lp_private.append_transaction_audit(
  p_org_id uuid, p_tx public.transactions, p_event public.audit_event_type,
  p_actor uuid, p_metadata jsonb)
returns void language plpgsql set search_path = public as $$
declare
  v_prev text;
  v_now  timestamptz := clock_timestamp();
  v_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended('audit_events:' || p_org_id::text, 0));
  select entry_hash into v_prev
    from public.audit_events
   where org_id = p_org_id
   order by created_at desc, id desc
   limit 1;

  -- Same JSON shape src/lib/hash.ts buildAuditHash() hashes.
  v_hash := public.sha256_text(
    '{"previousHash":'        || coalesce(to_json(v_prev)::text, 'null') ||
    ',"transactionId":'       || to_json(p_tx.id::text)::text ||
    ',"transactionVersion":'  || p_tx.version ||
    ',"eventType":'           || to_json(p_event::text)::text ||
    ',"timestamp":'           || to_json(to_char(v_now at time zone 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text ||
    ',"actorId":'             || coalesce(to_json(p_actor::text)::text, 'null') || '}'
  );

  insert into public.audit_events (
    org_id, transaction_id, transaction_group_id, transaction_version,
    event_type, actor_id, previous_hash, entry_hash, metadata, created_at
  ) values (
    p_org_id, p_tx.id, p_tx.transaction_group_id, p_tx.version,
    p_event, p_actor, v_prev, v_hash, coalesce(p_metadata, '{}'::jsonb), v_now
  );
end;
$$;

-- A person put this merchant in this account. Returns the "always?" prompt
-- the second time in a row, else null.
create or replace function lp_private.learn_merchant(
  p_org_id uuid, p_tx public.transactions, p_account public.accounts, p_actor uuid)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_key     text := lp_private.merchant_key(coalesce(p_tx.merchant_name, p_tx.description));
  v_cat     text := case when p_tx.client_id is null then 'learned' else 'learned:' || p_tx.client_id end;
  v_count   integer;
  v_is_rule boolean;
begin
  if v_key = '' then return null; end if;
  insert into public.user_patterns (
    org_id, created_by, keyword, merchant_name, account_id, category,
    confidence_boost, match_count, is_active, confirmed_at
  ) values (
    p_org_id, p_actor, v_key, v_key, p_account.id, v_cat, 20, 1, true, now()
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
    return jsonb_build_object(
      'merchant_key', v_key,
      'client_id',    p_tx.client_id,
      'account_id',   p_account.id,
      'account_name', p_account.name,
      'example',      coalesce(p_tx.merchant_name, p_tx.description));
  end if;
  return null;
end;
$$;

-- ── 9. One posting path, for people and for automation ──────────────────────
-- p_verify = true : a person chose it -> verified (blue), and it teaches.
-- p_verify = false: automation chose it -> ready (green), waits for a person.
create or replace function lp_private.categorize_transaction(
  p_org_id uuid, p_item jsonb, p_actor uuid, p_verify boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_tx      public.transactions%rowtype;
  v_acct    public.accounts%rowtype;
  v_inv     public.invoices%rowtype;
  v_pay     public.invoice_payments%rowtype;
  v_bill    public.vendor_bills%rowtype;
  v_inv_id  uuid := nullif(p_item ->> 'invoice_id', '')::uuid;
  v_pay_id  uuid := nullif(p_item ->> 'payment_id', '')::uuid;
  v_bill_id uuid := nullif(p_item ->> 'bill_id', '')::uuid;
  v_bank    uuid;
  v_amt     numeric;
  v_usd     numeric;
  v_rate    numeric;
  v_cur     text;
  v_prompt  jsonb;
begin
  select * into v_tx
    from public.transactions
   where id = (p_item ->> 'transaction_id')::uuid
     and org_id = p_org_id
     and is_current
   for update;
  if not found then
    raise exception 'Transaction not found';
  end if;
  if v_tx.locked_at is not null then
    raise exception 'This transaction is locked';
  end if;
  if lp_private.transaction_in_books(v_tx.id) then
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
     where id = lp_private.ensure_system_account(p_org_id, 'ar', p_actor);
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
     where id = lp_private.ensure_system_account(p_org_id, 'undeposited', p_actor);
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
       where id = lp_private.ensure_system_account(p_org_id, 'ap', p_actor);
    elsif v_bill.status = 'paid' and v_bill.paid_via = 'manual' then
      select * into v_acct from public.accounts
       where id = lp_private.ensure_system_account(p_org_id, 'bills_in_transit', p_actor);
    else
      raise exception 'That bill was already paid from the bank';
    end if;
  else
    select * into v_acct
      from public.accounts
     where id = (p_item ->> 'account_id')::uuid
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

  v_bank := nullif(p_item ->> 'bank_account_id', '')::uuid;
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

  if p_verify then
    perform set_config('lp.verifying', 'on', true);
    update public.transactions
       set approved_by = p_actor, approved_at = clock_timestamp(), review_status = 'confirmed'
     where id = v_tx.id;
    perform set_config('lp.verifying', '', true);
  end if;

  perform lp_private.append_transaction_audit(
    p_org_id, v_tx,
    case when p_verify then 'approved' else 'journal_posted' end::public.audit_event_type,
    p_actor,
    jsonb_build_object(
      'note',                case when p_verify then 'Categorized from the review inbox'
                                  else 'Categorized automatically' end,
      'auto',                not p_verify,
      'prev_semaphore',      v_tx.semaphore,
      'category_account_id', v_acct.id,
      'bank_account_id',     v_bank,
      'suggestion_source',   p_item ->> 'source',
      'invoice_id',          v_inv_id,
      'payment_id',          v_pay_id,
      'bill_id',             v_bill_id));

  if v_inv_id is not null then
    insert into public.invoice_payments (
      invoice_id, org_id, amount, currency, payment_date, method,
      reference, notes, recorded_by, transaction_id
    ) values (
      v_inv.id, p_org_id, v_amt, v_cur, v_tx.transaction_date, 'bank_transfer',
      left(coalesce(v_tx.merchant_name, v_tx.description), 100),
      'Matched from the bank deposit', p_actor, v_tx.id
    );
    perform lp_private.compute_invoice_totals_impl(v_inv.id);
  elsif v_pay_id is not null then
    update public.invoice_payments set transaction_id = v_tx.id where id = v_pay_id;
  elsif v_bill_id is not null then
    if v_bill.status = 'paid' then
      update public.vendor_bills set transaction_id = v_tx.id where id = v_bill.id;
    else
      update public.vendor_bills
         set status = 'paid', paid_via = 'bank', paid_amount = v_bill.amount,
             paid_at = v_tx.transaction_date::timestamptz, transaction_id = v_tx.id
       where id = v_bill.id;
    end if;
  elsif p_verify then
    v_prompt := lp_private.learn_merchant(p_org_id, v_tx, v_acct, p_actor);
  end if;

  return v_prompt;
end;
$$;

create or replace function public.post_reviewed_transactions(p_org_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_item    jsonb;
  v_prompt  jsonb;
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

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_prompt := lp_private.categorize_transaction(p_org_id, v_item, v_uid, true);
      if v_prompt is not null then v_prompts := v_prompts || v_prompt; end if;
      v_posted := v_posted || to_jsonb(v_item ->> 'transaction_id');
    exception when others then
      v_failed := v_failed || jsonb_build_object(
        'transaction_id', v_item ->> 'transaction_id',
        'error',          sqlerrm);
    end;
  end loop;

  return jsonb_build_object('posted', v_posted, 'failed', v_failed, 'rule_prompts', v_prompts);
end;
$$;

-- ── 10. Automation: post what is certain, leave the rest for a person ───────
create or replace function public.auto_categorize_transactions(
  p_org_id uuid, p_transaction_ids uuid[], p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor   uuid;
  v_tx      public.transactions%rowtype;
  v_item    jsonb;
  v_text    text;
  v_banks   integer;
  im        record;
  pm        record;
  bm        record;
  s         record;
  v_posted  jsonb := '[]'::jsonb;
  v_failed  jsonb := '[]'::jsonb;
  v_skipped integer := 0;
begin
  if lp_private.is_trusted_caller() then
    v_actor := p_actor;
    if v_actor is null then
      raise exception 'Automatic categorization needs the user the import runs for' using errcode = '22023';
    end if;
  else
    perform lp_private.assert_org_access(p_org_id, array['owner','admin','accountant','approver']::public.lp_role[]);
    v_actor := auth.uid();
  end if;
  if p_transaction_ids is null or cardinality(p_transaction_ids) = 0 then
    return jsonb_build_object('posted', v_posted, 'failed', v_failed, 'skipped', 0);
  end if;

  for v_tx in
    select * from public.transactions t
     where t.org_id = p_org_id and t.id = any(p_transaction_ids)
     order by t.transaction_date, t.created_at
  loop
    v_item := null;
    -- Only bank lines, never flagged/rejected/pending/card, never twice.
    if not v_tx.is_current or v_tx.locked_at is not null
       or v_tx.source not in ('bank_api', 'csv', 'ofx')
       or v_tx.risk_status = 'red' or v_tx.review_status = 'rejected'
       or coalesce((v_tx.metadata ->> 'plaid_pending')::boolean, false)
       or v_tx.payment_method = 'card'
       or lp_private.transaction_in_books(v_tx.id) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    -- The same bank account For review posts to when a person confirms
    -- (applied as semaphore_v2_e_auto_uses_default_bank: the standard chart
    -- has Checking + Savings, and "exactly one" meant automation never ran).
    if lp_private.default_cash_account(p_org_id, v_tx.client_id) is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_text := coalesce(v_tx.merchant_name, '') || ' ' || coalesce(v_tx.description, '');

    if v_tx.client_id is null then
      select * into im from lp_private.deposit_invoice_match(p_org_id, v_tx.amount, v_tx.currency, v_text);
      if im.invoice_id is not null and im.name_match and im.candidates = 1 then
        v_item := jsonb_build_object('transaction_id', v_tx.id, 'invoice_id', im.invoice_id, 'source', 'invoice');
      end if;
      if v_item is null then
        select * into pm from lp_private.deposit_payment_match(p_org_id, v_tx.amount, v_tx.currency, v_tx.transaction_date);
        if pm.payment_id is not null and pm.candidates = 1 then
          v_item := jsonb_build_object('transaction_id', v_tx.id, 'payment_id', pm.payment_id, 'source', 'deposit');
        end if;
      end if;
      if v_item is null then
        select * into bm from lp_private.withdrawal_bill_match(p_org_id, v_tx.amount, v_tx.currency, v_tx.transaction_date, v_text);
        if bm.bill_id is not null and bm.name_match and bm.candidates = 1 then
          v_item := jsonb_build_object('transaction_id', v_tx.id, 'bill_id', bm.bill_id,
                                       'source', case bm.kind when 'open' then 'bill' else 'bill_payment' end);
        end if;
      end if;
    end if;

    if v_item is null then
      select * into s from lp_private.suggest_account(
        p_org_id, v_tx.client_id, coalesce(v_tx.merchant_name, v_tx.description),
        v_tx.amount, v_tx.vendor_id, v_tx.metadata ->> 'plaid_category');
      if s.account_id is not null
         and (s.source = 'rule' or (s.source = 'learned' and s.confidence >= 94)) then
        v_item := jsonb_build_object('transaction_id', v_tx.id, 'account_id', s.account_id, 'source', s.source);
      end if;
    end if;

    if v_item is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    begin
      perform lp_private.categorize_transaction(p_org_id, v_item, v_actor, false);
      v_posted := v_posted || to_jsonb(v_tx.id::text);
    exception when others then
      v_failed := v_failed || jsonb_build_object('transaction_id', v_tx.id, 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('posted', v_posted, 'failed', v_failed, 'skipped', v_skipped);
end;
$$;

-- ── 11. Verify: the person's step (green -> blue) ───────────────────────────
create or replace function public.verify_transactions(p_org_id uuid, p_transaction_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_tx       public.transactions%rowtype;
  v_acct     public.accounts%rowtype;
  v_id       uuid;
  v_prompt   jsonb;
  v_verified jsonb := '[]'::jsonb;
  v_failed   jsonb := '[]'::jsonb;
  v_prompts  jsonb := '[]'::jsonb;
begin
  perform lp_private.assert_org_access(p_org_id, array['owner','admin','accountant']::public.lp_role[]);
  if v_uid is null then
    raise exception 'A signed-in user is required to verify transactions' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_transaction_ids, '{}')) > 200 then
    raise exception using errcode = 'LV001', message = 'At most 200 transactions per batch';
  end if;

  foreach v_id in array coalesce(p_transaction_ids, '{}') loop
    begin
      select * into v_tx from public.transactions
       where id = v_id and org_id = p_org_id and is_current
       for update;
      if not found then
        raise exception 'Transaction not found';
      end if;
      if v_tx.approved_by is not null then
        v_verified := v_verified || to_jsonb(v_id::text);   -- already verified: nothing to do
        continue;
      end if;
      if not lp_private.transaction_in_books(v_id) then
        raise exception using errcode = 'LV005', message = 'Categorize this transaction before verifying it';
      end if;

      perform set_config('lp.verifying', 'on', true);
      update public.transactions
         set approved_by = v_uid, approved_at = clock_timestamp(), review_status = 'confirmed'
       where id = v_id;
      perform set_config('lp.verifying', '', true);

      perform lp_private.append_transaction_audit(p_org_id, v_tx, 'approved', v_uid,
        jsonb_build_object('note', 'Verified', 'prev_semaphore', v_tx.semaphore));

      -- Confirming a plain category is a lesson too (matches teach nothing).
      if lp_private.transaction_link(v_id) is null then
        select a.* into v_acct
          from public.journal_entries je
          join public.accounts a on a.id = je.account_id
         where je.transaction_id = v_id and not je.is_reversed
           and not lp_private.is_cash_account(a)
         limit 1;
        if found and v_acct.type in ('income', 'expense') then
          v_prompt := lp_private.learn_merchant(p_org_id, v_tx, v_acct, v_uid);
          if v_prompt is not null then v_prompts := v_prompts || v_prompt; end if;
        end if;
      end if;

      v_verified := v_verified || to_jsonb(v_id::text);
    exception when others then
      v_failed := v_failed || jsonb_build_object('transaction_id', v_id, 'error', sqlerrm, 'code', sqlstate);
    end;
  end loop;

  return jsonb_build_object('verified', v_verified, 'failed', v_failed, 'rule_prompts', v_prompts);
end;
$$;

-- ── 12. Remove a category (the correction) ───────────────────────────────────
create or replace function public.uncategorize_transaction(p_org_id uuid, p_transaction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_tx   public.transactions%rowtype;
  v_link text;
  v_cat  uuid;
begin
  perform lp_private.assert_org_access(p_org_id, array['owner','admin','accountant']::public.lp_role[]);
  select * into v_tx from public.transactions
   where id = p_transaction_id and org_id = p_org_id and is_current
   for update;
  if not found then
    raise exception 'Transaction not found';
  end if;
  if v_tx.locked_at is not null then
    raise exception 'This transaction is locked';
  end if;
  if not lp_private.transaction_in_books(v_tx.id) then
    raise exception using errcode = 'LV006', message = 'This transaction isn''t categorized';
  end if;
  if v_tx.reconciled_at is not null then
    raise exception using errcode = 'LV007',
      message = 'This transaction is reconciled. Reopen the reconciliation to change it.';
  end if;
  v_link := lp_private.transaction_link(v_tx.id);
  if v_link is not null then
    raise exception using errcode = 'LV008',
      message = format('This transaction is matched to %s. Undo that match first.', v_link),
      detail  = jsonb_build_object('document', v_link)::text;
  end if;

  select je.account_id into v_cat
    from public.journal_entries je
    join public.accounts a on a.id = je.account_id
   where je.transaction_id = v_tx.id and not je.is_reversed and not lp_private.is_cash_account(a)
   limit 1;

  update public.journal_entries
     set is_reversed = true
   where transaction_id = v_tx.id and not is_reversed and batch_id is null;

  -- The correction: this merchant goes back to "ask me". An explicit rule the
  -- user created stays -- it is their instruction.
  update public.user_patterns up
     set match_count = 0, confidence_boost = 0
   where up.org_id = p_org_id
     and up.category = case when v_tx.client_id is null then 'learned' else 'learned:' || v_tx.client_id end
     and up.keyword = lp_private.merchant_key(coalesce(v_tx.merchant_name, v_tx.description))
     and up.account_id = v_cat
     and not up.is_rule;

  perform lp_private.append_transaction_audit(p_org_id, v_tx, 'edited', v_uid,
    jsonb_build_object('note', 'Category removed', 'category_account_id', v_cat,
                       'prev_semaphore', v_tx.semaphore));
end;
$$;

-- ── 13. The list a person verifies from ──────────────────────────────────────
-- In the books, not yet verified. p_all_clients = a firm's whole book of work.
create or replace function public.get_verification_queue(
  p_org_id uuid, p_client_id uuid default null, p_all_clients boolean default false,
  p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_items jsonb;
  v_total integer;
begin
  perform lp_private.assert_org_access(p_org_id);

  select count(*)::int into v_total
    from public.transactions t
   where t.org_id = p_org_id
     and (p_all_clients or t.client_id is not distinct from p_client_id)
     and t.is_current and t.approved_by is null
     and lp_private.transaction_in_books(t.id);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_date desc, x.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select q.id, q.transaction_date, q.created_at, q.description, q.merchant_name,
             q.amount, q.currency, q.semaphore, q.status_reason, q.client_id,
             c.display_name as client_name,
             cat.id as category_account_id, cat.code as category_account_code, cat.name as category_account_name,
             coalesce((ev.metadata ->> 'auto')::boolean, false) as auto,
             ev.metadata ->> 'suggestion_source' as source,
             lp_private.transaction_link(q.id) as matched_to
        from public.transactions q
        left join public.clients c on c.id = q.client_id
        left join lateral (
          select a.id, a.code, a.name
            from public.journal_entries je
            join public.accounts a on a.id = je.account_id
           where je.transaction_id = q.id and not je.is_reversed and not lp_private.is_cash_account(a)
           limit 1) cat on true
        left join lateral (
          select e.metadata from public.audit_events e
           where e.transaction_id = q.id and e.event_type in ('journal_posted', 'approved')
           order by e.created_at desc limit 1) ev on true
       where q.org_id = p_org_id
         and (p_all_clients or q.client_id is not distinct from p_client_id)
         and q.is_current and q.approved_by is null
         and lp_private.transaction_in_books(q.id)
       order by q.transaction_date desc, q.created_at desc
       limit least(greatest(coalesce(p_limit, 100), 1), 200)
    ) x;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

-- ── 14. For review: not in the books yet; the bank's category seeds suggestions
create or replace function public.get_review_queue(p_org_id uuid, p_client_id uuid default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
     and not lp_private.transaction_in_books(t.id);

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
               t.org_id, t.client_id, coalesce(t.merchant_name, t.description), t.amount, t.vendor_id,
               t.metadata ->> 'plaid_category') s on true
        left join public.accounts a on a.id = coalesce(
               case when im.invoice_id is not null then v_ar end,
               case when pm.payment_id is not null then v_und end,
               case bm.kind when 'open' then v_ap when 'in_transit' then v_transit end,
               s.account_id)
       where t.org_id = p_org_id
         and t.client_id is not distinct from p_client_id
         and t.is_current
         and t.locked_at is null
         and not lp_private.transaction_in_books(t.id)
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

-- ── 15. Grants ────────────────────────────────────────────────────────────────
revoke all on function public.auto_categorize_transactions(uuid, uuid[], uuid)     from public, anon;
revoke all on function public.verify_transactions(uuid, uuid[])                    from public, anon;
revoke all on function public.uncategorize_transaction(uuid, uuid)                 from public, anon;
revoke all on function public.get_verification_queue(uuid, uuid, boolean, integer) from public, anon;
grant execute on function public.auto_categorize_transactions(uuid, uuid[], uuid)     to authenticated, service_role;
grant execute on function public.verify_transactions(uuid, uuid[])                    to authenticated;
grant execute on function public.uncategorize_transaction(uuid, uuid)                 to authenticated;
grant execute on function public.get_verification_queue(uuid, uuid, boolean, integer) to authenticated;

-- ── 16. Reconciling is a person verifying against the statement ──────────────
-- close_reconciliation_session_impl wrote semaphore = 'blue' directly; the
-- colour is derived now, so it records WHO verified (approved_by) instead.
-- LR001 already guarantees every cleared line is categorized.
do $patch$
declare
  v_def text := pg_get_functiondef('lp_private.close_reconciliation_session_impl'::regproc);
begin
  if position('semaphore           = ''blue'',' in v_def) = 0 then
    raise exception 'close_reconciliation_session_impl changed shape; patch by hand';
  end if;
  v_def := replace(v_def, 'semaphore           = ''blue'',',
    'approved_by         = coalesce(t.approved_by, p_user_id),' || chr(10) ||
    '         approved_at         = coalesce(t.approved_at, v_now),');
  v_def := replace(v_def, '  -- Derive reconciled state',
    '  perform set_config(''lp.verifying'', ''on'', true);' || chr(10) || '  -- Derive reconciled state');
  execute v_def;
end
$patch$;

-- ── 17. Editing a transaction (applied as semaphore_v2_d_version_before_insert)
-- Editing inserts version N+1 as current. The old version was retired AFTER the
-- insert, but uq_transactions_one_current rejects the insert first -- so every
-- edit failed with a duplicate key. Retire it BEFORE.
create or replace function public.normalize_current_transaction_version()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.is_current then
    update public.transactions
       set is_current = false,
           updated_at = now()
     where org_id               = new.org_id
       and transaction_group_id = new.transaction_group_id
       and id                  <> new.id
       and is_current            = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_current_transaction_version on public.transactions;
create trigger trg_normalize_current_transaction_version
  before insert on public.transactions
  for each row execute function public.normalize_current_transaction_version();
