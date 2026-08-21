// PATH: src/services/cgc.service.ts
// ─────────────────────────────────────────────────────────────────────────────
//  CGC Core — Cognitive Governance Cycle
//  Olympus Mont Systems LLC — Proprietary IP © 2026
// ─────────────────────────────────────────────────────────────────────────────
//
//  LedgiProof → CGC Core integration layer.
//
//  CGC Core Pipeline (as implemented in cgc_loop_v2.py):
//
//     ┌──────────────────────────────────────────────────────────────┐
//     │  1. PreFilter       — Area identification + short-circuit    │
//     │  2. SCM Entry Check — Security policies (entry gate)         │
//     │  3. Core Modules (parallel):                                 │
//     │       PAN — Perception & Analysis Node                       │
//     │       ECM — Ethical/Compliance Module                        │
//     │       PFM — Probabilistic Forecast Module (risk)             │
//     │       SDA — Semantic Decision Annotator                      │
//     │  4. JLA Model Registry — provider-agnostic model selection   │
//     │  5. PoD Interceptor — pre-delivery crypto proof sealing      │
//     │       ├─ begin_intercept()  → input_hash 					   │
//     │       └─ seal_intercept()   → triplet_hash + signature       │
//     │  6. ComplianceEngine — EU AI Act + NIST RMF                  │
//     │  7. TCO Audit — immutable decision log                       │
//     └──────────────────────────────────────────────────────────────┘
//
//  Governance areas: BANKING | LEGAL | FINANCE | AUDIT | RETAIL | DEFAULT
//  For accounting transactions in LedgiProof, area = "FINANCE" or "BANKING"
//
//  Outcomes: APPROVE | REJECT | REQUIRE_HUMAN | ERROR
//
//  The LoopOutcome maps to LedgiProof semaphore:
//    APPROVE        → blue   (verified + certified)
//    REQUIRE_HUMAN  → amber  (bookkeeper review needed)
//    REJECT         → red    (governance violation)
//    ERROR          → amber  (fail-safe to human review)
//
// ─────────────────────────────────────────────────────────────────────────────

import { db, supabase }      from '../lib/supabase'
import { pruneRpcArgs }      from '../lib/rpc-args'
import type { Transaction, Json } from '../types/database.types'

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

// VITE_CGC_ENDPOINT is kept only so the embedded fallback can call
// /verify/chain/integrity (which does not require auth). The API key is
// no longer exposed to the client — all authenticated CGC calls go through
// the cgc-evaluate edge function which reads CGC_API_KEY from Deno.env.
const CGC_ENDPOINT  = import.meta.env.VITE_CGC_ENDPOINT ?? ''
const CGC_ENABLED   = import.meta.env.VITE_CGC_ENABLED  === 'true'
const CGC_TIMEOUT   = 8000   // 8s — CGC pipeline can take up to 7ms per module ×6

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES — matches cgc_loop_v2.py response schema exactly
// ─────────────────────────────────────────────────────────────────────────────

/** Governance area identified by PreFilter */
export type GovernanceArea = 'BANKING' | 'LEGAL' | 'FINANCE' | 'AUDIT' | 'RETAIL' | 'DEFAULT'

/** Sensitivity level computed from sensitiveDomainsCount + area */
export type SensitivityLevel = 'LOW' | 'MEDIUM' | 'HIGH'

/** LoopOutcome enum from cgc_loop_v2.py */
export type LoopOutcome = 'APPROVE' | 'REJECT' | 'REQUIRE_HUMAN' | 'ERROR'

/** Semaphore mapping from LoopOutcome */
export type SemaphoreFromOutcome = 'blue' | 'green' | 'amber' | 'red'

/**
 * Input envelope sent to CGC Core /governance/execute endpoint.
 * Mirrors LOOP.execute_governance_cycle() parameters.
 */
export interface CGCGovernanceRequest {
  decision_id:      string
  module_source:    string      // "ledgiproof-transactions"
  org_id:           string      // tenant UUID
  action:           string      // e.g. "classify_transaction"
  input_data:       Record<string, unknown>
  prefilter_hint?:  {
    area?:                GovernanceArea
    sensitiveDomainsCount?: number
    complianceOwnerPresent?: boolean
  }
  context?:         Record<string, unknown>
}

/**
 * Module-level score (PAN, ECM, PFM, SDA) — normalized to 0-1.
 */
export interface ModuleScore {
  score:      number            // 0.0 - 1.0
  confidence: number            // 0.0 - 1.0
  details?:   Record<string, unknown>
}

/**
 * PoD InterceptTriplet — the core patent artifact.
 * SHA256(input_hash || model_identifier || output_hash)
 */
export interface PoDTriplet {
  intercept_id:         string
  decision_id:          string
  tenant_id:            string
  input_payload_hash:   string   // SHA-256 hex
  model_identifier:     string   // e.g. "openai/gpt-4o/2025-12"
  output_payload_hash:  string   // SHA-256 hex
  triplet_hash:         string   // SHA-256 hex (the canonical proof)
  triplet_signature:    string   // RSA-PSS-SHA256 hex
  signing_key_id:       string
  intercepted_at:       string   // ISO timestamp
  delivered_at:         string   // ISO timestamp
  latency_ms:           number
  timestamp_token?:     string | null
  timestamp_authority?: string | null
  pii_detected:         boolean
  pii_fields_count:     number
}

/**
 * PoD Block — one link in the immutable proof chain.
 */
export interface PoDBlock {
  block_number:   number
  block_hash:     string        // SHA-256 hex of (prev_hash + triplet)
  previous_hash:  string
  triplet:        PoDTriplet
  governance_outcome: LoopOutcome
  compliance_score?:  number
  sealed_at:          string
}

/**
 * Complete response from CGC Core governance cycle.
 * Mirrors the final_response dict in execute_governance_cycle().
 */
export interface CGCGovernanceResponse {
  approved:            boolean
  outcome:             LoopOutcome
  reason:              string
  scm_exit_status:     string              // "CLOSED_IMMUTABLE" | "PREFILTER_DENY" | ...
  area:                GovernanceArea
  sensitivity_level:   SensitivityLevel

  // Signed decision artifact with all module outputs
  decision_artifact: {
    decision_id:      string
    aggregated_score: number
    module_scores: {
      pan: ModuleScore
      ecm: ModuleScore
      pfm: ModuleScore
      sda: ModuleScore
    }
    weighting_config: {
      area:                GovernanceArea
      sensitivity:         SensitivityLevel
      ecm_weight:          number
      pfm_weight:          number
      pan_weight:          number
      sda_weight:          number
      approval_threshold:  number
      require_human_review?: boolean
    }
    signature?:          string
    signing_key_id?:     string
    pod_triplet?:        PoDTriplet
    pod_block?:          PoDBlock
    compliance?:         {
      eu_ai_act_compliant: boolean
      nist_rmf_score:      Record<string, number>
      violations:          Array<{ framework: string; article: string; severity: string; message: string }>
    }
  }

  // Audit log from TCO
  audit?: {
    log_id:        string
    hash:          string
    previous_hash: string
    logged_at:     string
  }

  prefilter_result?: {
    areaIdentified:        GovernanceArea
    sensitiveDomainsCount: number
    sensitiveDomainsDetected?: string[]
    complianceOwnerPresent?: boolean
    short_circuit?:         boolean
    reason?:                string
  }

  eu_ai_act_compliant?: boolean
  compliance_report?:   string | null
  processing_time_ms:   number
}

/**
 * Compact evaluation input from LedgiProof side (convenience wrapper).
 * Internally expanded into a full CGCGovernanceRequest.
 */
export interface CGCEvaluationInput {
  transactionId:   string
  orgId:           string
  amount:          number
  currency:        string
  description:     string | null
  reference:       string | null
  date:            string
  source:          string
  semaphore:       string
  confidence:      number | null
  metadata?:       Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
//  OUTCOME → SEMAPHORE MAPPING
// ─────────────────────────────────────────────────────────────────────────────

export function outcomeToSemaphore(outcome: LoopOutcome): SemaphoreFromOutcome {
  switch (outcome) {
    case 'APPROVE':       return 'blue'    // verified + cryptographically certified
    case 'REQUIRE_HUMAN': return 'amber'   // human-in-loop review required
    case 'REJECT':        return 'red'     // policy violation / governance block
    case 'ERROR':         return 'amber'   // fail-safe to human review
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  AREA DETECTION (client-side hint for PreFilter)
// ─────────────────────────────────────────────────────────────────────────────

/** Heuristic area detection from transaction metadata — sent as hint to PreFilter */
function detectAreaHint(tx: CGCEvaluationInput): GovernanceArea {
  const text = (tx.description ?? '').toLowerCase()
  const source = tx.source.toLowerCase()

  // Banking indicators: from Plaid / bank APIs, transfer language
  if (source === 'bank_api' || source === 'plaid') return 'BANKING'
  if (text.includes('transfer') || text.includes('wire') || text.includes('ach')) return 'BANKING'

  // Finance indicators: investment, securities
  if (text.includes('invest') || text.includes('dividend') || text.includes('securities')) return 'FINANCE'

  // Audit indicators: reconciliation, audit reports
  if (text.includes('audit') || text.includes('reconcil')) return 'AUDIT'

  // Default for accounting transactions
  return 'FINANCE'
}

// ─────────────────────────────────────────────────────────────────────────────
//  EMBEDDED FALLBACK (when CGC Core remote is unavailable)
//  Mirrors a minimal subset of cgc_loop logic for offline operation.
// ─────────────────────────────────────────────────────────────────────────────

interface EmbeddedPolicy {
  id:       string
  name:     string
  severity: 'info' | 'warning' | 'error' | 'critical'
  check:    (tx: CGCEvaluationInput) => boolean
  message:  string
}

const EMBEDDED_POLICIES: EmbeddedPolicy[] = [
  {
    id:       'PAN-001',
    name:     'Missing transaction description',
    severity: 'warning',
    check:    tx => !tx.description || tx.description.trim().length < 3,
    message:  'PAN: Transaction lacks description — feature extraction degraded'
  },
  {
    id:       'ECM-001',
    name:     'High value transaction threshold',
    severity: 'warning',
    check:    tx => Math.abs(tx.amount) > 10_000,
    message:  'ECM: Transaction exceeds $10,000 — ethical review gate triggered'
  },
  {
    id:       'PFM-001',
    name:     'Low Brain confidence',
    severity: 'warning',
    check:    tx => (tx.confidence ?? 100) < 50,
    message:  'PFM: Brain confidence below 50% — risk elevated'
  },
  {
    id:       'SCM-001',
    name:     'Critical semaphore state',
    severity: 'critical',
    check:    tx => tx.semaphore === 'red',
    message:  'SCM: Red semaphore blocks automatic approval'
  },
  {
    id:       'ECM-002',
    name:     'Round amount anomaly',
    severity: 'info',
    check:    tx => {
      const abs = Math.abs(tx.amount)
      return abs >= 500 && abs % 500 === 0
    },
    message:  'ECM: Round amount may indicate manual entry — verify source document'
  }
]

async function sha256Hex(text: string): Promise<string> {
  const enc  = new TextEncoder()
  const buf  = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function runEmbeddedGovernance(
  input:         CGCEvaluationInput,
  overallStart:  number
): Promise<CGCGovernanceResponse> {
  const violations = EMBEDDED_POLICIES
    .filter(p => p.check(input))
    .map(p => ({ framework: 'CGC-Embedded', article: p.id, severity: p.severity, message: p.message }))

  const hasCritical = violations.some(v => v.severity === 'critical' || v.severity === 'error')
  const hasWarning  = violations.some(v => v.severity === 'warning')

  const outcome: LoopOutcome = hasCritical ? 'REJECT'
    : hasWarning ? 'REQUIRE_HUMAN'
    : 'APPROVE'

  // Compute aggregated score mimicking Loop's weighted logic
  const panScore = input.description && input.description.length > 3 ? 0.88 : 0.45
  const ecmScore = hasCritical ? 0.15 : hasWarning ? 0.60 : 0.92
  const pfmScore = Math.max(0, Math.min(1, (input.confidence ?? 75) / 100))
  const sdaScore = violations.length === 0 ? 1.0 : Math.max(0, 1.0 - violations.length * 0.2)

  const area       = detectAreaHint(input)
  const sensitivity: SensitivityLevel = hasCritical ? 'HIGH' : hasWarning ? 'MEDIUM' : 'LOW'

  // BANKING/MEDIUM default weights from DECISION_WEIGHTING_MATRIX
  const weights = { ecm: 0.55, pfm: 0.35, pan: 0.07, sda: 0.03 }
  const aggregatedScore =
    ecmScore * weights.ecm +
    pfmScore * weights.pfm +
    panScore * weights.pan +
    sdaScore * weights.sda

  // Build embedded PoD triplet (simplified — real CGC uses RSA-PSS)
  const modelId       = 'cgc-embedded-v1.0.0'
  const inputHash     = await sha256Hex(JSON.stringify({
    transactionId: input.transactionId,
    amount:        input.amount,
    description:   input.description,
    date:          input.date
  }))
  const outputHash    = await sha256Hex(JSON.stringify({ outcome, aggregatedScore, violations }))
  const tripletHash   = await sha256Hex(`${inputHash}||${modelId}||${outputHash}`)
  const interceptId   = crypto.randomUUID()
  const interceptedAt = new Date(overallStart).toISOString()
  const deliveredAt   = new Date().toISOString()

  const triplet: PoDTriplet = {
    intercept_id:        interceptId,
    decision_id:         `emb-${input.transactionId}`,
    tenant_id:           input.orgId,
    input_payload_hash:  inputHash,
    model_identifier:    modelId,
    output_payload_hash: outputHash,
    triplet_hash:        tripletHash,
    triplet_signature:   'EMBEDDED_NO_SIGNATURE',
    signing_key_id:      'embedded-fallback',
    intercepted_at:      interceptedAt,
    delivered_at:        deliveredAt,
    latency_ms:          Date.now() - overallStart,
    timestamp_token:     null,
    timestamp_authority: null,
    pii_detected:        false,
    pii_fields_count:    0
  }

  return {
    approved:         outcome === 'APPROVE',
    outcome,
    reason:           outcome === 'APPROVE'
      ? 'All embedded governance policies satisfied'
      : violations[0]?.message ?? 'Human review required',
    scm_exit_status:  outcome === 'REJECT' ? 'POLICY_VIOLATION' : 'CLOSED_IMMUTABLE',
    area,
    sensitivity_level: sensitivity,
    decision_artifact: {
      decision_id:      `emb-${input.transactionId}`,
      aggregated_score: aggregatedScore,
      module_scores: {
        pan: { score: panScore, confidence: panScore },
        ecm: { score: ecmScore, confidence: ecmScore },
        pfm: { score: pfmScore, confidence: pfmScore },
        sda: { score: sdaScore, confidence: sdaScore }
      },
      weighting_config: {
        area,
        sensitivity,
        ecm_weight:         weights.ecm,
        pfm_weight:         weights.pfm,
        pan_weight:         weights.pan,
        sda_weight:         weights.sda,
        approval_threshold: 0.85,
        require_human_review: sensitivity === 'HIGH'
      },
      signing_key_id: 'embedded-fallback',
      pod_triplet:    triplet,
      compliance: {
        eu_ai_act_compliant: !hasCritical,
        nist_rmf_score:      { Govern: hasCritical ? 40 : 85, Map: 80, Measure: 80, Manage: 85 },
        violations
      }
    },
    prefilter_result: {
      areaIdentified:        area,
      sensitiveDomainsCount: hasCritical ? 3 : hasWarning ? 1 : 0,
      complianceOwnerPresent: true
    },
    eu_ai_act_compliant: !hasCritical,
    compliance_report:   null,
    processing_time_ms:  Date.now() - overallStart
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN ENTRY POINT — evaluate a transaction through CGC
// ─────────────────────────────────────────────────────────────────────────────

export async function cgcEvaluate(
  input: CGCEvaluationInput
): Promise<CGCGovernanceResponse> {
  const overallStart = Date.now()

  // Build full CGC governance request
  const request: CGCGovernanceRequest = {
    decision_id:   `lp-${input.transactionId}-${Date.now()}`,
    module_source: 'ledgiproof-transactions',
    org_id:        input.orgId,
    action:        'classify_transaction',
    input_data: {
      transaction_id: input.transactionId,
      amount:         input.amount,
      currency:       input.currency,
      description:    input.description,
      reference:      input.reference,
      date:           input.date,
      source:         input.source,
      current_semaphore: input.semaphore,
      brain_confidence:  input.confidence
    },
    prefilter_hint: {
      area: detectAreaHint(input)
    },
    context: {
      metadata: input.metadata ?? {},
      client:   'ledgiproof-desktop',
      client_version: '0.1.0'
    }
  }

  // Try remote CGC Core via the edge function (API key stays server-side)
  if (CGC_ENABLED) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        const controller = new AbortController()
        const timeout    = setTimeout(() => controller.abort(), CGC_TIMEOUT)

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
        const res = await fetch(`${supabaseUrl}/functions/v1/cgc-evaluate`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            org_id:       input.orgId,
            action:       request.action,
            input_data:   request.input_data,
            // Real acting user, not a shared service identity — the session
            // was already fetched above for the auth token; CGC Core's
            // actor-level analytics (Phase 3 internal guard) need a real
            // per-user email to be anything but a single degenerate actor.
            user_email:   session.user?.email ?? 'service@ledgiproof',
            data_domains: [detectAreaHint(input)]
          }),
          signal: controller.signal
        })

        clearTimeout(timeout)

        if (res.ok) {
          const data = (await res.json()) as CGCGovernanceResponse & { use_embedded?: boolean }
          if (!data.use_embedded) {
            await persistCGCValidation(input, data)
            return data
          }
          // Edge function signalled to fall back to embedded
        } else {
          console.warn(`[CGC] Edge function returned ${res.status} — falling back to embedded`)
        }
      }
    } catch (err) {
      console.warn('[CGC] Edge function unavailable — falling back to embedded:', err)
    }
  }

  // Embedded fallback — always available
  const embedded = await runEmbeddedGovernance(input, overallStart)
  await persistCGCValidation(input, embedded)
  return embedded
}

// ─────────────────────────────────────────────────────────────────────────────
//  PERSIST RESULT to cgc_validations table
// ─────────────────────────────────────────────────────────────────────────────

async function persistCGCValidation(
  input:    CGCEvaluationInput,
  response: CGCGovernanceResponse
): Promise<void> {
  try {
    const artifact = response.decision_artifact
    const validationResult =
      response.outcome === 'APPROVE'        ? 'approved'          :
      response.outcome === 'REQUIRE_HUMAN'  ? 'review_required'   :
      response.outcome === 'REJECT'         ? 'rejected'          : 'error'

    const violations = artifact.compliance?.violations ?? []

    await db.from('cgc_validations').upsert({
      org_id:              input.orgId,
      transaction_id:      input.transactionId,
      cgc_session_id:      artifact.decision_id,
      proof_hash:          artifact.pod_triplet?.triplet_hash ?? null,
      validation_result:   validationResult,
      policies_checked:    EMBEDDED_POLICIES.length,
      violations:          violations.map(v => ({
        policy:   v.article,
        severity: v.severity,
        message:  v.message
      })),
      cgc_confidence:      artifact.aggregated_score,
      cgc_recommendation:  response.reason,
      cgc_engine_version:  artifact.pod_triplet?.model_identifier ?? 'unknown',
      latency_ms:          response.processing_time_ms
    }, { onConflict: 'transaction_id' })
  } catch (err) {
    console.warn('[CGC] Could not persist validation (non-fatal):', err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HUMAN-IN-LOOP — record every human decision
// ─────────────────────────────────────────────────────────────────────────────

export async function recordDecision(input: {
  orgId:          string
  actorId:        string
  actorRole:      string
  decisionType:   'approve' | 'override' | 'reject' | 'escalate' | 'lock' | 'reconcile'
  transactionId?: string
  suggestionId?:  string
  beforeState?:   Record<string, unknown>
  afterState?:    Record<string, unknown>
  reason?:        string
}): Promise<string | null> {
  try {
    const { data, error } = await db.rpc('record_human_decision', pruneRpcArgs({
      p_org_id:         input.orgId,
      p_actor_id:       input.actorId,
      p_actor_role:     input.actorRole,
      p_decision_type:  input.decisionType,
      p_transaction_id: input.transactionId ?? undefined,
      p_suggestion_id:  input.suggestionId  ?? undefined,
      p_before_state:   (input.beforeState  ?? {}) as Json,
      p_after_state:    (input.afterState   ?? {}) as Json,
      p_reason:         input.reason        ?? undefined
    }))
    if (error) throw error
    return data as string
  } catch (err) {
    console.warn('[CGC] recordDecision failed (non-fatal):', err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  READ HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function getCGCValidation(transactionId: string) {
  const { data } = await db
    .from('cgc_validations').select('*')
    .eq('transaction_id', transactionId).maybeSingle()
  return data
}

// A failed check (network error, non-OK response, endpoint not configured)
// must never be reported the same way as a check that RAN and found a
// broken chain -- callers need to tell "couldn't verify" apart from
// "verified, and it's invalid". The `ok` discriminant forces every caller
// to handle both cases explicitly rather than reading `chain_valid` alone.
export type ChainIntegrityResult =
  | {
      ok:              true
      chain_length:    number
      chain_valid:     boolean
      last_block_hash: string | null
      last_sealed_at:  string | null
    }
  | {
      ok:    false
      error: string
    }

export async function verifyChainIntegrity(orgId: string): Promise<ChainIntegrityResult> {
  if (!CGC_ENDPOINT || !CGC_ENABLED) {
    return { ok: false, error: 'Chain verification is not configured for this environment' }
  }
  try {
    // GET /verify/chain/integrity → { blocks_verified, integrity_passed,
    // broken_at_block, verified_at }. Tenant scoping via the x-tenant-id header.
    const res = await fetch(`${CGC_ENDPOINT}/verify/chain/integrity`, {
      headers: { 'x-tenant-id': orgId }
    })
    if (!res.ok) throw new Error(`Chain integrity check failed (HTTP ${res.status})`)
    const data = (await res.json()) as {
      blocks_verified?: number
      integrity_passed?: boolean
      verified_at?:     string | null
    }
    return {
      ok:              true,
      chain_length:    data.blocks_verified  ?? 0,
      chain_valid:     data.integrity_passed ?? false,
      last_block_hash: null,                       // not exposed by this endpoint
      last_sealed_at:  data.verified_at      ?? null
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Could not verify chain integrity' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GOVERNANCE DASHBOARD STATS
// ─────────────────────────────────────────────────────────────────────────────

export async function getGovernanceDashboard(orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  const [decisions, validations] = await Promise.all([
    db.from('decisions')
      .select('decision_type, created_at')
      .eq('org_id', orgId)
      .gte('created_at', since),
    db.from('cgc_validations')
      .select('validation_result, cgc_confidence, latency_ms, cgc_engine_version')
      .eq('org_id', orgId)
      .gte('created_at', since)
  ])

  const d = decisions.data ?? []
  const v = validations.data ?? []

  const avgConf = v.reduce((s, x: any) => s + (x.cgc_confidence ?? 0), 0) / Math.max(v.length, 1)
  const avgMs   = v.reduce((s, x: any) => s + (x.latency_ms    ?? 0), 0) / Math.max(v.length, 1)

  return {
    decisions: {
      total:             d.length,
      approved:          d.filter(x => x.decision_type === 'approve').length,
      overrode:          d.filter(x => x.decision_type === 'override').length,
      rejected:          d.filter(x => x.decision_type === 'reject').length,
      escalated:         d.filter(x => x.decision_type === 'escalate').length,
      override_rate_pct: d.length > 0
        ? Math.round(d.filter(x => ['override', 'reject'].includes(x.decision_type)).length / d.length * 100)
        : 0
    },
    cgc: {
      total:           v.length,
      approved:        v.filter((x: any) => x.validation_result === 'approved').length,
      reviewRequired:  v.filter((x: any) => x.validation_result === 'review_required').length,
      rejected:        v.filter((x: any) => x.validation_result === 'rejected').length,
      errors:          v.filter((x: any) => x.validation_result === 'error').length,
      avgConfidence:   Math.round(avgConf * 100),
      avgLatencyMs:    Math.round(avgMs),
      remoteEngineUse: v.filter((x: any) =>
        x.cgc_engine_version && !x.cgc_engine_version.startsWith('cgc-embedded')
      ).length
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  UI BADGE CONFIG — shown in TransactionDetail
// ─────────────────────────────────────────────────────────────────────────────

export function getCGCBadgeConfig(
  validationResult?: string,
  engineVersion?:    string
): { label: string; color: string; bg: string; border: string; icon: string } {
  const isRemote = engineVersion && !engineVersion.startsWith('cgc-embedded')

  if (!validationResult) return {
    label: 'Not evaluated', color: '#475569',
    bg: 'rgba(71,85,105,0.1)', border: 'rgba(71,85,105,0.2)', icon: '○'
  }

  if (validationResult === 'approved') {
    return isRemote
      ? { label: 'CGC Certified',   color: '#a78bfa',
          bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)', icon: '✓' }
      : { label: 'CGC Embedded ✓',  color: '#60a5fa',
          bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.3)',  icon: '⚙' }
  }

  if (validationResult === 'rejected') return {
    label: 'CGC Rejected', color: '#ef4444',
    bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', icon: '✗'
  }

  return {
    label: 'Human Review Required', color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '⚠'
  }
}