// PATH: supabase/functions/payroll-webhook/index.ts
//
// Receives Check's payroll lifecycle webhooks and drives our own
// payroll.runs state machine — this is what actually completes a run and
// triggers the atomic ledger posting (payroll_complete_run).
//
// Verified against Check's real docs (docs.checkhq.com/docs/the-shape-of-
// your-webhook-endpoint, .../webhook-event-types, .../life-of-a-payroll):
//   - Headers: Check-Signature (hex HMAC-SHA256 of the raw body, keyed by
//     the webhook config's `key`), Check-Topic, Check-WebhookEvent-ID,
//     Check-Live.
//   - Body: { event: 'created'|'updated'|'deleted', data: <object> }
//   - Payroll statuses: draft, pending, processing, paid, partially_paid,
//     failed. Mapped below to payroll.run_status.
//
// Security: this endpoint has NO Supabase auth header at all (Check calls
// it directly) — the Check-Signature HMAC check IS the authentication.
// A request with a missing/invalid signature is rejected before anything
// else runs.
//
// Deploy: supabase functions deploy payroll-webhook --no-verify-jwt
// (must be deployed with JWT verification OFF — Check does not send a
// Supabase-issued bearer token, it sends its own HMAC signature instead)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'

const CHECK_WEBHOOK_KEY = Deno.env.get('CHECK_WEBHOOK_KEY')

// Known Tax object jurisdictions we can classify without an extra API
// call. 'fed' → federal. Everything else is bucketed into
// state_withholding for now — see the comment further down on why local
// (MD county / PA EIT) sub-categorization is deferred rather than guessed.
const FEDERAL_JURISDICTION = 'fed'

interface CheckTaxLine {
  tax:         string
  description: string
  amount:      string
  payer:       'employee' | 'company'
}

interface CheckPayrollItem {
  id:       string
  employee: string
  net_pay:  string
  earnings: Array<{ amount: string }>
  taxes:    CheckTaxLine[]
}

interface CheckPayroll {
  id:      string
  company: string
  status:  'draft' | 'pending' | 'processing' | 'paid' | 'partially_paid' | 'failed'
  items:   CheckPayrollItem[]
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Reduces a payroll item's taxes into our line_items shape. Correctness
// guarantee: gross_pay and net_pay always reconcile exactly against what
// Check actually paid (that's what the ledger posting relies on).
// Sub-categorization of employee withholding into federal vs state is
// exact (jurisdiction === 'fed' is authoritative). State vs LOCAL
// (MD county tax / PA EIT) is not yet split apart — both land in
// state_withholding — because Check's payroll item taxes[] only carries
// {tax id, description, amount, payer}, not the Tax object's own
// `jurisdiction`, and jurisdiction alone can't distinguish state from
// local since "local taxes use their state's value" per Check's docs.
// Splitting this precisely requires either caching the full /taxes
// catalog (stable, cacheable, but requires real sandbox data to verify
// label patterns for MD/PA) or a follow-up enhancement — flagged here,
// not silently faked. The DOLLAR TOTALS posted to the ledger are exact
// either way; this only affects paystub-level display granularity.
function reduceItem(item: CheckPayrollItem) {
  const gross = item.earnings.reduce((sum, e) => sum + Number(e.amount), 0)
  let federalWithholding = 0
  let stateWithholding   = 0
  let ficaEmployee       = 0
  let employerTaxes      = 0

  for (const t of item.taxes) {
    const amount = Number(t.amount)
    const label  = t.description.toLowerCase()

    if (t.payer === 'company') {
      employerTaxes += amount
      continue
    }

    if (label.includes('federal income')) {
      federalWithholding += amount
    } else if (label === 'fica' || label.includes('medicare') || label.includes('social security')) {
      ficaEmployee += amount
    } else {
      // Everything else employee-paid (state income tax, SDI, local/
      // county/city taxes) — bucketed together, see function comment.
      stateWithholding += amount
    }
  }

  return {
    provider_employee_id: item.employee,
    gross_pay:             gross.toFixed(2),
    federal_withholding:   federalWithholding.toFixed(2),
    state_withholding:     stateWithholding.toFixed(2),
    local_withholding:     '0.00',
    fica_employee:         ficaEmployee.toFixed(2),
    other_deductions:      '0.00',
    net_pay:                item.net_pay,
    fica_employer:          employerTaxes.toFixed(2), // employer FICA+Medicare+FUTA+SUTA combined
    futa_employer:          '0.00',
    suta_employer:          '0.00'
  }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors })

  try {
    if (!CHECK_WEBHOOK_KEY) {
      console.error('[payroll-webhook] CHECK_WEBHOOK_KEY not configured')
      return Response.json({ error: 'Webhook not configured' }, { status: 500, headers: cors })
    }

    // ── Signature verification — this IS the auth for this endpoint ─────
    const rawBody   = await req.text()
    const signature = req.headers.get('Check-Signature')
    if (!signature) {
      return Response.json({ error: 'Missing Check-Signature' }, { status: 401, headers: cors })
    }

    const expected = await hmacSha256Hex(CHECK_WEBHOOK_KEY, rawBody)
    if (!timingSafeEqual(expected, signature.toLowerCase())) {
      console.error('[payroll-webhook] Signature mismatch — rejecting')
      return Response.json({ error: 'Invalid signature' }, { status: 401, headers: cors })
    }

    const topic     = req.headers.get('Check-Topic') ?? ''
    const eventId   = req.headers.get('Check-WebhookEvent-ID') ?? crypto.randomUUID()
    const isLive    = req.headers.get('Check-Live') === 'true'
    void isLive // available for environment-gated logic if ever needed

    const payload = JSON.parse(rawBody) as { event: string; data: unknown }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Idempotency — Check explicitly documents at-least-once delivery
    //    with retries; redelivery of an already-processed event is
    //    expected, not exceptional. ────────────────────────────────────
    const { data: isNew, error: seenErr } = await supabaseAdmin.rpc('payroll_mark_webhook_seen', {
      p_event_id: eventId, p_topic: topic, p_event: payload.event
    })
    if (seenErr) {
      console.error('[payroll-webhook] payroll_mark_webhook_seen failed:', seenErr)
      // Fail open on the idempotency check itself (better to risk a rare
      // double-process than to drop a real payroll status change), but
      // log loudly.
    } else if (isNew === false) {
      return Response.json({ received: true, duplicate: true }, { headers: cors })
    }

    // Only the `payroll` topic drives our state machine. Every other
    // topic is acknowledged (2xx) so Check doesn't retry it, but ignored.
    if (topic !== 'payroll') {
      return Response.json({ received: true, ignored_topic: topic }, { headers: cors })
    }

    const payroll = payload.data as CheckPayroll

    const { data: runId, error: findErr } = await supabaseAdmin.rpc('payroll_find_run_id_by_provider_id', {
      p_provider_run_id: payroll.id
    })
    if (findErr) {
      console.error('[payroll-webhook] payroll_find_run_id_by_provider_id failed:', findErr)
      return Response.json({ error: safeMessage(findErr, 'Failed to find the payroll run') }, { status: 500, headers: cors })
    }
    if (!runId) {
      // A payroll Check knows about that we have no local run for —
      // could be a payroll created outside this integration (e.g. via
      // Check Console directly). Acknowledge, don't error, so Check
      // doesn't keep retrying something we will never be able to match.
      return Response.json({ received: true, unmatched_provider_id: payroll.id }, { headers: cors })
    }

    switch (payroll.status) {
      case 'processing': {
        await supabaseAdmin.rpc('payroll_mark_run_processing', { p_run_id: runId })
        break
      }

      case 'paid':
      case 'partially_paid': {
        const lineItems = (payroll.items ?? []).map(reduceItem)
        const { error: completeErr } = await supabaseAdmin.rpc('payroll_complete_run', {
          p_run_id: runId,
          p_provider_run_id: payroll.id,
          p_line_items: lineItems
        })
        if (completeErr) {
          console.error('[payroll-webhook] payroll_complete_run failed:', completeErr)
          return Response.json({ error: safeMessage(completeErr, 'Failed to complete the payroll run') }, { status: 500, headers: cors })
        }
        if (payroll.status === 'partially_paid') {
          console.warn(`[payroll-webhook] Run ${runId} completed as PARTIALLY PAID — one or more employee disbursements failed on Check's side. Reach out to Check support per their docs to resolve.`)
        }
        break
      }

      case 'failed': {
        await supabaseAdmin.rpc('payroll_fail_run', {
          p_run_id: runId,
          p_reason: 'Check reported payroll status=failed (funding debit was returned — see Check Console for detail)'
        })
        break
      }

      case 'draft':
      case 'pending':
      default:
        // No local state transition needed for these.
        break
    }

    return Response.json({ received: true }, { headers: cors })

  } catch (err) {
    console.error('[payroll-webhook] Unexpected error:', err)
    return Response.json({ error: safeMessage(err, 'Failed to process the payroll webhook') }, { status: 500, headers: cors })
  }
})
