// PATH: supabase/functions/api-v1/index.ts
//
// Read-only public API — Accountant/Enterprise plan feature.
//
// Auth: `Authorization: Bearer lp_live_<key>` — a key created from
// Settings -> API access (src/services/api-keys.service.ts). The key is
// hashed (SHA-256) here and matched against api_keys.key_hash; the plaintext
// key is never stored. A revoked or unknown key is rejected the same way
// (404-shaped, not a 401 that would let a caller fingerprint valid prefixes).
//
// Scope, on purpose: GET-only, and only the three resources a firm's own
// external tooling (a script, a BI dashboard) would plausibly want to read.
// No write endpoints yet — this is the first version of the API, not the
// full one.
//
//   GET /api-v1/transactions?limit=&client_id=
//   GET /api-v1/invoices?limit=&client_id=
//   GET /api-v1/vendors?limit=&client_id=
//
// Deploy: supabase functions deploy api-v1 --no-verify-jwt
// (--no-verify-jwt because auth here is the API key, not a Supabase user JWT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { safeMessage } from '../_shared/errors.ts'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

const RESOURCE_COLUMNS: Record<string, string> = {
  transactions: 'id, client_id, description, merchant_name, amount, transaction_date, semaphore, created_at',
  invoices:     'id, client_id, invoice_number, status, total, due_date, issue_date, created_at',
  vendors:      'id, client_id, legal_name, dba_name, email, is_active, created_at',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'content-type': 'application/json' }
    })

  if (req.method !== 'GET') return j({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!apiKey.startsWith('lp_live_')) {
      return j({ error: 'Invalid API key' }, 401)
    }

    const url = new URL(req.url)
    const resource = url.pathname.split('/').filter(Boolean).pop() ?? ''
    const columns = RESOURCE_COLUMNS[resource]
    if (!columns) {
      return j({ error: `Unknown resource. Supported: ${Object.keys(RESOURCE_COLUMNS).join(', ')}` }, 404)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const keyHash = await sha256Hex(apiKey)
    const { data: keyRow, error: keyErr } = await admin
      .from('api_keys')
      .select('id, org_id, revoked_at')
      .eq('key_hash', keyHash)
      .maybeSingle()

    if (keyErr) {
      console.error('[api-v1]', keyErr)
      return j({ error: safeMessage(keyErr, 'Failed to verify the API key') }, 500)
    }
    if (!keyRow || keyRow.revoked_at) {
      return j({ error: 'Invalid API key' }, 401)
    }

    // Fire-and-forget usage stamp -- never block or fail the actual request on this.
    admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)
      .then(({ error }) => { if (error) console.error('[api-v1] last_used_at', error) })

    const limitParam = Number(url.searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT
    const clientId = url.searchParams.get('client_id')

    let query = admin
      .from(resource)
      .select(columns)
      .eq('org_id', keyRow.org_id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (clientId) query = query.eq('client_id', clientId)

    const { data, error } = await query
    if (error) {
      console.error('[api-v1]', error)
      return j({ error: safeMessage(error, `Failed to load ${resource}`) }, 500)
    }

    return j({ data, limit, resource })
  } catch (err) {
    console.error('[api-v1]', err)
    return j({ error: safeMessage(err, 'Something went wrong') }, 500)
  }
})
