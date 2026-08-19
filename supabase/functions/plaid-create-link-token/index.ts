// PATH: supabase/functions/plaid-create-link-token/index.ts
//
// Creates a Plaid link_token for a user.
// 🔒 SERVER-SIDE QUOTA: refuses to create a token if the org is at
//    the plaid_connections hard cap and pay-as-you-go is OFF.
//
// This prevents a malicious client from creating tokens (which Plaid
// charges for) when the user has no quota left.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders }  from '../_shared/cors.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!
const PLAID_SECRET    = Deno.env.get('PLAID_SECRET')!
const PLAID_ENV       = Deno.env.get('PLAID_ENV') ?? 'sandbox'  // sandbox | development | production

const PLAID_HOST = PLAID_ENV === 'production'
  ? 'https://production.plaid.com'
  : PLAID_ENV === 'development'
    ? 'https://development.plaid.com'
    : 'https://sandbox.plaid.com'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  const j = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' }
    })

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    // 1. Auth
    const auth = req.headers.get('Authorization')
    if (!auth) return j({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: auth } }
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return j({ error: 'Unauthorized' }, 401)

    // 2. Determine org_id; if caller supplied one, verify membership (M2)
    let orgId: string | null = null
    let bodyOrgId: string | null = null
    try {
      const body = await req.json().catch(() => ({}))
      bodyOrgId = body?.org_id ?? null
    } catch {
      // body is optional
    }

    if (bodyOrgId) {
      const { data: mem } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('org_id', bodyOrgId)
        .eq('is_active', true)
        .maybeSingle()
      orgId = mem?.org_id ?? null
      if (!orgId) return j({ error: 'Not a member of this organization' }, 403)
    } else {
      const { data: mem } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at')
        .limit(1)
        .maybeSingle()
      orgId = mem?.org_id ?? null
    }

    if (!orgId) {
      return j({ error: 'No active organization found for user' }, 400)
    }

    // 3. 🔒 SERVER-SIDE QUOTA CHECK
    const quotaRes = await supabase.rpc('check_quota', {
      p_org_id: orgId,
      p_metric: 'plaid_connections',
      p_amount: 1
    })

    if (quotaRes.error) {
      return j({ error: `Quota check failed: ${quotaRes.error.message}` }, 500)
    }

    const quota = quotaRes.data as {
      allowed: boolean
      reason: string
      plan: string
      current_value: number
      limit_value: number
      message?: string
    }

    if (!quota.allowed) {
      return j({
        error:    quota.message ?? 'Bank connection limit reached',
        reason:   quota.reason,
        plan:     quota.plan,
        current:  quota.current_value,
        limit:    quota.limit_value,
        code:     'QUOTA_EXCEEDED'
      }, 429)
    }

    // 4. Create Plaid link_token
    const plaidRes = await fetch(`${PLAID_HOST}/link/token/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id:   PLAID_CLIENT_ID,
        secret:      PLAID_SECRET,
        client_name: 'LedgiProof',
        user:        { client_user_id: user.id },
        products:    ['transactions'],
        country_codes: ['US'],
        language:    'en'
      })
    })

    if (!plaidRes.ok) {
      const errText = await plaidRes.text()
      return j({ error: `Plaid error: ${plaidRes.status}`, detail: errText }, 502)
    }

    const data = await plaidRes.json()
    // Usage increment handled by DB trigger trg_bank_connections_usage_increment.
    return j({ link_token: data.link_token, expiration: data.expiration }, 200)

  } catch (err: any) {
    console.error('[plaid-create-link-token]', err)
    return j({ error: err?.message ?? 'Unknown error' }, 500)
  }
})

