-- Phase 2c: receipts that are still waiting for their bank line.
-- Applied as migration `phase2c_pending_receipts`. Kept here as the reference
-- copy. Depends on `phase2b_receipt_matching` and `phase2_review_inbox`.
--
-- Before: once the upload dialog closed, a "suggested" or "unmatched" receipt
-- was never shown again, a misread total could never be corrected, and a
-- cash purchase (no bank line will ever come) had nowhere to go.
--
-- Now:
--   · get_pending_receipts()        the receipts still waiting, each with its
--                                   likely bank transactions.
--   · match_receipt() (unchanged)   also serves "fix what OCR read": the app
--                                   calls it again with the corrected fields.
--   · create_expense_from_receipt() "paid in cash / from an account I don't
--                                   import": creates the expense transaction
--                                   (it then shows up in the review inbox to
--                                   categorize) and links the receipt to it.
--   · dismiss_receipt()             "doesn't need a transaction".
--   · link_receipt()                now refuses old versions and transactions
--                                   that already have a receipt.

alter table public.documents drop constraint if exists documents_match_status_check;
alter table public.documents add constraint documents_match_status_check
  check (match_status is null or match_status in ('matched', 'suggested', 'unmatched', 'no_amount', 'dismissed'));

drop index if exists public.ix_documents_waiting_receipts;
create index ix_documents_waiting_receipts
  on public.documents (org_id, client_id)
  where transaction_id is null and match_status in ('unmatched', 'suggested', 'no_amount') and deleted_at is null;

-- ── The list ────────────────────────────────────────────────────────────────

create or replace function public.get_pending_receipts(
  p_org_id    uuid,
  p_client_id uuid default null
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  if not lp_private.is_trusted_caller()
     and not public.can_act_for_client(p_org_id, p_client_id) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select d.id, d.filename, d.created_at, d.match_status,
             d.ocr_merchant, d.ocr_amount, d.ocr_date, d.ocr_currency, d.ocr_confidence,
             case when d.ocr_amount is null then '[]'::jsonb else (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', c.transaction_id, 'description', c.description, 'amount', c.amount,
                        'transaction_date', c.transaction_date, 'score', c.score)), '[]'::jsonb)
                 from lp_private.receipt_candidates(d.org_id, d.client_id, d.ocr_amount, d.ocr_date,
                                                    d.ocr_merchant, coalesce(d.ocr_currency, 'USD')) c
                where c.score >= 40
             ) end as candidates
        from public.documents d
       where d.org_id = p_org_id
         and d.client_id is not distinct from p_client_id
         and d.document_kind = 'receipt'
         and d.transaction_id is null
         and d.deleted_at is null
         and d.match_status in ('unmatched', 'suggested', 'no_amount')
       order by d.created_at desc
       limit 100
    ) x;

  return jsonb_build_object('items', v_items);
end;
$$;

-- ── Paid in cash: the receipt becomes the transaction ───────────────────────

create or replace function public.create_expense_from_receipt(p_document_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_doc   public.documents%rowtype;
  v_amt   numeric;
  v_cur   text;
  v_date  date;
  v_desc  text;
  v_raw   text;
  v_prev  text;
  v_now   timestamptz;
  v_hash  text;
  v_tx    public.transactions%rowtype;
begin
  select * into v_doc from public.documents
   where id = p_document_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  -- Staff who may write the books; a portal client scans, the firm records.
  perform lp_private.assert_org_access(v_doc.org_id, array['owner','admin','accountant']::public.lp_role[]);
  if v_uid is null then
    raise exception 'A signed-in user is required' using errcode = '42501';
  end if;
  if v_doc.document_kind <> 'receipt' then
    raise exception 'Only receipts can become an expense' using errcode = '22023';
  end if;
  if v_doc.transaction_id is not null then
    raise exception 'This receipt is already linked to a transaction' using errcode = '22023';
  end if;
  if v_doc.ocr_amount is null or v_doc.ocr_amount <= 0 then
    raise exception 'Enter the receipt total first' using errcode = '22023';
  end if;

  v_amt  := -round(abs(v_doc.ocr_amount), 2);
  v_cur  := upper(coalesce(v_doc.ocr_currency, 'USD'));
  v_date := coalesce(v_doc.ocr_date, current_date);
  v_desc := coalesce(nullif(btrim(v_doc.ocr_merchant), ''), 'Receipt');

  -- raw_hash exactly like src/lib/hash.ts buildRawHash():
  -- sha256(JSON.stringify({orgId, amount, currency, reference, transactionDate, source}))
  v_raw := public.sha256_text(
    '{"orgId":'            || to_json(v_doc.org_id::text)::text ||
    ',"amount":'           || to_json(v_amt::float8)::text ||
    ',"currency":'         || to_json(v_cur)::text ||
    ',"reference":null'    ||
    ',"transactionDate":'  || to_json(to_char(v_date, 'YYYY-MM-DD'))::text ||
    ',"source":"manual"}'
  );

  -- The org's audit chain is linear: one writer at a time.
  perform pg_advisory_xact_lock(hashtextextended('audit_events:' || v_doc.org_id::text, 0));
  select entry_hash into v_prev
    from public.audit_events
   where org_id = v_doc.org_id
   order by created_at desc, id desc
   limit 1;

  v_now := clock_timestamp();

  -- This receipt is linked below; don't let the waiting-receipts trigger
  -- hand the new transaction a different one.
  perform set_config('lp.skip_receipt_match', 'on', true);

  insert into public.transactions (
    org_id, client_id, version, source, amount, currency, description, merchant_name,
    transaction_date, semaphore, status_reason, raw_hash, previous_hash, metadata,
    payment_method, created_by, created_at
  ) values (
    v_doc.org_id, v_doc.client_id, 1, 'manual', v_amt, v_cur, v_desc, nullif(btrim(v_doc.ocr_merchant), ''),
    v_date, 'green', 'Recorded from a receipt (paid outside the imported bank accounts)',
    v_raw, v_prev, jsonb_build_object('created_from_receipt', v_doc.id),
    'cash', v_uid, v_now
  )
  returning * into v_tx;

  perform set_config('lp.skip_receipt_match', 'off', true);

  -- Audit event hashed like transactions.service.ts createTransaction().
  v_hash := public.sha256_text(
    '{"previousHash":'        || coalesce(to_json(v_prev)::text, 'null') ||
    ',"transactionId":'       || to_json(v_tx.id::text)::text ||
    ',"transactionVersion":'  || v_tx.version ||
    ',"eventType":"created"'  ||
    ',"timestamp":'           || to_json(to_char(v_now at time zone 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text ||
    ',"actorId":'             || to_json(v_uid::text)::text || '}'
  );

  insert into public.audit_events (
    org_id, transaction_id, transaction_group_id, transaction_version,
    event_type, actor_id, previous_hash, entry_hash, metadata, created_at
  ) values (
    v_doc.org_id, v_tx.id, v_tx.transaction_group_id, v_tx.version,
    'created', v_uid, v_prev, v_hash,
    jsonb_build_object('raw_hash', v_raw, 'source', 'receipt', 'document_id', v_doc.id,
                       'semaphore', 'green'),
    v_now
  );

  update public.documents
     set transaction_id = v_tx.id, match_status = 'matched'
   where id = v_doc.id;

  return jsonb_build_object('transaction', jsonb_build_object(
    'id', v_tx.id, 'description', v_desc, 'amount', v_tx.amount,
    'transaction_date', v_tx.transaction_date));
end;
$$;

-- ── Doesn't need a transaction ──────────────────────────────────────────────

create or replace function public.dismiss_receipt(p_document_id uuid)
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
  -- Staff only: a portal client must not hide a receipt from the firm.
  perform lp_private.assert_org_access(v_doc.org_id, array['owner','admin','accountant']::public.lp_role[]);
  if v_doc.transaction_id is not null then
    raise exception 'This receipt is already linked to a transaction' using errcode = '22023';
  end if;
  update public.documents set match_status = 'dismissed' where id = v_doc.id;
end;
$$;

-- ── link_receipt: current version, an expense-side line without a receipt ──

create or replace function public.link_receipt(p_document_id uuid, p_transaction_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
  v_tx  public.transactions%rowtype;
begin
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if not public.can_act_for_client(v_doc.org_id, v_doc.client_id) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_doc.document_kind <> 'receipt' then
    raise exception 'Only receipts can be linked this way' using errcode = '22023';
  end if;

  select * into v_tx from public.transactions t
   where t.id = p_transaction_id
     and t.org_id = v_doc.org_id
     and t.client_id is not distinct from v_doc.client_id;
  if not found then
    raise exception 'That transaction is not part of this workspace' using errcode = '42501';
  end if;
  if not v_tx.is_current then
    raise exception 'That transaction was edited; pick its current version' using errcode = '22023';
  end if;
  if lp_private.transaction_has_receipt(v_tx.transaction_group_id)
     and not exists (select 1 from public.documents d
                      where d.id = v_doc.id and d.transaction_id = v_tx.id) then
    raise exception 'That transaction already has a receipt' using errcode = '22023';
  end if;

  update public.documents
     set transaction_id = p_transaction_id, match_status = 'matched'
   where id = v_doc.id;
end;
$$;

-- ── Waiting-receipts trigger: respect lp.skip_receipt_match ────────────────

create or replace function lp_private.match_waiting_receipts()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_best  record;
  v_next  record;
begin
  if coalesce(current_setting('lp.skip_receipt_match', true), '') = 'on' then
    return new;
  end if;
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

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on function lp_private.match_waiting_receipts() from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;

revoke all on function public.get_pending_receipts(uuid, uuid)       from public, anon;
revoke all on function public.create_expense_from_receipt(uuid)      from public, anon;
revoke all on function public.dismiss_receipt(uuid)                  from public, anon;
revoke all on function public.link_receipt(uuid, uuid)               from public, anon;
grant execute on function public.get_pending_receipts(uuid, uuid)    to authenticated, service_role;
grant execute on function public.create_expense_from_receipt(uuid)   to authenticated, service_role;
grant execute on function public.dismiss_receipt(uuid)               to authenticated, service_role;
grant execute on function public.link_receipt(uuid, uuid)            to authenticated, service_role;
