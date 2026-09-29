// PATH: supabase/functions/sync-company-addon/index.ts
//
// Option B billing: every company past the ones a plan includes is an "extra
// company", billed at a share of the plan inside the SAME subscription. This
// brings the subscription's extra-company item in line with the companies that
// exist -- the quantity is never stored, it is counted
// (workspace_allowance_for_user → extra_in_use), so billing can't drift.
//
//   · No paid subscription yet (trial / no Stripe subscription): nothing to
//     update now; create-checkout-session adds the extras when they subscribe.
//   · Billing not connected (no Stripe key or no extra-company price for the
//     plan): { synced: false, reason } -- the screen says so.
//
// Required secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_ID_EXTRA_COMPANY_STARTER       (recurring, 50% of Starter)
//   STRIPE_PRICE_ID_EXTRA_COMPANY_ENTREPRENEUR  (recurring, 50% of Entrepreneur)
//
// Call: POST with the user's JWT, empty body. Returns { synced, quantity?, reason? }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe           from 'npm:stripe@17'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY')          ?? ''
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')              ?? ''
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: '2025-06-30' as any }) : null

export const EXTRA_COMPANY_PRICE_IDS: Record<string, string | undefined> = {
  starter:      Deno.env.get('STRIPE_PRICE_ID_EXTRA_COMPANY_STARTER'),
  entrepreneur: Deno.env.get('STRIPE_PRICE_ID_EXTRA_COMPANY_ENTREPRENEUR'),
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const db  = createClient(SUPABASE_URL, SVC_KEY)
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user }, error: authErr } = await db.auth.getUser(jwt)
    if (authErr || !user) return reply({ error: 'Unauthorized' }, 401)

    const { data: allowance, error: aErr } = await db.rpc('workspace_allowance_for_user', { p_user: user.id })
    if (aErr || !allowance) return reply({ synced: false, reason: safeMessage(aErr, 'Could not count your companies') }, 500)
    const plan     = String((allowance as any).plan)
    const quantity = Number((allowance as any).extra_in_use ?? 0)

    // Exempt / no plan: nothing is billed.
    if (['exempt', 'none', 'expired'].includes(plan)) return reply({ synced: true, quantity: 0 })

    const { data: sub } = await db
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', user.id)
      .not('stripe_subscription_id', 'is', null)
      .in('status', ['active', 'past_due', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Still on the trial without a paid subscription: the checkout adds them.
    if (!sub?.stripe_subscription_id) return reply({ synced: true, quantity, pending_checkout: true })

    const priceId = EXTRA_COMPANY_PRICE_IDS[plan]
    if (!stripe || !priceId) {
      return reply({ synced: false, quantity, reason: 'billing is not connected yet' })
    }

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id as string)
    const item = stripeSub.items.data.find(i => i.price?.id === priceId)

    if (item && quantity === 0) {
      await stripe.subscriptionItems.del(item.id, { proration_behavior: 'create_prorations' })
    } else if (item) {
      if (item.quantity !== quantity) {
        await stripe.subscriptionItems.update(item.id, { quantity, proration_behavior: 'create_prorations' })
      }
    } else if (quantity > 0) {
      await stripe.subscriptionItems.create({
        subscription: stripeSub.id, price: priceId, quantity, proration_behavior: 'create_prorations'
      })
    }

    return reply({ synced: true, quantity })
  } catch (err) {
    console.error('[sync-company-addon]', err)
    return reply({ synced: false, reason: safeMessage(err, 'Could not update the subscription') }, 500)
  }
})
