// PATH: supabase/functions/create-checkout-session/index.ts
//
// Creates a Stripe Checkout Session in two modes:
//   'invoice'      — one-time payment for a client-facing invoice, charged
//                    ON THE BUSINESS'S OWN connected Stripe account (direct
//                    charge; see stripe-connect) -- the money never touches
//                    LedgiProof's account. Refused when the workspace hasn't
//                    connected Stripe or can't take charges yet.
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
//   STRIPE_PRICE_ID_EXTRA_COMPANY_STARTER / _ENTREPRENEUR (optional) — extra
//                               companies (Option B), added as a second line
//   STRIPE_APPLICATION_FEE_BPS  (optional) platform fee on invoice payments,
//                               in basis points (100 = 1%). Default 0.
//
// Returns: { url: string }  — redirect the browser to this Stripe-hosted URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe           from 'npm:stripe@17'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'
import { isAllowedReturnUrl } from '../_shared/return-url.ts'

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY')          ?? ''
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')              ?? ''
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FEE_BPS       = Math.max(0, Math.min(1000, Number(Deno.env.get('STRIPE_APPLICATION_FEE_BPS') ?? '0') || 0))

// Null until STRIPE_SECRET_KEY is set: the Stripe SDK throws at construction
// without a key, which would crash the function on boot for every request.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripeClient = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: '2025-06-30' as any }) : null

// Stripe Price IDs — create in Stripe Dashboard → Products, then:
//   supabase secrets set STRIPE_PRICE_ID_STARTER=price_xxx ...
const PRICE_IDS: Record<string, string | undefined> = {
  starter:      Deno.env.get('STRIPE_PRICE_ID_STARTER'),
  entrepreneur: Deno.env.get('STRIPE_PRICE_ID_ENTREPRENEUR'),
  bookkeeper:   Deno.env.get('STRIPE_PRICE_ID_BOOKKEEPER'),
  accountant:   Deno.env.get('STRIPE_PRICE_ID_ACCOUNTANT'),
}

// Extra companies past the ones a plan includes (Option B), billed in the same
// subscription. Same env names sync-company-addon uses.
const EXTRA_COMPANY_PRICE_IDS: Record<string, string | undefined> = {
  starter:      Deno.env.get('STRIPE_PRICE_ID_EXTRA_COMPANY_STARTER'),
  entrepreneur: Deno.env.get('STRIPE_PRICE_ID_EXTRA_COMPANY_ENTREPRENEUR'),
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
    if (!stripeClient) return fail('Online payments are not configured yet', 503, cors)
    const stripe = stripeClient
    const body: InvoiceRequest | SubscriptionRequest = await req.json()
    const db = createClient(SUPABASE_URL, SVC_KEY)

    if (!isAllowedReturnUrl(body.success_url) || !isAllowedReturnUrl(body.cancel_url)) {
      return fail('Invalid return URL', 400, cors)
    }

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
      if (status === 'draft') {
        return fail('This invoice has not been issued yet', 400, cors)
      }
      if (Number(inv.balance_due) <= 0) {
        return fail('No outstanding balance on this invoice', 400, cors)
      }

      // The business's own Stripe account.
      const { data: payAcct } = await db
        .from('org_payment_accounts')
        .select('stripe_account_id, charges_enabled')
        .eq('org_id', inv.org_id)
        .maybeSingle()
      if (!payAcct?.charges_enabled) {
        return fail('This business does not accept online card payments yet', 400, cors)
      }

      const currency   = (inv.currency ?? 'USD').toLowerCase()
      const unitAmount = Math.round(Number(inv.balance_due) * 100)
      const fee        = FEE_BPS > 0 ? Math.floor(unitAmount * FEE_BPS / 10000) : 0
      const invoiceMeta = {
        type:        'invoice',
        invoice_id:  inv.id,
        org_id:      inv.org_id,
        created_by:  (inv as any).created_by as string,
        currency:    currency.toUpperCase(),
      }

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
        metadata: invoiceMeta,
        payment_intent_data: {
          metadata: invoiceMeta,
          ...(fee > 0 ? { application_fee_amount: fee } : {}),
        },
        success_url,
        cancel_url,
      }, { stripeAccount: payAcct.stripe_account_id as string })

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

      // Companies created during the trial past the plan's included ones are
      // part of what they subscribe to -- counted, never stored.
      const { data: allowance } = await db.rpc('workspace_allowance_for_user', { p_user: user.id })
      const { data: included } = await db.from('plan_features')
        .select('limit_value').eq('plan', plan).eq('feature_key', 'workspaces').maybeSingle()
      const used      = Number((allowance as any)?.used ?? 0)
      const inc       = Number(included?.limit_value ?? 1)
      const extras    = inc === -1 ? 0 : Math.max(0, used - inc)
      const extraId   = EXTRA_COMPANY_PRICE_IDS[plan]
      if (extras > 0 && !extraId) {
        return fail(`Stripe price not configured for extra companies on plan: ${plan}`, 400, cors)
      }
      const lineItems = [
        { price: priceId, quantity: 1 },
        ...(extras > 0 && extraId ? [{ price: extraId, quantity: extras }] : []),
      ]

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        ...customerConfig,
        line_items: lineItems,
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
    console.error('[create-checkout-session]', err)
    return fail(safeMessage(err, 'Failed to start checkout'), 500, cors)
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
