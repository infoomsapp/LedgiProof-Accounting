-- A firm's own books live in Personal.
-- Applied as migration `firm_books_in_personal`. Kept here as the reference copy.
--
-- Decision (2026-09-29): the Firm workspace is for the firm's clients; the
-- firm's own bank, expenses and month-end are Personal ("Your own books").
-- Firm mode has no For review / Transactions / Close the books for its own
-- books, so a transaction with no client in a firm workspace could be
-- counted on the firm dashboard but never categorized -- which is what a CSV
-- import done in Firm mode left behind.
--
-- Now: LF001 on a NEW transaction without a client in a firm workspace, from
-- any caller (web, mobile, CSV, Plaid). Lines already there are untouched.

create or replace function lp_private.trg_firm_needs_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is null
     and exists (select 1 from public.organizations o where o.id = new.org_id and o.is_firm) then
    raise exception using errcode = 'LF001',
      message = 'A firm''s own books are kept in Personal: switch to Personal to add this, or choose a client';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_firm_needs_client on public.transactions;
create trigger trg_firm_needs_client
  before insert on public.transactions
  for each row execute function lp_private.trg_firm_needs_client();

revoke all on function lp_private.trg_firm_needs_client() from public, anon, authenticated;
