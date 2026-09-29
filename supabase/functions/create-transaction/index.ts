// PATH: supabase/functions/create-transaction/index.ts
//
// Server-side port of the exact pipeline src/services/transactions.service.ts's
// createTransaction() runs client-side today -- built so the LedgiProof mobile
// app (and any future non-browser caller) gets the SAME hash-chain and the
// SAME audit trail as the web app, instead of a second, divergent
// implementation of financial-integrity logic in Dart.
//
//   1. buildRawHash        -> raw_hash  (pre-human fingerprint)
//   2. db.insert           -> transaction row; the database's risk Brain
//                             (trg_00_evaluate_risk) sets risk_status and
//                             writes rule_evaluations, for every caller
//   3. autoAssignLearnedVendor (best-effort, non-blocking)
//   4. CGC Core governance  (best-effort, non-blocking -- see note below)
//   5. Audit.append        -> audit_events chain entry
//
// Deliberate scope cut, disclosed rather than faked: step 4 calls the same
// remote CGC Core endpoint cgc-evaluate proxies to, but does NOT replicate
// src/services/cgc.service.ts's embedded-fallback simulation (PoD triplet,
// EU AI Act scoring, weighting matrices) when the remote is unavailable --
// that fallback is itself ~250 lines of simulated governance math. A
// mobile-created transaction with CGC_ENDPOINT unreachable simply has no
// cgc_validations row yet, same as it would if this whole step were skipped;
// nothing about hash-chain or Brain integrity depends on it.
//
// Deploy: supabase functions deploy create-transaction

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'

const CGC_ENDPOINT   = Deno.env.get('CGC_ENDPOINT') ?? ''
const CGC_API_KEY    = Deno.env.get('CGC_API_KEY')  ?? ''
const CGC_TIMEOUT_MS = 8000

interface RequestBody {
  org_id:            string
  source:            string
  amount:            number
  currency?:         string
  reference?:        string | null
  description?:      string | null
  transaction_date:  string
  metadata?:         Record<string, unknown>
  client_id?:        string | null
  payment_method?:   string
}

// ── Hashing (mirrors src/lib/hash.ts) ───────────────────────────────────────

async function sha256Text(input: string): Promise<string> {
  const data = new TextEncoder().encode(input ?? '')
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

function buildRawHash(p: { orgId: string; amount: number; currency: string; reference: string | null; transactionDate: string; source: string }) {
  return sha256Text(JSON.stringify(p))
}

function buildAuditHash(p: { previousHash: string | null; transactionId: string; transactionVersion: number; eventType: string; timestamp: string; actorId: string }) {
  return sha256Text(JSON.stringify(p))
}

// ── Vendor auto-learning (mirrors learning.service.ts + vendor.service.ts) ──

function normalizeMerchant(name: string): string {
  return name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
}
function extractKeywords(description: string): string[] {
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'])
  return description.toLowerCase().split(/[\s\-_,./]+/).filter(w => w.length > 2 && !stop.has(w)).slice(0, 3)
}

async function autoAssignLearnedVendor(db: any, tx: { id: string; org_id: string; description: string | null; merchant_name: string | null }) {
  const src = tx.merchant_name ?? tx.description
  if (!src) return
  try {
    const keyword = normalizeMerchant(src)
    const keywords = extractKeywords(src)
    const queries = [...keywords.map(k => `keyword.ilike.%${k}%`), `merchant_name.ilike.%${keyword.slice(0, 30)}%`]
    const { data: patterns } = await db.from('user_patterns').select('*')
      .eq('org_id', tx.org_id).or(queries.join(',')).order('match_count', { ascending: false }).limit(1)
    const vendorId = patterns?.[0]?.vendor_id
    if (!vendorId) return
    await db.from('transactions').update({ vendor_id: vendorId }).eq('id', tx.id)
  } catch {
    // best-effort — vendor auto-assignment must never break transaction creation
  }
}

// ── CGC Core (best-effort remote call; see file header for the disclosed
//    embedded-fallback scope cut) ────────────────────────────────────────────

function detectAreaHint(source: string, description: string | null): string {
  const text = (description ?? '').toLowerCase()
  if (source === 'bank_api') return 'BANKING'
  if (text.includes('transfer') || text.includes('wire') || text.includes('ach')) return 'BANKING'
  if (text.includes('invest') || text.includes('dividend') || text.includes('securities')) return 'FINANCE'
  if (text.includes('audit') || text.includes('reconcil')) return 'AUDIT'
  return 'FINANCE'
}

async function cgcEvaluateBestEffort(input: {
  transactionId: string; orgId: string; amount: number; currency: string; description: string | null
  reference: string | null; date: string; source: string; semaphore: string; confidence: number | null
  userEmail: string
}) {
  if (!CGC_ENDPOINT || !CGC_API_KEY) return
  try {
    const area = detectAreaHint(input.source, input.description)
    const form = new URLSearchParams()
    form.set('org_id', input.orgId)
    form.set('action', 'classify_transaction')
    form.set('input_data', JSON.stringify({
      transaction_id: input.transactionId, amount: input.amount, currency: input.currency,
      date: input.date, source: input.source, current_semaphore: input.semaphore,
      ...(input.description != null ? { description: input.description } : {}),
      ...(input.reference != null ? { reference: input.reference } : {}),
      ...(input.confidence != null ? { brain_confidence: input.confidence } : {}),
    }))
    form.set('user_email', input.userEmail)
    form.set('data_domains', JSON.stringify([]))
    form.set('app_source', 'ledgiproof')
    form.set('area', area)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), CGC_TIMEOUT_MS)
    const res = await fetch(`${CGC_ENDPOINT}/governance/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Bearer ${CGC_API_KEY}` },
      body: form.toString(), signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return
    // Intentionally not persisted to cgc_validations here -- see file header.
  } catch {
    // best-effort — CGC must never block transaction creation
  }
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return respond({ error: 'Missing Authorization header' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return respond({ error: 'Unauthorized' }, 401)

    const body = await req.json() as Partial<RequestBody>
    if (!body.org_id || !body.source || typeof body.amount !== 'number' || !body.transaction_date) {
      return respond({ error: 'org_id, source, amount, and transaction_date are required' }, 400)
    }

    const clientId = body.client_id ?? null

    // The one shared authorization check every write path uses now (org
    // member OR the matching client_portal_users membership, owner/contact
    // only) -- see can_act_for_client() in Postgres. Called through
    // userClient (the caller's own JWT) so auth.uid() inside the function
    // resolves correctly; previously this logic was hand-duplicated here in
    // TS, which is exactly how it silently went stale for a portal client.
    const { data: authorized, error: authzErr } = await userClient.rpc('can_act_for_client', {
      p_org_id: body.org_id,
      p_client_id: clientId,
    })
    if (authzErr || !authorized) return respond({ error: 'Not a member of this organization' }, 403)

    const currency = body.currency ?? 'USD'

    // 1. raw_hash
    const rawHash = await buildRawHash({
      orgId: body.org_id, amount: body.amount, currency,
      reference: body.reference ?? null, transactionDate: body.transaction_date, source: body.source,
    })

    // 2. Chain continuity
    const { data: lastAudit } = await admin.from('audit_events')
      .select('entry_hash').eq('org_id', body.org_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const previousHash = lastAudit?.entry_hash ?? null

    // 3. Insert transaction (risk_status is set by the database's Brain)
    const { data: tx, error: insertErr } = await admin.from('transactions').insert({
      org_id: body.org_id,
      client_id: clientId,
      version: 1,
      source: body.source,
      amount: body.amount,
      currency,
      reference: body.reference ?? null,
      description: body.description ?? null,
      transaction_date: body.transaction_date,
      raw_hash: rawHash,
      previous_hash: previousHash,
      metadata: body.metadata ?? {},
      payment_method: body.payment_method ?? 'unknown',
      created_by: user.id,
    }).select().single()

    if (insertErr || !tx) {
      console.error('[create-transaction] insert failed', insertErr)
      return respond({ error: safeMessage(insertErr, 'Failed to create the transaction') }, 500)
    }

    // Vendor auto-learning (best-effort) + CGC Core (best-effort) --
    // scheduled via EdgeRuntime.waitUntil rather than a bare fire-and-forget
    // call: this isolate can be torn down right after the response is sent,
    // and an un-awaited promise has no guarantee of finishing before that
    // happens (unlike a browser tab, which stays alive). waitUntil keeps the
    // isolate alive for these two without making the caller wait for them.
    const background = Promise.allSettled([
      autoAssignLearnedVendor(admin, { id: tx.id, org_id: tx.org_id, description: tx.description, merchant_name: tx.merchant_name }),
      cgcEvaluateBestEffort({
        transactionId: tx.id, orgId: body.org_id, amount: body.amount, currency,
        description: body.description ?? null, reference: body.reference ?? null, date: body.transaction_date,
        source: body.source, semaphore: tx.semaphore, confidence: null,
        userEmail: user.email ?? 'service@ledgiproof',
      }),
    ])
    // @ts-ignore -- EdgeRuntime is a Supabase/Deno Deploy global, not in the TS lib defs
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(background)
    else await background // local/dev runtime fallback

    // 4. Audit chain
    const entryHash = await buildAuditHash({
      previousHash, transactionId: tx.id, transactionVersion: tx.version,
      eventType: 'created', timestamp: tx.created_at, actorId: user.id,
    })
    await admin.from('audit_events').insert({
      org_id: body.org_id,
      transaction_id: tx.id,
      transaction_group_id: tx.transaction_group_id,
      transaction_version: tx.version,
      event_type: 'created',
      actor_id: user.id,
      previous_hash: previousHash,
      entry_hash: entryHash,
    })

    return respond(tx, 201)
  } catch (err: unknown) {
    console.error('[create-transaction]', err)
    return respond({ error: safeMessage(err, 'Failed to create the transaction') }, 500)
  }
})
