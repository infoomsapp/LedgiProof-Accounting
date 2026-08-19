// PATH: supabase/functions/create-checkout-session/index.ts
//
// Creates a Stripe Checkout Session in two modes:
//   'invoice'      — one-time payment for a client-facing invoice
//                    Auth: none required (access gated by public_token UUID)
//   'subscription' — recurring SaaS plan for LedgiProof itself
//                    Auth: requires valid user JWT
//
// Required Supabase secrets (set via `supabase secrets set KEY=value`):
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_ID_STARTER
//   STRIPE_PRICE_ID_ENTREPRENEUR
//   STRIPE_PRICE_ID_BOOKKEEPER
//   STRIPE_PRICE_ID_ACCOUNTANT
//
// Returns: { url: string }  — redirect the browser to this Stripe-hosted URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe           from 'npm:stripe@17'
import { getCorsHeaders } from '../_shared/cors.ts'

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY')          ?? ''
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')              ?? ''
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2025-06-30' as any })

// Stripe Price IDs — create in Stripe Dashboard → Products, then:
//   supabase secrets set STRIPE_PRICE_ID_STARTER=price_xxx ...
const PRICE_IDS: Record<string, string | undefined> = {
  starter:      Deno.env.get('STRIPE_PRICE_ID_STARTER'),
  entrepreneur: Deno.env.get('STRIPE_PRICE_ID_ENTREPRENEUR'),
  bookkeeper:   Deno.env.get('STRIPE_PRICE_ID_BOOKKEEPER'),
  accountant:   Deno.env.get('STRIPE_PRICE_ID_ACCOUNTANT'),
}

type InvoiceRequest = {
  type:         'invoice'
  public_token: string
  success_url:  string
  cancel_url:   string
}

type SubscriptionRequest = {
  type:        'subscription'
  plan:        string
  org_id:      string
  success_url: string
  cancel_url:  string
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body: InvoiceRequest | SubscriptionRequest = await req.json()
    const db = createClient(SUPABASE_URL, SVC_KEY)

    // ── Invoice payment (public — no auth needed) ─────────────────────────────
    if (body.type === 'invoice') {
      const { public_token, success_url, cancel_url } = body

      const { data: inv, error } = await db
        .from('invoices')
        .select('id, invoice_number, balance_due, currency, org_id, status, title, created_by')
        .eq('public_token', public_token)
        .single()

      if (error || !inv) return fail('Invoice not found', 404, cors)

      const status = (inv as any).status as string | undefined
      if (status === 'paid' || status === 'void') {
        return fail(`Invoice is already ${status}`, 400, cors)
      }
      if (Number(inv.balance_due) <= 0) {
        return fail('No outstanding balance on this invoice', 400, cors)
      }

      const currency   = (inv.currency ?? 'USD').toLowerCase()
      const unitAmount = Math.round(Number(inv.balance_due) * 100)

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: {
              name:        `Invoice ${inv.invoice_number}`,
              description: (inv.title as string | null) ?? undefined,
            },
          },
        }],
        metadata: {
          type:        'invoice',
          invoice_id:  inv.id,
          org_id:      inv.org_id,
          created_by:  (inv as any).created_by as string,
          currency:    currency.toUpperCase(),
        },
        success_url,
        cancel_url,
      })

      return ok({ url: session.url }, cors)
    }

    // ── Subscription (requires user JWT) ──────────────────────────────────────
    if (body.type === 'subscription') {
      const { plan, org_id, success_url, cancel_url } = body

      // Validate caller's JWT
      const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: { user }, error: authErr } = await db.auth.getUser(jwt)
      if (authErr || !user) return fail('Unauthorized', 401, cors)

      const priceId = PRICE_IDS[plan]
      if (!priceId) return fail(`Stripe price not configured for plan: ${plan}`, 400, cors)

      // Re-use existing Stripe customer for the org (avoids duplicate customers)
      const { data: existingSub } = await db
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('org_id', org_id)
        .not('stripe_customer_id', 'is', null)
        .maybeSingle()

      const customerConfig = existingSub?.stripe_customer_id
        ? { customer: existingSub.stripe_customer_id as string }
        : { customer_email: user.email! }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        ...customerConfig,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          type:    'subscription',
          plan,
          org_id,
          user_id: user.id,
        },
        success_url,
        cancel_url,
      })

      return ok({ url: session.url }, cors)
    }

    return fail('Invalid request type — expected "invoice" or "subscription"', 400, cors)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[create-checkout-session]', msg)
    return fail(msg, 500, cors)
  }
})

function ok(body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function fail(message: string, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
