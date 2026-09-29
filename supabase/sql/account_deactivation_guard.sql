-- An account the books still use can't be switched off.
-- Applied as migration `account_deactivation_guard`. Kept here as the reference copy.
--
-- Found in the live walkthrough (2026-09-29): Accounts Receivable with $200
-- owed, Cash & Checking with $7,394 and Undeposited Funds could all be
-- deactivated. find_system_account() only returns ACTIVE accounts, so the
-- next invoice, payment or bill would have posted to another account or
-- failed, and the balance would have vanished from the chart.
--
-- Now, on is_active true -> false:
--   LC001 -- the account still has a balance in the ledger (live lines, draft
--            batches excluded): move it first.
--   LC002 -- LedgiProof posts to it by itself: A/R, Undeposited Funds, A/P,
--            Bill Payments in Transit, Sales Tax Payable (find_system_account)
--            or the bank account For review posts against
--            (default_cash_account).

create or replace function lp_private.trg_account_deactivation_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if not (old.is_active and not new.is_active) then
    return new;
  end if;

  if new.id = lp_private.default_cash_account(new.org_id, new.client_id)
     or (new.client_id is null and new.id in (
           select lp_private.find_system_account(new.org_id, r)
             from unnest(array['ar', 'undeposited', 'ap', 'bills_in_transit', 'sales_tax']) r)) then
    raise exception using errcode = 'LC002',
      message = 'LedgiProof posts to this account by itself (invoices, payments or bills): it can''t be deactivated';
  end if;

  select coalesce(sum(case when je.entry_type = 'debit' then coalesce(je.amount_usd, je.amount)
                           else -coalesce(je.amount_usd, je.amount) end), 0)
    into v_balance
    from public.journal_entries je
    left join public.manual_journal_batches b on b.id = je.batch_id
   where je.account_id = new.id
     and not je.is_reversed
     and (je.batch_id is null or b.status <> 'draft');
  if round(v_balance, 2) <> 0 then
    raise exception using errcode = 'LC001',
      message = format('This account still has a balance (%s): move it to another account before deactivating', round(v_balance, 2)),
      detail  = jsonb_build_object('balance', round(v_balance, 2))::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_account_deactivation_guard on public.accounts;
create trigger trg_account_deactivation_guard
  before update of is_active on public.accounts
  for each row execute function lp_private.trg_account_deactivation_guard();

revoke all on function lp_private.trg_account_deactivation_guard() from public, anon, authenticated;
