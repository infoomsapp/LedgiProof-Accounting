// PATH: supabase/functions/plaid-exchange/index.ts
// Step 2 of 3.
// Called after Plaid Link succeeds with a public_token.
// Exchanges it for a permanent access_token and stores it in bank_connections.
// The PLAID_SECRET never touches the client — it lives only here.
//
// Deploy: supabase functions deploy plaid-exchange

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'
import { encryptToken } from '../_shared/plaid-crypto.ts'

const PLAID_BASE: Record<string, string> = {
  sandbox:     'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production:  'https://production.plaid.com'
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })
    }

    // ── Request body ──────────────────────────────────────────────────────
    const { public_token, org_id, metadata } = await req.json() as {
      public_token: string
      org_id:       string
      metadata:     {
        institution: { institution_id: string; name: string }
        accounts:    Array<{
          id: string; name: string; mask: string;
          type: string; subtype: string
        }>
      }
    }

    if (!public_token || !org_id) {
      return Response.json({ error: 'public_token and org_id required' }, { status: 400, headers: cors })
    }

    // ── Verify user belongs to this org ───────────────────────────────────
    const { data: membership } = await supabaseUser
      .from('organization_memberships')
      .select('id, role')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .eq('is_active', true)
      .single()

    if (!membership) {
      return Response.json({ error: 'Not a member of this organization' }, { status: 403, headers: cors })
    }

    // ── Exchange public_token → access_token with Plaid ───────────────────
    const plaidEnv = Deno.env.get('PLAID_ENV') ?? 'sandbox'
    const baseUrl  = PLAID_BASE[plaidEnv]

    const exchangeRes = await fetch(`${baseUrl}/item/public_token/exchange`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:    Deno.env.get('PLAID_CLIENT_ID')!,
        secret:       Deno.env.get('PLAID_SECRET')!,
        public_token
      })
    })

    const exchangeData = await exchangeRes.json()

    if (!exchangeRes.ok || exchangeData.error_code) {
      console.error('[plaid-exchange] Exchange failed:', exchangeData)
      return Response.json(
        { error: exchangeData.error_message ?? 'Token exchange failed' },
        { status: 400, headers: cors }
      )
    }

    const { access_token, item_id } = exchangeData

    // ── Store one row per account ─────────────────────────────────────────
    // Plaid can return multiple accounts per institution (checking + savings etc.)
    // access_token is encrypted at rest (AES-GCM, key never touches Postgres) —
    // a DB compromise alone shouldn't be enough to reuse it against Plaid.
    const encryptedAccessToken = await encryptToken(access_token)
    const inserts = metadata.accounts.map(account => ({
      org_id,
      provider:           'plaid',
      plaid_item_id:      item_id,
      plaid_access_token: encryptedAccessToken,   // same token for all accounts in same item
      institution_id:     metadata.institution.institution_id,
      institution_name:   metadata.institution.name,
      account_id:         account.id,
      account_name:       account.name,
      account_type:       account.type,
      account_subtype:    account.subtype,
      mask:               account.mask,
      is_active:          true,
      sync_status:        'ok',
      connected_by:       user.id
    }))

    const { data: connections, error: insertErr } = await supabaseAdmin
      .from('bank_connections')
      .upsert(inserts, { onConflict: 'org_id,plaid_item_id,account_id' })
      .select('id, institution_name, account_name, mask, account_type')

    if (insertErr) {
      console.error('[plaid-exchange] DB insert failed:', insertErr)
      return Response.json({ error: safeMessage(insertErr, 'Failed to save the bank connection') }, { status: 500, headers: cors })
    }

    return Response.json({
      success:     true,
      connections: connections ?? [],
      institution: metadata.institution.name,
      accounts:    metadata.accounts.length
    }, { headers: cors })

  } catch (err) {
    console.error('[plaid-exchange] Unexpected error:', err)
    return Response.json({ error: safeMessage(err, 'Failed to connect the bank account') }, { status: 500, headers: cors })
  }
})