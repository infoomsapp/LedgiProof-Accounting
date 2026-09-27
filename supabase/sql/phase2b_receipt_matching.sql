-- Phase 2b: a scanned receipt finds its bank transaction by itself.
-- Applied 2026-09-27 as migration `phase2b_receipt_matching`. Kept here as
-- the reference copy. Depends on `phase2_review_inbox` (lp_private helpers).
--
-- Before: ocr-receipt read the receipt and returned merchant/amount/date to
-- the screen, but only persisted the raw text -- nothing could ever match
-- the receipt to the bank line it paid for.
--
-- Now:
--   · documents keeps what OCR read (merchant, amount, date, currency).
--   · match_receipt()  runs right after OCR: a clear winner is linked
--                      (documents.transaction_id), close calls come back as
--                      "is it this one?", no candidate = waiting.
--   · link_receipt()   the user confirms a suggestion.
--   · a trigger on new transactions picks up receipts that were waiting --
--     scan first, import the bank statement later, and they still meet.
--
-- Score (0-105): amount exact 60 / up to +25% (tip) 25; date same day 25,
-- 1 day 20, <=3 days 12, <=7 days 5; merchant word found in the bank
-- description 20. Auto-link at >= 85 when the runner-up is >= 15 behind.

alter table public.documents
  add column if not exists ocr_merchant   text,
  add column if not exists ocr_amount     numeric(18,2),
  add column if not exists ocr_date       date,
  add column if not exists ocr_currency   text,
  add column if not exists ocr_confidence smallint,
  add column if not exists match_status   text;

alter table public.documents drop constraint if exists documents_match_status_check;
alter table public.documents add constraint documents_match_status_check
  check (match_status is null or match_status in ('matched', 'suggested', 'unmatched', 'no_amount'));

create index if not exists ix_documents_waiting_receipts
  on public.documents (org_id, client_id)
  where transaction_id is null and match_status in ('unmatched', 'suggested') and deleted_at is null;

-- ── Scoring ─────────────────────────────────────────────────────────────────

create or replace function lp_private.receipt_score(
  p_receipt_amount numeric,
  p_receipt_date   date,
  p_receipt_word   text,       -- first merchant word (>= 3 chars) or null
  p_tx_amount      numeric,
  p_tx_date        date,
  p_tx_text        text
)
returns integer
language sql immutable
set search_path = public
as $$
  select case
           when abs(abs(p_tx_amount) - p_receipt_amount) < 0.005 then 60
           when abs(p_tx_amount) > p_receipt_amount
            and abs(p_tx_amount) <= p_receipt_amount * 1.25        then 25
           else 0
         end
       + case
           when p_receipt_date is null then 0
           when abs(p_tx_date - p_receipt_date) = 0 then 25
           when abs(p_tx_date - p_receipt_date) = 1 then 20
           when abs(p_tx_date - p_receipt_date) <= 3 then 12
           when abs(p_tx_date - p_receipt_date) <= 7 then 5
           else 0
         end
       + case
           when p_receipt_word is not null
            and position(p_receipt_word in lower(coalesce(p_tx_text, ''))) > 0 then 20
           else 0
         end
$$;

create or replace function lp_private.receipt_word(p_merchant text)
returns text
language sql immutable
set search_path = public
as $$
  select nullif(split_part(lp_private.merchant_key(p_merchant), ' ', 1), '')
   where length(split_part(lp_private.merchant_key(p_merchant), ' ', 1)) >= 3
$$;

-- A transaction keeps its receipt across versions (an edit inserts a new
-- version row with a new id, same transaction_group_id).
create or replace function lp_private.transaction_has_receipt(p_group_id uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select exists (
    select 1
      from public.documents d
      join public.transactions t on t.id = d.transaction_id
     where t.transaction_group_id = p_group_id
       and d.document_kind = 'receipt'
       and d.deleted_at is null
  )
$$;

-- Expense transactions in the same scope and currency, without a receipt
-- yet, close in amount and date. Highest score first.
create or replace function lp_private.receipt_candidates(
  p_org_id    uuid,
  p_client_id uuid,
  p_amount    numeric,
  p_date      date,
  p_merchant  text,
  p_currency  text
)
returns table(transaction_id uuid, score integer, description text,
              amount numeric, transaction_date date)
language sql stable
set search_path = public
as $$
  select t.id,
         lp_private.receipt_score(p_amount, p_date, lp_private.receipt_word(p_merchant),
                                  t.amount, t.transaction_date,
                                  coalesce(t.merchant_name, '') || ' ' || coalesce(t.description, '')) as score,
         coalesce(t.merchant_name, t.description),
         t.amount,
         t.transaction_date
    from public.transactions t
   where t.org_id = p_org_id
     and t.client_id is not distinct from p_client_id
     and t.is_current
     and t.amount < 0
     and upper(t.currency) = upper(coalesce(p_currency, 'USD'))
     and abs(t.amount) between p_amount - 0.005 and p_amount * 1.25
     and (p_date is null or t.transaction_date between p_date - 7 and p_date + 7)
     and not lp_private.transaction_has_receipt(t.transaction_group_id)
   order by score desc, abs(abs(t.amount) - p_amount), t.transaction_date desc
   limit 5
$$;

-- ── Right after OCR ─────────────────────────────────────────────────────────

create or replace function public.match_receipt(
  p_document_id uuid,
  p_merchant    text,
  p_amount      numeric,
  p_date        date,
  p_currency    text default 'USD',
  p_confidence  integer default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_doc   public.documents%rowtype;
  v_top   record;
  v_next  record;
  v_cands jsonb;
  v_tx    jsonb;
begin
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if not lp_private.is_trusted_caller()
     and not public.can_act_for_client(v_doc.org_id, v_doc.client_id) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  update public.documents
     set ocr_merchant   = nullif(btrim(p_merchant), ''),
         ocr_amount     = case when p_amount is null then null else round(abs(p_amount), 2) end,
         ocr_date       = p_date,
         ocr_currency   = upper(coalesce(p_currency, 'USD')),
         ocr_confidence = p_confidence
   where id = v_doc.id;

  -- Uploaded from a transaction's detail: it already belongs there.
  if v_doc.transaction_id is not null then
    update public.documents set match_status = 'matched' where id = v_doc.id;
    select jsonb_build_object('id', t.id, 'description', coalesce(t.merchant_name, t.description),
                              'amount', t.amount, 'transaction_date', t.transaction_date)
      into v_tx from public.transactions t where t.id = v_doc.transaction_id;
    return jsonb_build_object('status', 'matched', 'transaction', v_tx);
  end if;

  if p_amount is null or abs(p_amount) = 0 then
    update public.documents set match_status = 'no_amount' where id = v_doc.id;
    return jsonb_build_object('status', 'no_amount');
  end if;

  select * into v_top  from lp_private.receipt_candidates(v_doc.org_id, v_doc.client_id, round(abs(p_amount), 2), p_date, p_merchant, upper(coalesce(p_currency, 'USD'))) limit 1;
  select * into v_next from lp_private.receipt_candidates(v_doc.org_id, v_doc.client_id, round(abs(p_amount), 2), p_date, p_merchant, upper(coalesce(p_currency, 'USD'))) offset 1 limit 1;

  if v_top.transaction_id is not null
     and v_top.score >= 85
     and (v_next.transaction_id is null or v_next.score <= v_top.score - 15) then
    update public.documents
       set transaction_id = v_top.transaction_id, match_status = 'matched'
     where id = v_doc.id;
    return jsonb_build_object('status', 'matched', 'transaction', jsonb_build_object(
      'id', v_top.transaction_id, 'description', v_top.description,
      'amount', v_top.amount, 'transaction_date', v_top.transaction_date));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.transaction_id, 'description', c.description, 'amount', c.amount,
           'transaction_date', c.transaction_date, 'score', c.score)), '[]'::jsonb)
    into v_cands
    from lp_private.receipt_candidates(v_doc.org_id, v_doc.client_id, round(abs(p_amount), 2), p_date, p_merchant, upper(coalesce(p_currency, 'USD'))) c
   where c.score >= 40;

  if jsonb_array_length(v_cands) > 0 then
    update public.documents set match_status = 'suggested' where id = v_doc.id;
    return jsonb_build_object('status', 'suggested', 'candidates', v_cands);
  end if;

  update public.documents set match_status = 'unmatched' where id = v_doc.id;
  return jsonb_build_object('status', 'unmatched');
end;
$$;

-- ── The user confirms a suggestion (or links a receipt to a new expense) ────

create or replace function public.link_receipt(p_document_id uuid, p_transaction_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if not public.can_act_for_client(v_doc.org_id, v_doc.client_id) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.transactions t
     where t.id = p_transaction_id
       and t.org_id = v_doc.org_id
       and t.client_id is not distinct from v_doc.client_id
  ) then
    raise exception 'That transaction is not part of this workspace' using errcode = '42501';
  end if;

  update public.documents
     set transaction_id = p_transaction_id, match_status = 'matched'
   where id = v_doc.id;
end;
$$;

-- ── Receipts waiting for their bank line ────────────────────────────────────

create or replace function lp_private.match_waiting_receipts()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_best  record;
  v_next  record;
begin
  if new.amount >= 0 or not new.is_current
     or lp_private.transaction_has_receipt(new.transaction_group_id) then
    return new;
  end if;

  select d.id, lp_private.receipt_score(d.ocr_amount, d.ocr_date, lp_private.receipt_word(d.ocr_merchant),
                                        new.amount, new.transaction_date,
                                        coalesce(new.merchant_name, '') || ' ' || coalesce(new.description, '')) as score
    into v_best
    from public.documents d
   where d.org_id = new.org_id
     and d.client_id is not distinct from new.client_id
     and d.transaction_id is null
     and d.deleted_at is null
     and d.match_status in ('unmatched', 'suggested')
     and d.ocr_amount is not null
     and coalesce(d.ocr_currency, 'USD') = upper(new.currency)
     and abs(new.amount) between d.ocr_amount - 0.005 and d.ocr_amount * 1.25
     and (d.ocr_date is null or new.transaction_date between d.ocr_date - 7 and d.ocr_date + 7)
   order by 2 desc
   limit 1;

  if v_best.id is null or v_best.score < 85 then
    return new;
  end if;

  -- Don't guess between two receipts that fit this line equally well.
  select d.id, lp_private.receipt_score(d.ocr_amount, d.ocr_date, lp_private.receipt_word(d.ocr_merchant),
                                        new.amount, new.transaction_date,
                                        coalesce(new.merchant_name, '') || ' ' || coalesce(new.description, '')) as score
    into v_next
    from public.documents d
   where d.org_id = new.org_id
     and d.client_id is not distinct from new.client_id
     and d.transaction_id is null
     and d.deleted_at is null
     and d.match_status in ('unmatched', 'suggested')
     and d.ocr_amount is not null
     and d.id <> v_best.id
     and coalesce(d.ocr_currency, 'USD') = upper(new.currency)
     and abs(new.amount) between d.ocr_amount - 0.005 and d.ocr_amount * 1.25
     and (d.ocr_date is null or new.transaction_date between d.ocr_date - 7 and d.ocr_date + 7)
   order by 2 desc
   limit 1;

  if v_next.id is not null and v_next.score > v_best.score - 15 then
    return new;
  end if;

  update public.documents
     set transaction_id = new.id, match_status = 'matched'
   where id = v_best.id;
  return new;
end;
$$;

drop trigger if exists trg_match_waiting_receipts on public.transactions;
create trigger trg_match_waiting_receipts
  after insert on public.transactions
  for each row execute function lp_private.match_waiting_receipts();

-- ── The inbox shows which transactions already have their receipt ─────────

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
             s.account_id  as suggested_account_id,
             s.source      as suggestion_source,
             s.confidence  as suggestion_confidence,
             a.code        as suggested_account_code,
             a.name        as suggested_account_name,
             lp_private.transaction_has_receipt(t.transaction_group_id) as has_receipt
        from public.transactions t
        left join lateral lp_private.suggest_account(
               t.org_id, t.client_id, coalesce(t.merchant_name, t.description), t.amount, t.vendor_id) s on true
        left join public.accounts a on a.id = s.account_id
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

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on function lp_private.receipt_score(numeric, date, text, numeric, date, text)      from public, anon, authenticated;
revoke all on function lp_private.receipt_word(text)                                           from public, anon, authenticated;
revoke all on function lp_private.transaction_has_receipt(uuid)                                from public, anon, authenticated;
revoke all on function lp_private.receipt_candidates(uuid, uuid, numeric, date, text, text)    from public, anon, authenticated;
revoke all on function lp_private.match_waiting_receipts()                                     from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;

revoke all on function public.match_receipt(uuid, text, numeric, date, text, integer) from public, anon;
revoke all on function public.link_receipt(uuid, uuid)                                from public, anon;
grant execute on function public.match_receipt(uuid, text, numeric, date, text, integer) to authenticated, service_role;
grant execute on function public.link_receipt(uuid, uuid)                                to authenticated, service_role;
