// PATH: supabase/functions/stripe-webhook/index.ts
//
// Verifies Stripe webhook signatures and routes events to handlers.
// Works in tandem with create-checkout-session.
//
// Events handled:
//   checkout.session.completed    → record invoice payment OR create subscription
//                                   (invoice payments come from the business's
//                                   connected account -- event.account -- and
//                                   must match the account on file for that
//                                   workspace; a replayed event is a no-op)
//   account.updated               → connected account can / can't take charges
//   account.application.deauthorized → the business disconnected LedgiProof
//   customer.subscription.updated → update status / renewal period on plan changes
//   customer.subscription.deleted → mark subscription as canceled
//   invoice.payment_failed        → mark subscription as past_due
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET          (Webhooks → the "Your account" endpoint's signing secret)
//   STRIPE_CONNECT_WEBHOOK_SECRET  (Webhooks → the "Connected accounts" endpoint's signing secret)
//
// Register BOTH endpoints in Stripe Dashboard, same URL:
//   https://<project>.supabase.co/functions/v1/stripe-webhook
//   · Your account:        checkout.session.completed, customer.subscription.updated,
//                          customer.subscription.deleted, invoice.payment_failed
//   · Connected accounts:  checkout.session.completed, account.updated,
//                          account.application.deauthorized

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe           from 'npm:stripe@17'
import { safeMessage }  from '../_shared/errors.ts'

const STRIPE_SECRET  = Deno.env.get('STRIPE_SECRET_KEY')          ?? ''
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')      ?? ''
const CONNECT_SECRET = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')              ?? ''
const SVC_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Null until STRIPE_SECRET_KEY is set: the Stripe SDK throws at construction
// without a key, which would crash the function on boot for every request.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripeClient = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: '2025-06-30' as any }) : null

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!stripeClient) {
    return new Response(JSON.stringify({ error: 'Stripe is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const stripe = stripeClient

  // ── Signature verification ──────────────────────────────────────────────────
  const sig  = req.headers.get('stripe-signature') ?? ''
  const body = await req.text()

  let event: Stripe.Event
  try {
    // The platform endpoint and the Connect endpoint sign with different secrets.
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, WEBHOOK_SECRET)
    } catch (first) {
      if (!CONNECT_SECRET) throw first
      event = await stripe.webhooks.constructEventAsync(body, sig, CONNECT_SECRET)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stripe-webhook] signature verification failed:', msg)
    return new Response(JSON.stringify({ error: `Webhook Error: ${msg}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const db = createClient(SUPABASE_URL, SVC_KEY)

  // LedgiProof's own billing (plans) only ever comes from the platform
  // account. An event from a connected business account never touches it --
  // otherwise a business could "subscribe" itself for free.
  const PLATFORM_ONLY = new Set([
    'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed',
  ])
  if (event.account && PLATFORM_ONLY.has(event.type)) {
    console.log(`[stripe-webhook] ignoring ${event.type} from connected account ${event.account}`)
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, db, event.account ?? null)
        break
      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account, db)
        break
      case 'account.application.deauthorized':
        if (event.account) await handleAccountDeauthorized(event.account, db)
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

// The PLAN's price on a subscription. With extra companies (Option B) a
// subscription has two items; items[0] could be the extra-company one.
const EXTRA_COMPANY_PRICES = new Set(
  [Deno.env.get('STRIPE_PRICE_ID_EXTRA_COMPANY_STARTER'), Deno.env.get('STRIPE_PRICE_ID_EXTRA_COMPANY_ENTREPRENEUR')]
    .filter((p): p is string => !!p))
function planItemPrice(sub: Stripe.Subscription): string | null {
  const item = sub.items.data.find(i => !EXTRA_COMPANY_PRICES.has(i.price?.id ?? '')) ?? sub.items.data[0]
  return item?.price?.id ?? null
}

// ── checkout.session.completed ──────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  db: ReturnType<typeof createClient>,
  connectedAccount: string | null,
) {
  const meta = session.metadata ?? {}

  // ── Invoice payment ─────────────────────────────────────────────────────────
  if (meta['type'] === 'invoice') {
    if (session.payment_status !== 'paid') {
      console.log(`[stripe-webhook] invoice session ${session.id} not paid yet (${session.payment_status})`)
      return
    }
    // Only the business's own connected account can pay its invoices: the
    // metadata alone is not trusted (any Stripe account could send it).
    const { data: payAcct } = await db
      .from('org_payment_accounts')
      .select('stripe_account_id')
      .eq('org_id', meta['org_id'] ?? '')
      .maybeSingle()
    if (!connectedAccount || !payAcct || payAcct.stripe_account_id !== connectedAccount) {
      throw new Error(`invoice payment from account ${connectedAccount} does not match org ${meta['org_id']}`)
    }
    // ...and only for an invoice of that same workspace.
    const { data: target } = await db
      .from('invoices')
      .select('id')
      .eq('id', meta['invoice_id'] ?? '')
      .eq('org_id', meta['org_id'] ?? '')
      .maybeSingle()
    if (!target) {
      throw new Error(`invoice ${meta['invoice_id']} is not an invoice of org ${meta['org_id']}`)
    }

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

    if (insertErr) {
      // Stripe delivers an event more than once: this payment is already in.
      if ((insertErr as { code?: string }).code === '23505') {
        console.log(`[stripe-webhook] invoice ${invoiceId} payment ${paymentRef} already recorded`)
        return
      }
      throw new Error(`insert invoice_payment: ${safeMessage(insertErr, 'database error')}`)
    }

    // Recompute totals — sets status to 'paid' when balance_due reaches 0
    const { error: rpcErr } = await db.rpc('compute_invoice_totals', { p_invoice_id: invoiceId })
    if (rpcErr) throw new Error(`compute_invoice_totals: ${safeMessage(rpcErr, 'database error')}`)

    console.log(`[stripe-webhook] invoice ${invoiceId} payment recorded: ${amountPaid} ${currency}`)
    return
  }

  // ── Subscription creation ────────────────────────────────────────────────────
  if (meta['type'] === 'subscription') {
    if (connectedAccount) {
      console.warn(`[stripe-webhook] subscription checkout from connected account ${connectedAccount} ignored`)
      return
    }
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
      const sub = await stripeClient!.subscriptions.retrieve(stripeSubscriptionId)
      stripePriceId = planItemPrice(sub)
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

    if (upsertErr) throw new Error(`upsert subscription: ${safeMessage(upsertErr, 'database error')}`)

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
  const priceId   = planItemPrice(sub)
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString()

  const { error } = await db
    .from('subscriptions')
    .update({ status, stripe_price_id: priceId, current_period_end: periodEnd })
    .eq('stripe_subscription_id', sub.id)

  if (error) throw new Error(`update subscription (${sub.id}): ${safeMessage(error, 'database update failed')}`)
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

  if (error) throw new Error(`cancel subscription (${sub.id}): ${safeMessage(error, 'database update failed')}`)
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

  if (error) throw new Error(`mark past_due (${subId}): ${safeMessage(error, 'database update failed')}`)
  console.log(`[stripe-webhook] subscription ${subId} → past_due (payment failed)`)
}

// ── account.updated (Connect) ──────────────────────────────────────────────

async function handleAccountUpdated(
  acct: Stripe.Account,
  db: ReturnType<typeof createClient>,
) {
  const { error } = await db
    .from('org_payment_accounts')
    .update({
      charges_enabled:   !!acct.charges_enabled,
      payouts_enabled:   !!acct.payouts_enabled,
      details_submitted: !!acct.details_submitted,
      updated_at:        new Date().toISOString(),
    })
    .eq('stripe_account_id', acct.id)
  if (error) throw new Error(`update payment account (${acct.id}): ${safeMessage(error, 'database update failed')}`)
}

// ── account.application.deauthorized (Connect) ─────────────────────────────

async function handleAccountDeauthorized(
  accountId: string,
  db: ReturnType<typeof createClient>,
) {
  const { error } = await db.from('org_payment_accounts').delete().eq('stripe_account_id', accountId)
  if (error) throw new Error(`remove payment account (${accountId}): ${safeMessage(error, 'database update failed')}`)
  console.log(`[stripe-webhook] connected account ${accountId} disconnected`)
}
