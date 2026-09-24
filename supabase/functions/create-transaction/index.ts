// PATH: supabase/functions/create-transaction/index.ts
//
// Server-side port of the exact pipeline src/services/transactions.service.ts's
// createTransaction() runs client-side today -- built so the LedgiProof mobile
// app (and any future non-browser caller) gets the SAME hash-chain, the SAME
// Brain rule evaluation, and the SAME audit trail as the web app, instead of
// a second, divergent implementation of financial-integrity logic in Dart.
//
//   1. buildRawHash        -> raw_hash  (pre-human fingerprint)
//   2. Brain.evaluate      -> semaphore assignment
//   3. db.insert           -> transaction row
//   4. Brain.persist       -> rule_evaluations row
//   5. autoAssignLearnedVendor (best-effort, non-blocking)
//   6. CGC Core governance  (best-effort, non-blocking -- see note below)
//   7. Audit.append        -> audit_events chain entry
//
// Deliberate scope cut, disclosed rather than faked: step 6 calls the same
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
const ENGINE_VERSION = Deno.env.get('ENGINE_VERSION') ?? '1.0.0'

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

// ── Brain (mirrors src/services/brain.service.ts) ───────────────────────────

interface EvaluatedRule {
  id: string; name: string; severity: string; score: number; fired: boolean; reason: string | null; errored?: boolean
}
interface BrainResult {
  finalStatus: string; ruleTriggered: string | null; ruleScore: number | null; explanation: string | null
  evaluatedRules: EvaluatedRule[]; engineVersion: string
}

function cfgNumber(cfg: Record<string, unknown>, key: string, fallback: number): number {
  const v = cfg[key]
  if (v === undefined || v === null) return fallback
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const parsed = Number(v)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function errorRule(rule: any, reason: string): EvaluatedRule {
  return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: 0, fired: false, reason, errored: true }
}

async function loadRules(db: any, orgId: string) {
  const [globalRes, orgRes] = await Promise.all([
    db.from('rule_definitions').select('*').is('org_id', null).eq('is_active', true).order('priority', { ascending: true }),
    db.from('rule_definitions').select('*').eq('org_id', orgId).eq('is_active', true).order('priority', { ascending: true }),
  ])
  if (globalRes.error) throw new Error(`[Brain] global rules: ${globalRes.error.message}`)
  if (orgRes.error) throw new Error(`[Brain] org rules: ${orgRes.error.message}`)
  const map = new Map<string, any>()
  for (const r of globalRes.data ?? []) map.set(r.rule_id, r)
  for (const r of orgRes.data ?? []) map.set(r.rule_id, r)
  return Array.from(map.values()).sort((a, b) => a.priority - b.priority)
}

async function applyRule(db: any, rule: any, input: {
  orgId: string; clientId: string | null; amount: number; reference: string | null; metadata: Record<string, unknown>
}): Promise<EvaluatedRule> {
  const cfg = (rule.config ?? {}) as Record<string, unknown>

  switch (rule.rule_id) {
    case 'dup_check': {
      const windowHours = cfgNumber(cfg, 'window_hours', 48)
      const windowStart = new Date(Date.now() - windowHours * 3_600_000).toISOString()
      let q = db.from('transactions').select('id', { count: 'exact', head: true })
        .eq('org_id', input.orgId).eq('amount', input.amount).eq('reference', input.reference ?? '')
        .eq('is_current', true).gte('created_at', windowStart)
      if (input.clientId) q = q.eq('client_id', input.clientId)
      const { count, error } = await q
      if (error) return errorRule(rule, `Query error: ${error.message}`)
      const fired = (count ?? 0) > 0
      return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: fired ? 0.95 : 0, fired, reason: fired ? `Duplicate transaction detected within ${windowHours}h window` : null }
    }
    case 'threshold_check': {
      const limit = cfgNumber(cfg, 'default_limit', 5000)
      const fired = Math.abs(input.amount) > limit
      const score = fired ? Math.min(Math.abs(input.amount) / limit / 2, 1) : 0
      return { id: rule.rule_id, name: rule.name, severity: rule.severity, score, fired, reason: fired ? `Amount $${input.amount} exceeds limit $${limit}` : null }
    }
    case 'velocity_check': {
      const maxPerHour = cfgNumber(cfg, 'max_tx_per_hour', 20)
      const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
      let q = db.from('transactions').select('id', { count: 'exact', head: true })
        .eq('org_id', input.orgId).eq('is_current', true).gte('created_at', oneHourAgo)
      if (input.clientId) q = q.eq('client_id', input.clientId)
      const { count, error } = await q
      if (error) return errorRule(rule, `Query error: ${error.message}`)
      const fired = (count ?? 0) >= maxPerHour
      return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: fired ? 0.85 : 0, fired, reason: fired ? `${count} transactions in the last hour (limit ${maxPerHour})` : null }
    }
    case 'new_counterparty': {
      if (!input.reference) return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: 0, fired: false, reason: null }
      const lookbackDays = cfgNumber(cfg, 'lookback_days', 90)
      const lookbackStart = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
      let q = db.from('transactions').select('id', { count: 'exact', head: true })
        .eq('org_id', input.orgId).eq('reference', input.reference).eq('is_current', true)
        .gte('transaction_date', lookbackStart.slice(0, 10))
      if (input.clientId) q = q.eq('client_id', input.clientId)
      const { count, error } = await q
      if (error) return errorRule(rule, `Query error: ${error.message}`)
      const fired = (count ?? 0) === 0
      return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: fired ? 0.6 : 0, fired, reason: fired ? `No prior transactions with reference "${input.reference}" in ${lookbackDays} days` : null }
    }
    case 'missing_document': {
      const fired = !input.metadata?.['document_url']
      return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: fired ? 0.7 : 0, fired, reason: fired ? 'No supporting document attached to this transaction' : null }
    }
    case 'budget_variance':
      return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: 0, fired: false, reason: null }
    default:
      return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: 0, fired: false, reason: null }
  }
}

function resolvePriority(evaluated: EvaluatedRule[]): BrainResult {
  const fired = evaluated.filter(r => r.fired)
  const critical = fired.filter(r => r.severity === 'critical')
  const review = fired.filter(r => r.severity === 'review')
  const info = fired.filter(r => r.severity === 'info')

  let finalStatus = 'green'
  let winner: EvaluatedRule | null = null

  if (critical.length > 0) {
    finalStatus = 'red'
    winner = critical.sort((a, b) => b.score - a.score)[0] ?? null
  } else if (review.length > 0) {
    finalStatus = 'amber'
    winner = review.sort((a, b) => b.score - a.score)[0] ?? null
  } else if (info.length > 0) {
    finalStatus = 'green'
    winner = info.sort((a, b) => b.score - a.score)[0] ?? null
  }

  return {
    finalStatus, ruleTriggered: winner?.id ?? null, ruleScore: winner?.score ?? null,
    explanation: winner?.reason ?? null, evaluatedRules: evaluated, engineVersion: ENGINE_VERSION,
  }
}

async function evaluateTransaction(db: any, input: {
  orgId: string; clientId: string | null; amount: number; reference: string | null; metadata: Record<string, unknown>
}): Promise<BrainResult> {
  const rules = await loadRules(db, input.orgId)
  const evaluated: EvaluatedRule[] = []
  for (const rule of rules) {
    if (!rule.is_active) continue
    evaluated.push(await applyRule(db, rule, input))
  }
  return resolvePriority(evaluated)
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

    // 2. Brain
    const brainResult = await evaluateTransaction(admin, {
      orgId: body.org_id, clientId, amount: body.amount,
      reference: body.reference ?? null, metadata: body.metadata ?? {},
    })

    // 3. Chain continuity
    const { data: lastAudit } = await admin.from('audit_events')
      .select('entry_hash').eq('org_id', body.org_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const previousHash = lastAudit?.entry_hash ?? null

    // 4. Insert transaction
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
      semaphore: brainResult.finalStatus,
      status_reason: brainResult.explanation,
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

    // 5. Persist Brain evaluation
    await admin.from('rule_evaluations').insert({
      transaction_id: tx.id,
      transaction_version: tx.version,
      final_status: brainResult.finalStatus,
      rule_triggered: brainResult.ruleTriggered,
      rule_score: brainResult.ruleScore,
      explanation: brainResult.explanation,
      evaluated_rules: brainResult.evaluatedRules,
      engine_version: brainResult.engineVersion,
      ...(clientId ? { client_id: clientId } : {}),
    })

    // 6. Vendor auto-learning (best-effort) + 7. CGC Core (best-effort) --
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
        source: body.source, semaphore: brainResult.finalStatus, confidence: brainResult.ruleScore,
        userEmail: user.email ?? 'service@ledgiproof',
      }),
    ])
    // @ts-ignore -- EdgeRuntime is a Supabase/Deno Deploy global, not in the TS lib defs
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(background)
    else await background // local/dev runtime fallback

    // 8. Audit chain
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
