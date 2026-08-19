// PATH: supabase/functions/stripe-webhook/index.ts
//
// Verifies Stripe webhook signatures and routes events to handlers.
// Works in tandem with create-checkout-session.
//
// Events handled:
//   checkout.session.completed    → record invoice payment OR create subscription
//   customer.subscription.updated → update status / renewal period on plan changes
//   customer.subscription.deleted → mark subscription as canceled
//   invoice.payment_failed        → mark subscription as past_due
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET   (from Stripe Dashboard → Webhooks → signing secret)
//
// Register endpoint in Stripe Dashboard:
//   https://<project>.supabase.co/functions/v1/stripe-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe           from 'npm:stripe@17'

const STRIPE_SECRET  = Deno.env.get('STRIPE_SECRET_KEY')          ?? ''
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')      ?? ''
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')              ?? ''
const SVC_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2025-06-30' as any })

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Signature verification ──────────────────────────────────────────────────
  const sig  = req.headers.get('stripe-signature') ?? ''
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, WEBHOOK_SECRET)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stripe-webhook] signature verification failed:', msg)
    return new Response(JSON.stringify({ error: `Webhook Error: ${msg}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const db = createClient(SUPABASE_URL, SVC_KEY)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, db)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, db)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, db)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, db)
        break
      default:
        console.log('[stripe-webhook] unhandled event:', event.type)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[stripe-webhook] handler error for ${event.type}:`, msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── checkout.session.completed ──────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  db: ReturnType<typeof createClient>,
) {
  const meta = session.metadata ?? {}

  // ── Invoice payment ─────────────────────────────────────────────────────────
  if (meta['type'] === 'invoice') {
    const invoiceId  = meta['invoice_id']
    const orgId      = meta['org_id']
    const recordedBy = meta['created_by']
    const currency   = meta['currency'] ?? 'USD'

    if (!invoiceId || !orgId || !recordedBy) {
      throw new Error(
        `checkout.session.completed invoice: missing metadata (invoice_id=${invoiceId}, org_id=${orgId}, created_by=${recordedBy})`
      )
    }

    const amountPaid = (session.amount_total ?? 0) / 100
    const paymentRef = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

    const { error: insertErr } = await db
      .from('invoice_payments')
      .insert({
        invoice_id:   invoiceId,
        org_id:       orgId,
        amount:       amountPaid,
        currency,
        payment_date: new Date().toISOString().slice(0, 10),
        method:       'stripe',
        reference:    paymentRef,
        recorded_by:  recordedBy,
      })

    if (insertErr) throw new Error(`insert invoice_payment: ${insertErr.message}`)

    // Recompute totals — sets status to 'paid' when balance_due reaches 0
    const { error: rpcErr } = await db.rpc('compute_invoice_totals', { p_invoice_id: invoiceId })
    if (rpcErr) throw new Error(`compute_invoice_totals: ${rpcErr.message}`)

    console.log(`[stripe-webhook] invoice ${invoiceId} payment recorded: ${amountPaid} ${currency}`)
    return
  }

  // ── Subscription creation ────────────────────────────────────────────────────
  if (meta['type'] === 'subscription') {
    const plan   = meta['plan']    ?? 'starter'
    const orgId  = meta['org_id']
    const userId = meta['user_id']

    if (!orgId || !userId) throw new Error('checkout.session.completed subscription: missing org_id or user_id')

    const stripeCustomerId = typeof session.customer === 'string'
      ? session.customer
      : (session.customer as Stripe.Customer | null)?.id ?? null

    const stripeSubscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null

    // Fetch subscription from Stripe to get confirmed period dates and price
    let stripePriceId: string | null = null
    let periodStart = new Date().toISOString()
    let periodEnd: string | null     = null

    if (stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
      stripePriceId = sub.items.data[0]?.price?.id ?? null
      periodStart   = new Date(sub.current_period_start * 1000).toISOString()
      periodEnd     = new Date(sub.current_period_end   * 1000).toISOString()
    }

    // Upsert by stripe_subscription_id for idempotency (Stripe may replay events)
    const { error: upsertErr } = await (db as any)
      .from('subscriptions')
      .upsert(
        {
          user_id:                userId,
          org_id:                 orgId,
          plan,
          status:                 'active',
          stripe_customer_id:     stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          stripe_price_id:        stripePriceId,
          current_period_start:   periodStart,
          current_period_end:     periodEnd,
        },
        { onConflict: 'stripe_subscription_id', ignoreDuplicates: false },
      )

    if (upsertErr) throw new Error(`upsert subscription: ${upsertErr.message}`)

    console.log(`[stripe-webhook] subscription created for org ${orgId}: plan=${plan}`)
    return
  }

  console.warn('[stripe-webhook] checkout.session.completed: unknown metadata type:', meta['type'])
}

// ── customer.subscription.updated ──────────────────────────────────────────

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  db: ReturnType<typeof createClient>,
) {
  const STATUS_MAP: Record<string, string> = {
    active:             'active',
    trialing:           'trialing',
    past_due:           'past_due',
    canceled:           'canceled',
    unpaid:             'past_due',
    incomplete:         'past_due',
    incomplete_expired: 'expired',
    paused:             'past_due',
  }
  const status    = STATUS_MAP[sub.status] ?? 'past_due'
  const priceId   = sub.items.data[0]?.price?.id ?? null
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString()

  const { error } = await db
    .from('subscriptions')
    .update({ status, stripe_price_id: priceId, current_period_end: periodEnd })
    .eq('stripe_subscription_id', sub.id)

  if (error) throw new Error(`update subscription (${sub.id}): ${error.message}`)
  console.log(`[stripe-webhook] subscription ${sub.id} updated → ${status}`)
}

// ── customer.subscription.deleted ──────────────────────────────────────────

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  db: ReturnType<typeof createClient>,
) {
  const { error } = await db
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('stripe_subscription_id', sub.id)

  if (error) throw new Error(`cancel subscription (${sub.id}): ${error.message}`)
  console.log(`[stripe-webhook] subscription ${sub.id} canceled`)
}

// ── invoice.payment_failed ─────────────────────────────────────────────────

async function handleInvoicePaymentFailed(
  inv: Stripe.Invoice,
  db: ReturnType<typeof createClient>,
) {
  const subId = typeof inv.subscription === 'string'
    ? inv.subscription
    : (inv.subscription as Stripe.Subscription | null)?.id

  if (!subId) return

  const { error } = await db
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subId)

  if (error) throw new Error(`mark past_due (${subId}): ${error.message}`)
  console.log(`[stripe-webhook] subscription ${subId} → past_due (payment failed)`)
}
