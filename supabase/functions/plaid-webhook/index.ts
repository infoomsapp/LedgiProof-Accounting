// PATH: supabase/functions/plaid-webhook/index.ts
//
// Receives Plaid's webhooks so bank transactions show up on their own instead
// of only when someone presses Sync on the web.
//
//   TRANSACTIONS / SYNC_UPDATES_AVAILABLE  -> run plaid-sync for that bank
//   ITEM / ERROR (login required), PENDING_EXPIRATION
//                                          -> mark the connection consent_expired
//                                             so the app can ask for a reconnect
//
// This URL is public (Plaid cannot send a Supabase JWT), so verify_jwt is OFF
// and the request is authenticated instead by Plaid's own signature: see
// _shared/plaid-webhook-verify.ts. Anything that does not verify is refused
// with a 401 and does nothing.
//
// Plaid retries a webhook that does not get a 2xx within 10 seconds, and a sync
// can take longer, so the sync runs in the background (EdgeRuntime.waitUntil)
// and the response goes out immediately.
//
// Deploy with verify_jwt = false. The URL to register is passed to Plaid by
// plaid-create-link-token (`webhook`), so every NEW bank connection uses it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { readKeyId, verifyPlaidWebhook } from '../_shared/plaid-webhook-verify.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PLAID_ENV    = Deno.env.get('PLAID_ENV') ?? 'sandbox'
const PLAID_HOST   = PLAID_ENV === 'production'
  ? 'https://production.plaid.com'
  : PLAID_ENV === 'development'
    ? 'https://development.plaid.com'
    : 'https://sandbox.plaid.com'

const SYNC_CODES = new Set([
  'SYNC_UPDATES_AVAILABLE',
  // Older webhook codes, still sent for some items.
  'INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE',
])

// Plaid's verification keys rotate rarely; keep the ones we have already seen.
const keyCache = new Map<string, JsonWebKey>()

async function getVerificationKey(kid: string): Promise<JsonWebKey | null> {
  const cached = keyCache.get(kid)
  if (cached) return cached

  const res = await fetch(`${PLAID_HOST}/webhook_verification_key/get`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('PLAID_CLIENT_ID'),
      secret:    Deno.env.get('PLAID_SECRET'),
      key_id:    kid,
    }),
  })
  if (!res.ok) return null
  const data = await res.json() as { key?: JsonWebKey & { expired_at?: number | null } }
  const key = data.key
  // A key with an expiry has been rotated out: tokens signed with it are stale.
  if (!key || (key.expired_at !== null && key.expired_at !== undefined)) return null
  keyCache.set(kid, key)
  return key
}

async function runSync(admin: ReturnType<typeof createClient>, itemId: string) {
  const { data: conns } = await admin
    .from('bank_connections')
    .select('id, org_id')
    .eq('plaid_item_id', itemId)
    .eq('is_active', true)
    .eq('provider', 'plaid')
  if (!conns?.length) return // an item we no longer track: nothing to do

  // plaid-sync already handles every account of one item together, so one call
  // per organization is enough.
  const seen = new Set<string>()
  for (const c of conns as { id: string; org_id: string }[]) {
    if (seen.has(c.org_id)) continue
    seen.add(c.org_id)
    const res = await fetch(`${SUPABASE_URL}/functions/v1/plaid-sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The service-role key marks this as an internal call (see plaid-sync).
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ org_id: c.org_id, connection_id: c.id }),
    })
    if (!res.ok) console.error('[plaid-webhook] plaid-sync returned', res.status)
  }
}

async function markConsentExpired(admin: ReturnType<typeof createClient>, itemId: string, message: string) {
  await admin
    .from('bank_connections')
    .update({ sync_status: 'consent_expired', sync_error: message })
    .eq('plaid_item_id', itemId)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const rawBody = await req.text()
    const jwt = req.headers.get('plaid-verification')
    if (!jwt) return new Response('Unauthorized', { status: 401 })

    const kid = readKeyId(jwt)
    if (!kid) return new Response('Unauthorized', { status: 401 })

    const jwk = await getVerificationKey(kid)
    if (!jwk) return new Response('Unauthorized', { status: 401 })

    const verdict = await verifyPlaidWebhook(jwt, rawBody, jwk)
    if (!verdict.ok) {
      console.warn('[plaid-webhook] rejected:', verdict.reason)
      return new Response('Unauthorized', { status: 401 })
    }

    const payload = JSON.parse(rawBody) as {
      webhook_type?: string
      webhook_code?: string
      item_id?: string
      error?: { error_code?: string; error_message?: string } | null
    }
    const itemId = payload.item_id
    if (!itemId) return Response.json({ ok: true })

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    if (payload.webhook_type === 'TRANSACTIONS' && SYNC_CODES.has(payload.webhook_code ?? '')) {
      // Answer Plaid now; the sync finishes in the background. The promise
      // starts here either way; waitUntil only keeps the runtime alive for it.
      const job = runSync(admin, itemId).catch(e => console.error('[plaid-webhook] sync failed', e))
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime
      if (runtime?.waitUntil) runtime.waitUntil(job)
    } else if (
      payload.webhook_type === 'ITEM' &&
      (payload.webhook_code === 'PENDING_EXPIRATION' ||
       (payload.webhook_code === 'ERROR' && payload.error?.error_code === 'ITEM_LOGIN_REQUIRED'))
    ) {
      await markConsentExpired(
        admin, itemId,
        payload.error?.error_message ?? 'The bank asked for you to sign in again.'
      )
    }
    // Every other webhook type is acknowledged and ignored.

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[plaid-webhook] unexpected error', err)
    // 500 makes Plaid retry, which is what we want for a transient failure.
    return new Response('Error', { status: 500 })
  }
})
