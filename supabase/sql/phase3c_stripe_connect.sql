-- Phase 3c: "Pay now" pays the business, not LedgiProof (Stripe Connect).
-- Applied 2026-09-27 as migration `phase3c_stripe_connect`. Kept here as the
-- reference copy.
--
-- Before: create-checkout-session charged the invoice on LedgiProof's own
-- Stripe account -- every customer payment for every workspace landed with
-- the platform.
--
-- Now each workspace connects its own Stripe account (Standard account,
-- direct charges: the business is the merchant of record and handles its own
-- refunds and disputes). The stripe-connect edge function creates the account
-- and the onboarding link; the webhook keeps these flags current.
-- The public invoice page asks invoice_accepts_card() whether to show
-- "Pay now".

create table if not exists public.org_payment_accounts (
  org_id             uuid primary key references public.organizations(id) on delete cascade,
  stripe_account_id  text not null unique,
  charges_enabled    boolean not null default false,
  payouts_enabled    boolean not null default false,
  details_submitted  boolean not null default false,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.org_payment_accounts enable row level security;

drop policy if exists org_payment_accounts_select on public.org_payment_accounts;
create policy org_payment_accounts_select on public.org_payment_accounts
  for select to authenticated using (public.is_org_member(org_id));

-- Writes happen only in the edge functions (service role).
revoke all on public.org_payment_accounts from anon, authenticated;
grant select on public.org_payment_accounts to authenticated;
grant all on public.org_payment_accounts to service_role;

-- Public (by token): can this invoice be paid by card right now?
create or replace function public.invoice_accepts_card(p_token text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.invoices i
      join public.org_payment_accounts pa on pa.org_id = i.org_id
     where i.public_token = p_token
       and i.status in ('sent', 'viewed', 'partial', 'overdue')
       and i.balance_due > 0
       and pa.charges_enabled
  )
$$;

revoke all on function public.invoice_accepts_card(text) from public;
grant execute on function public.invoice_accepts_card(text) to anon, authenticated, service_role;
