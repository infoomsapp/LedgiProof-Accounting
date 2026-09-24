// PATH: supabase/functions/mileage-webhook/index.ts
//
// ControlMiles → LedgiProof mileage ingestion.
//
// Auth: `Authorization: Bearer lp_mile_<key>` — a token created from
// Settings -> Connections (src/services/mileage-connections.service.ts).
// The token is hashed (SHA-256) here and matched against
// mileage_connections.token_hash; the plaintext token is never stored.
// Same shape as supabase/functions/api-v1 (a static bearer secret, not a
// Supabase user JWT), reversed in direction: this endpoint receives data
// from an external app instead of serving it.
//
// Deploy: supabase functions deploy mileage-webhook --no-verify-jwt
//
//   POST /mileage-webhook
//   { external_session_id, miles, trip_date, vehicle_label?, cgc_decision_id?, client_id? }
//
// Idempotent: a retried external_session_id for the same org is accepted
// without creating a duplicate row (mileage_entries_controlmiles_source_ref_uidx).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { safeMessage } from '../_shared/errors.ts'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface TripPayload {
  external_session_id: string
  miles:                number
  trip_date:            string
  vehicle_label?:       string
  cgc_decision_id?:     string
  client_id?:           string
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

// Mirrors src/lib/tax-tables-2026.ts businessMileageRateForDate — kept in
// sync manually since Edge Functions can't import from src/. The mid-2026
// rate change (72.5¢ -> 76¢ on Jul 1) still applies to ControlMiles-sourced
// trips, snapshotted the same way manual entries are.
function businessMileageRateForDate(isoDate: string): number {
  return isoDate >= '2026-07-01' ? 0.760 : 0.725
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'content-type': 'application/json' }
    })

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token.startsWith('lp_mile_')) {
      return j({ error: 'Invalid connection token' }, 401)
    }

    const body = await req.json() as Partial<TripPayload>
    if (!body.external_session_id || typeof body.miles !== 'number' || body.miles <= 0 || !body.trip_date) {
      return j({ error: 'external_session_id, miles (> 0), and trip_date are required' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const tokenHash = await sha256Hex(token)
    const { data: conn, error: connErr } = await admin
      .from('mileage_connections')
      .select('id, org_id, status, created_by')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (connErr || !conn || conn.status !== 'active') {
      return j({ error: 'Invalid or revoked connection token' }, 401)
    }

    const rate = businessMileageRateForDate(body.trip_date)
    const deduction = Math.round(body.miles * rate * 100) / 100
    const sourceRef = body.cgc_decision_id
      ? `session:${body.external_session_id};cgc:${body.cgc_decision_id}`
      : `session:${body.external_session_id}`

    const { data: inserted, error: insertErr } = await admin
      .from('mileage_entries')
      .insert({
        org_id:      conn.org_id,
        client_id:   body.client_id ?? null,
        miles:       body.miles,
        entry_date:  body.trip_date,
        purpose:     body.vehicle_label ? `ControlMiles — ${body.vehicle_label}` : 'ControlMiles',
        category:    'business',
        rate,
        deduction,
        created_by:  conn.created_by,
        source:      'controlmiles',
        source_ref:  sourceRef
      })
      .select('id')
      .maybeSingle()

    // Unique-violation on the idempotency index means this session was
    // already ingested — treat the retry as a success, not an error.
    if (insertErr && insertErr.code !== '23505') {
      console.error('[mileage-webhook] insert failed', insertErr)
      return j({ error: safeMessage(insertErr, 'Failed to record the trip') }, 500)
    }

    await admin
      .from('mileage_connections')
      .update({ last_received_at: new Date().toISOString() })
      .eq('id', conn.id)

    return j({ ok: true, entry_id: inserted?.id ?? null, duplicate: !inserted }, inserted ? 201 : 200)
  } catch (err: unknown) {
    console.error('[mileage-webhook]', err)
    return j({ error: safeMessage(err, 'Failed to process the trip') }, 500)
  }
})
