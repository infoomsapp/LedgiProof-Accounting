-- System journal kinds are posted by LedgiProof only.
-- Applied as migration `system_batch_guard`. Reference copy.
--
-- opening_balance, invoice, invoice_payment, bill and bill_payment batches
-- carry rules a hand-made batch would bypass: one set of opening balances per
-- set of books (import_opening_balances), invoices/bills kept in step with
-- their documents (sync_*_ledger). A manual batch of one of those kinds would
-- silently double a balance. They can only be written through
-- lp_private.post_ledger_batch, which marks its transaction; anything else is
-- refused (LO012). Reversal batches are posted the same way, so they pass.

create or replace function lp_private.trg_system_batch_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.entry_kind in ('opening_balance', 'invoice', 'invoice_payment', 'bill', 'bill_payment')
     and coalesce(current_setting('lp.system_posting', true), '') <> 'on' then
    raise exception using errcode = 'LO012',
      message = 'This kind of entry is posted by LedgiProof itself (opening balances: use Import → Opening balances).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_system_batch_guard on public.manual_journal_batches;
create trigger trg_system_batch_guard before insert on public.manual_journal_batches
  for each row execute function lp_private.trg_system_batch_guard();

-- post_ledger_batch marks the posting as the system's for its own insert only.
do $$
declare
  v_def text := pg_get_functiondef('lp_private.post_ledger_batch(uuid,journal_entry_kind,date,text,uuid,text,jsonb,uuid,uuid,uuid,uuid,uuid)'::regprocedure);
  v_old text := $o$begin
  insert into public.manual_journal_batches ($o$;
  v_new text := $n$begin
  perform set_config('lp.system_posting', 'on', true);
  insert into public.manual_journal_batches ($n$;
begin
  if position('lp.system_posting' in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'system_batch_guard: insert not found in post_ledger_batch';
  end if;
  v_def := replace(v_def, v_old, v_new);
  -- and clears it once the batch is posted
  v_def := replace(v_def, $o$   where id = v_batch;
  return v_batch;$o$, $n$   where id = v_batch;
  perform set_config('lp.system_posting', 'off', true);
  return v_batch;$n$);
  execute v_def;
end;
$$;

revoke all on function lp_private.trg_system_batch_guard() from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;
