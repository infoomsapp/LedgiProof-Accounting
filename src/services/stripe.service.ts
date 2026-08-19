// PATH: src/services/stripe.service.ts
//
// Client-side helpers for initiating Stripe Checkout sessions.
// Both functions call the create-checkout-session Edge Function and return
// the Stripe-hosted checkout URL — the caller is responsible for the redirect.

import { db } from '../lib/supabase'

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
      success_url:  opts.successUrl ?? `${origin}/i/paid`,
      cancel_url:   opts.cancelUrl  ?? here,
    },
  })

  if (error) throw new Error(error.message ?? 'Failed to create checkout session')
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
      cancel_url:  `${origin}/pricing`,
    },
  })

  if (error) throw new Error(error.message ?? 'Failed to create checkout session')
  if (!data?.url) throw new Error('No checkout URL returned from payment gateway')
  return data.url as string
}
