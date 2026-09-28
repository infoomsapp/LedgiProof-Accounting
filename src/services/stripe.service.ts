// PATH: src/services/stripe.service.ts
//
// Client-side helpers for Stripe:
//   · Checkout sessions (create-checkout-session): an invoice's "Pay now"
//     (charged on the business's own connected account) and LedgiProof plans.
//   · Online payments setup (stripe-connect): connect the workspace's own
//     Stripe account and read its status.
// Checkout helpers return the Stripe-hosted URL; the caller redirects.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'

// ── Invoice payment ────────────────────────────────────────────────────────────

export async function createInvoiceCheckoutSession(
  publicToken: string,
  opts: { successUrl?: string; cancelUrl?: string } = {},
): Promise<string> {
  const origin = window.location.origin
  const here   = window.location.href

  const { data, error } = await db.functions.invoke('create-checkout-session', {
    body: {
      type:         'invoice',
      public_token: publicToken,
      // Back to the same invoice page (there is no /i/paid route: it used to
      // land on "Not found" after a successful payment).
      success_url:  opts.successUrl ?? `${origin}/i/${publicToken}?paid=1`,
      cancel_url:   opts.cancelUrl  ?? here,
    },
  })

  if (error) throw dbError(error, 'Failed to create the checkout session')
  if (!data?.url) throw new Error('No checkout URL returned from payment gateway')
  return data.url as string
}

// ── SaaS subscription ──────────────────────────────────────────────────────────

export async function createSubscriptionCheckoutSession(
  plan:  string,
  orgId: string,
): Promise<string> {
  const origin = window.location.origin

  const { data, error } = await db.functions.invoke('create-checkout-session', {
    body: {
      type:        'subscription',
      plan,
      org_id:      orgId,
      success_url: `${origin}/billing/success?plan=${encodeURIComponent(plan)}`,
      cancel_url:  `${origin}/settings?tab=billing`,
    },
  })

  if (error) throw dbError(error, 'Failed to create the checkout session')
  if (!data?.url) throw new Error('No checkout URL returned from payment gateway')
  return data.url as string
}

// ── Online payments: the workspace's own Stripe account (Connect) ──────────────

export interface OnlinePaymentsStatus {
  connected:         boolean
  charges_enabled:   boolean
  payouts_enabled:   boolean
  details_submitted: boolean
}

export async function getOnlinePaymentsStatus(orgId: string): Promise<OnlinePaymentsStatus> {
  const { data, error } = await db.functions.invoke('stripe-connect', {
    body: { action: 'status', org_id: orgId },
  })
  if (error) throw dbError(error, 'Could not check online payments')
  if (data?.error) throw new Error(data.error)
  return data as OnlinePaymentsStatus
}

/** Stripe-hosted onboarding; creates the connected account the first time. */
export async function startOnlinePaymentsOnboarding(orgId: string, returnUrl: string): Promise<string> {
  const { data, error } = await db.functions.invoke('stripe-connect', {
    body: { action: 'onboard', org_id: orgId, return_url: returnUrl },
  })
  if (error) throw dbError(error, 'Could not start the Stripe setup')
  if (data?.error) throw new Error(data.error)
  if (!data?.url) throw new Error('Stripe did not return a setup link')
  return data.url as string
}

/** Public (by invoice token): does this invoice take card payments right now? */
export async function invoiceAcceptsCard(publicToken: string): Promise<boolean> {
  const { data, error } = await db.rpc('invoice_accepts_card', { p_token: publicToken })
  if (error) return false
  return data === true
}
