-- Reconciliation: no silent close with a difference, and a clear message when
-- cleared transactions aren't in the books yet.
-- Applied as migration `reconciliation_close_guard`. Reference copy.
--
-- Before: close_reconciliation_session() sealed a session whose statement
-- didn't balance (status 'discrepancy') and still turned every cleared
-- transaction blue and locked it -- only the web button stopped it. And a
-- cleared transaction nobody had categorized made the close fail deep inside
-- trg_enforce_balanced_journal_before_lock with "cannot lock transaction
-- <uuid>: no journal entries found".
--
-- Now:
--   · LR001 -- some cleared transactions aren't categorized: the close stops
--     before touching anything and says how many (and which), so they can be
--     confirmed in "For review" first.
--   · LR002 -- the statement doesn't balance: refused unless the caller gives
--     a reason (p_accept_difference_note).
--   · LR003 -- accepting a difference is an owner/admin decision; the reason,
--     the amount and who accepted it are written to the session's notes
--     before it is sealed.
--   · LR004 -- the session doesn't exist.
-- The sealing itself is unchanged (close_reconciliation_session_impl).

drop function if exists public.close_reconciliation_session(uuid, uuid);

create or replace function public.close_reconciliation_session(
  p_session_id             uuid,
  p_user_id                uuid,
  p_accept_difference_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id     uuid;
  v_status     text;
  v_difference numeric;
  v_missing    integer;
  v_examples   text;
  v_note       text := nullif(btrim(coalesce(p_accept_difference_note, '')), '');
begin
  select org_id into v_org_id from public.reconciliation_sessions where id = p_session_id;
  if not found then
    raise exception using errcode = 'LR004', message = 'This reconciliation period no longer exists';
  end if;
  perform lp_private.assert_org_access(v_org_id, array['owner','admin','accountant']::public.lp_role[]);
  perform lp_private.assert_is_caller(p_user_id);

  select status, difference into v_status, v_difference
    from public.v_reconciliation_summary where session_id = p_session_id;
  if v_status <> 'open' then
    return lp_private.close_reconciliation_session_impl(p_session_id, p_user_id);  -- says "already closed"
  end if;

  -- Every cleared line must already be in the books (the close locks it).
  select count(*),
         string_agg(coalesce(t.merchant_name, t.description, 'Transaction') || ' ' || t.amount::text, ', '
                    order by t.transaction_date) filter (where rn <= 5)
    into v_missing, v_examples
    from (select t.*, row_number() over (order by t.transaction_date) rn
            from public.reconciliation_items ri
            join public.transactions t on t.id = ri.transaction_id
           where ri.session_id = p_session_id
             and ri.is_cleared
             and not exists (select 1 from public.journal_entries je
                              where je.transaction_id = t.id and not je.is_reversed)) t;
  if v_missing > 0 then
    raise exception using errcode = 'LR001',
      message = format('%s cleared transaction(s) aren''t categorized yet (%s). Confirm them in For review first.',
                       v_missing, v_examples),
      detail  = jsonb_build_object('count', v_missing, 'examples', v_examples)::text;
  end if;

  if abs(coalesce(v_difference, 0)) >= 0.01 then
    if v_note is null then
      raise exception using errcode = 'LR002',
        message = format('The statement doesn''t balance — difference %s. Fix it, or close with a reason.', v_difference),
        detail  = jsonb_build_object('difference', v_difference)::text;
    end if;
    if not public.has_org_role(v_org_id, array['owner','admin']::public.lp_role[]) then
      raise exception using errcode = 'LR003',
        message = 'Only an owner or admin can close a reconciliation with a difference';
    end if;
    -- Written while the session is still open (sealed sessions can't change).
    update public.reconciliation_sessions
       set notes = concat_ws(E'\n', nullif(notes, ''),
                   format('Closed with a difference of %s, accepted by %s on %s: %s',
                          v_difference,
                          coalesce((select email from auth.users where id = p_user_id), p_user_id::text),
                          to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'),
                          v_note))
     where id = p_session_id;
  end if;

  return lp_private.close_reconciliation_session_impl(p_session_id, p_user_id);
end;
$$;

revoke all on function public.close_reconciliation_session(uuid, uuid, text) from public, anon;
grant execute on function public.close_reconciliation_session(uuid, uuid, text) to authenticated, service_role;

-- ── The seal itself never worked ────────────────────────────────────────────
-- close_reconciliation_session_impl() sets locked_at on every cleared
-- transaction but never final_hash, and transactions_lock_final_hash_chk
-- requires one -- so EVERY close failed, balanced or not. The impl now writes
-- final_hash exactly like transactions.service.ts lockTransaction() ->
-- buildFinalHash(): sha256(JSON.stringify({previousHash (''), transactionData:
-- {id, org_id, version, amount, currency, reference, transaction_date,
-- semaphore}, timestamp, actorId})).

do $$
declare
  v_def text;
  v_old text := $o$locked_at           = CASE WHEN t.locked_at IS NULL THEN v_now ELSE t.locked_at END$o$;
  v_new text := $n$locked_at           = CASE WHEN t.locked_at IS NULL THEN v_now ELSE t.locked_at END,
         final_hash          = COALESCE(t.final_hash, public.sha256_text(
           '{"previousHash":' || to_json(COALESCE((SELECT ae.entry_hash FROM public.audit_events ae
                                                    WHERE ae.org_id = t.org_id
                                                    ORDER BY ae.created_at DESC, ae.id DESC LIMIT 1), ''))::text ||
           ',"transactionData":{"id":'       || to_json(t.id::text)::text ||
                              ',"org_id":'   || to_json(t.org_id::text)::text ||
                              ',"version":'  || t.version ||
                              ',"amount":'   || to_json(t.amount::float8)::text ||
                              ',"currency":' || to_json(t.currency::text)::text ||
                              ',"reference":' || COALESCE(to_json(t.reference)::text, 'null') ||
                              ',"transaction_date":' || to_json(to_char(t.transaction_date, 'YYYY-MM-DD'))::text ||
                              ',"semaphore":"blue"}' ||
           ',"timestamp":' || to_json(to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text ||
           ',"actorId":'   || to_json(p_user_id::text)::text || '}'))$n$;
begin
  v_def := pg_get_functiondef('lp_private.close_reconciliation_session_impl(uuid,uuid)'::regprocedure);
  if position('final_hash          = COALESCE' in v_def) > 0 then
    return;   -- already applied
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'reconciliation_close_guard: lock assignment not found in close_reconciliation_session_impl';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;
