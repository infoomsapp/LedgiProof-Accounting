// PATH: supabase/functions/stripe-connect/index.ts
//
// Connects a workspace's OWN Stripe account so "Pay now" on its invoices
// pays the business directly (Stripe Connect, Standard accounts, direct
// charges -- the business is the merchant of record; LedgiProof never holds
// the money).
//
//   POST { action: 'onboard', org_id, return_url }
//     -> { url }   Stripe-hosted onboarding (creates the account the first time)
//   POST { action: 'status', org_id }
//     -> { connected, charges_enabled, payouts_enabled, details_submitted }
//
// Owner or admin of the workspace only. The account row is written with the
// service role (org_payment_accounts has no client write policy); the
// stripe-webhook keeps its flags current afterwards (account.updated).
//
// Required secrets: STRIPE_SECRET_KEY (the platform key, with Connect enabled).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe           from 'npm:stripe@17'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'
import { isAllowedReturnUrl } from '../_shared/return-url.ts'

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY')          ?? ''
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')              ?? ''
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')         ?? ''
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Null until STRIPE_SECRET_KEY is set: the Stripe SDK throws at construction
// without a key, which would crash the function on boot for every request.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripeClient = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: '2025-06-30' as any }) : null

type Body =
  | { action: 'onboard'; org_id: string; return_url: string }
  | { action: 'status';  org_id: string }

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

  try {
    if (!stripeClient) return respond({ error: 'Online payments are not configured yet.' }, 503)
    const stripe = stripeClient

    const auth = req.headers.get('Authorization')
    if (!auth) return respond({ error: 'Unauthorized' }, 401)
    const userDb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await userDb.auth.getUser()
    if (!user) return respond({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => null) as Body | null
    if (!body?.org_id) return respond({ error: 'org_id is required' }, 400)

    const { data: allowed } = await userDb.rpc('has_org_role', {
      p_org_id: body.org_id,
      p_roles:  ['owner', 'admin'],
    })
    if (allowed !== true) return respond({ error: 'Only the workspace owner or an admin can set up online payments.' }, 403)

    const admin = createClient(SUPABASE_URL, SVC_KEY)
    const { data: existing } = await admin
      .from('org_payment_accounts')
      .select('stripe_account_id')
      .eq('org_id', body.org_id)
      .maybeSingle()

    if (body.action === 'status') {
      if (!existing) return respond({ connected: false, charges_enabled: false, payouts_enabled: false, details_submitted: false })
      const acct = await stripe.accounts.retrieve(existing.stripe_account_id as string)
      const flags = {
        charges_enabled:   !!acct.charges_enabled,
        payouts_enabled:   !!acct.payouts_enabled,
        details_submitted: !!acct.details_submitted,
      }
      await admin.from('org_payment_accounts')
        .update({ ...flags, updated_at: new Date().toISOString() })
        .eq('org_id', body.org_id)
      return respond({ connected: true, ...flags })
    }

    if (body.action === 'onboard') {
      if (!isAllowedReturnUrl(body.return_url)) return respond({ error: 'Invalid return URL' }, 400)

      let accountId = existing?.stripe_account_id as string | undefined
      if (!accountId) {
        const { data: org } = await admin.from('organizations').select('name').eq('id', body.org_id).maybeSingle()
        const acct = await stripe.accounts.create({
          type:     'standard',
          email:    user.email ?? undefined,
          business_profile: { name: (org?.name as string | undefined) ?? undefined },
          metadata: { org_id: body.org_id },
        })
        accountId = acct.id
        const { error: insErr } = await admin.from('org_payment_accounts').insert({
          org_id:            body.org_id,
          stripe_account_id: accountId,
          created_by:        user.id,
        })
        if (insErr) throw insErr
      }

      const sep  = body.return_url.includes('?') ? '&' : '?'
      const link = await stripe.accountLinks.create({
        account:     accountId,
        type:        'account_onboarding',
        refresh_url: `${body.return_url}${sep}stripe=refresh`,
        return_url:  `${body.return_url}${sep}stripe=return`,
      })
      return respond({ url: link.url })
    }

    return respond({ error: 'Unknown action' }, 400)
  } catch (err: unknown) {
    console.error('[stripe-connect]', err)
    return respond({ error: safeMessage(err, 'Could not reach Stripe. Please try again.') }, 500)
  }
})
