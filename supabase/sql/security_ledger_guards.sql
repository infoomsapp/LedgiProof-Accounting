-- Security & ledger guards (audit 2026-09-28).
-- Applied as migration `security_ledger_guards`. Kept here as the reference copy.
--
-- Before:
--   · profiles_update_self let a user write their own profiles.client_id and
--     user_type. Every client-portal policy (transactions, accounts, invoices,
--     bank_connections, documents, messages) trusts exactly those two columns
--     (is_client_user() + current_client_id()), so one UPDATE from the browser
--     opened any client's books to any signed-in user.
--   · A transaction's journal lines were balanced only in the browser
--     (validateBalance); the database checked debit = credit only when the
--     transaction was locked. ledger_lines -- every report -- counts the lines
--     long before that.
--   · amount_usd -- the amount every report sums -- was computed by the
--     browser and written as-is.
--   · journal_entries_write checked the transaction's (or batch's) org, never
--     the account's: an accountant of org A could book a line to an account of
--     org B and it would show up in org B's reports (ledger_lines filters by
--     the account's org).
--
-- Now:
--   · LU001 -- client_id / user_type change only inside trusted server code
--     (SECURITY DEFINER functions such as accepting a portal invitation).
--   · LJ001 -- a transaction's live lines must balance, in its currency and in
--     USD. Checked at COMMIT (deferred), so a posting written in one statement
--     or several in one transaction passes; a half-written one never commits.
--   · Direct writes from the app get amount_usd from exchange_rates, the same
--     formula the server paths use (round(amount / usd_rate, 2)); LX001 when
--     there is no rate.
--   · LJ002 -- a line's account must belong to the same org as its
--     transaction or batch.

-- ── Profiles: the columns client-portal RLS trusts ──────────────────────────

create or replace function lp_private.trg_protect_profile_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only a direct call from the app runs as authenticated/anon; the server
  -- flows that link a user to a client are SECURITY DEFINER (owner role).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.client_id is distinct from old.client_id
     or new.user_type is distinct from old.user_type then
    raise exception using errcode = 'LU001',
      message = 'Only an invitation can link your account to a client';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_scope on public.profiles;
create trigger trg_protect_profile_scope
  before update of client_id, user_type on public.profiles
  for each row execute function lp_private.trg_protect_profile_scope();

-- ── Journal lines: the account's books and the USD amount ───────────────────

create or replace function lp_private.trg_journal_line_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org  uuid;
  v_acct uuid;
  v_rate numeric;
begin
  select org_id into v_acct from public.accounts where id = new.account_id;
  if new.transaction_id is not null then
    select org_id into v_org from public.transactions where id = new.transaction_id;
  elsif new.batch_id is not null then
    select org_id into v_org from public.manual_journal_batches where id = new.batch_id;
  end if;
  if v_org is not null and v_acct is distinct from v_org then
    raise exception using errcode = 'LJ002',
      message = 'That account belongs to a different set of books';
  end if;

  -- Server paths (post_ledger_batch, the review inbox, plaid-sync) compute
  -- amount_usd themselves, sometimes at a document's own rate: leave them be.
  if current_user in ('authenticated', 'anon') then
    new.currency := upper(new.currency);
    if new.currency = 'USD' then
      new.amount_usd := new.amount;
    else
      select usd_rate into v_rate from public.exchange_rates where currency = new.currency;
      if v_rate is null or v_rate = 0 then
        -- Same error as error_codes.sql's LX001 (message first: that catalog
        -- row holds its one wording).
        raise exception using message = format('No exchange rate available for %s', new.currency),
          errcode = 'LX001',
          detail  = jsonb_build_object('currency', new.currency)::text;
      end if;
      new.amount_usd := round(new.amount / v_rate, 2);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_journal_line_guard on public.journal_entries;
create trigger trg_journal_line_guard
  before insert or update of account_id, transaction_id, batch_id, amount, amount_usd, currency
  on public.journal_entries
  for each row execute function lp_private.trg_journal_line_guard();

-- ── Journal lines: a transaction's live lines balance (at COMMIT) ───────────

create or replace function lp_private.trg_journal_transaction_balanced()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tx      uuid := coalesce(new.transaction_id, old.transaction_id);
  v_debit   numeric;
  v_credit  numeric;
  v_debit_usd  numeric;
  v_credit_usd numeric;
begin
  if v_tx is null then
    return null;
  end if;
  select coalesce(round(sum(amount) filter (where entry_type = 'debit'), 2), 0),
         coalesce(round(sum(amount) filter (where entry_type = 'credit'), 2), 0),
         coalesce(round(sum(coalesce(amount_usd, amount)) filter (where entry_type = 'debit'), 2), 0),
         coalesce(round(sum(coalesce(amount_usd, amount)) filter (where entry_type = 'credit'), 2), 0)
    into v_debit, v_credit, v_debit_usd, v_credit_usd
    from public.journal_entries
   where transaction_id = v_tx and batch_id is null and not is_reversed;

  if v_debit <> v_credit or v_debit_usd <> v_credit_usd then
    raise exception using errcode = 'LJ001',
      message = format('This entry doesn''t balance: debits %s, credits %s', v_debit, v_credit),
      detail  = jsonb_build_object('debit', v_debit, 'credit', v_credit,
                                   'difference', v_debit - v_credit)::text;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_journal_transaction_balanced on public.journal_entries;
create constraint trigger trg_journal_transaction_balanced
  after insert or update or delete on public.journal_entries
  deferrable initially deferred
  for each row execute function lp_private.trg_journal_transaction_balanced();

revoke all on function lp_private.trg_protect_profile_scope()        from public, anon, authenticated;
revoke all on function lp_private.trg_journal_line_guard()           from public, anon, authenticated;
revoke all on function lp_private.trg_journal_transaction_balanced() from public, anon, authenticated;

-- ── Exchange-rate refresh: authenticated by the scheduler secret ────────────
-- fetch-exchange-rates used to accept anyone sending "x-cron-source:
-- supabase". It now checks x-scheduler-secret like invoice-scheduler.

do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'refresh-exchange-rates';
  if v_job is not null then
    perform cron.alter_job(v_job, command := $cmd$
      select net.http_post(
        url     := 'https://hceihybnqjpzqyibkznp.supabase.co/functions/v1/fetch-exchange-rates',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'x-scheduler-secret',
                     (select decrypted_secret from vault.decrypted_secrets where name = 'invoice_scheduler_secret')),
        body    := '{}'::jsonb
      ) as request_id;
    $cmd$);
  end if;
end;
$$;

-- ── Profiles: UPDATE failed for everyone (migration profiles_update_recursion_fix)
-- profiles_self_update's WITH CHECK read public.profiles from a profiles
-- policy: every UPDATE of profiles failed with 42P17 (infinite recursion),
-- so no one could save their name, phone or account type. What it guarded
-- (tier) is enforced by trg_protect_profile_tier; profiles_update_self keeps
-- "only your own row".
drop policy if exists profiles_self_update on public.profiles;
