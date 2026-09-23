// ── LedgiProof Brain Service ──────────────────────────────────────────────────
//
// Loads rule_definitions from Supabase, evaluates them against a transaction,
// and returns a semaphore status with full explainability payload.
//
// Priority hierarchy (highest wins):
//   critical → red     (manual intervention required)
//   review   → amber   (requires review before proceeding)
//   info     → green   (automated / informational — no issues detected)
//   (none)   → green   (clean, awaiting human sign-off)
//
// ── Semaphore lifecycle ───────────────────────────────────────────────────────
//   green  AUTO   Brain assigned: no critical/review rules fired. Transaction
//                 is clean — no issues detected. Awaits professional review.
//   green  HUMAN  Client confirmed via resolve-transaction (resolution='approve'):
//                 "this transaction is mine / correct." Moves to the professional
//                 review queue. Still needs the accountant/bookkeeper to certify.
//   amber         Requires human attention (review-severity rule fired, or reply
//                 received but question not fully resolved).
//   red           Critical issue or explicitly rejected.
//   blue   HUMAN  Certified and CLOSED by the accountant/bookkeeper
//                 (resolution='certify'). FINAL STATE. The Brain never assigns
//                 blue — it is set only by an explicit professional closure or
//                 the CGC APPROVE outcome (cryptographic certification).
//
// ═════════════════════════════════════════════════════════════════════════════
//  Sprint 5 REFACTOR — Client-aware evaluation
// ═════════════════════════════════════════════════════════════════════════════
//
// CRITICAL CHANGES (post-Sprint 5 Client Switcher):
//
//   1. RuleInput.clientId is now part of the contract (optional for self
//      mode, REQUIRED for firm-client mode). When set, all rule queries
//      filter by client_id so a bookkeeper firm with 50 clients doesn't
//      get cross-client false positives.
//
//   2. dup_check, velocity_check, new_counterparty all now scope to
//      (org_id, client_id) where client_id is the input's client_id.
//
//   3. All Supabase queries now check .error explicitly. Silent failures
//      (count returning null) are surfaced as evaluation errors rather
//      than masked as fired=false.
//
//   4. Defensive cfg parsing — numeric configs validated at extraction
//      time to catch admin-mis-typed strings.
//
//   5. persistEvaluation now stores client_id when present.

import { db } from '../lib/supabase'
import type {
  RuleDefinition,
  RuleSeverity,
  SemaphoreStatus,
  Json,
  Database
} from '../types/database.types'
import { toSafeMessage } from '../lib/errors'

type RuleEvaluationInsert = Database['public']['Tables']['rule_evaluations']['Insert']

// ── Types ────────────────────────────────────────────────────────────────────

export interface RuleInput {
  orgId:           string
  /**
   * 🆕 Sprint 5: Client scope for the transaction being evaluated.
   *   · firm-client mode → REQUIRED. Rules scope to this client.
   *   · self mode (solo/pyme) → null is acceptable (legacy behavior).
   * When null, the brain falls back to org-wide queries (less precise).
   */
  clientId:        string | null
  amount:          number
  currency:        string
  reference:       string | null
  description:     string | null
  transactionDate: string
  source:          string
  metadata:        Record<string, unknown>
}

export interface EvaluatedRule {
  id:       string
  name:     string
  severity: RuleSeverity
  score:    number        // 0.000 – 1.000
  fired:    boolean
  reason:   string | null
  /** 🆕 Sprint 5: Surfaces a query error so we don't silently fire=false. */
  errored?: boolean
}

export interface BrainResult {
  finalStatus:    SemaphoreStatus
  ruleTriggered:  string | null    // winning rule_id
  ruleScore:      number | null
  explanation:    string | null
  evaluatedRules: EvaluatedRule[]
  engineVersion:  string
}

// ── Brain evaluator ──────────────────────────────────────────────────────────

const ENGINE_VERSION = import.meta.env.VITE_ENGINE_VERSION ?? '1.0.0'

export async function evaluateTransaction(input: RuleInput): Promise<BrainResult> {
  const rules = await loadRules(input.orgId)
  const evaluated: EvaluatedRule[] = []

  for (const rule of rules) {
    if (!rule.is_active) continue
    const result = await applyRule(rule, input)
    evaluated.push(result)
  }

  return resolvePriority(evaluated)
}

// ── Rule loader — merges global rules with org overrides ─────────────────────

async function loadRules(orgId: string): Promise<RuleDefinition[]> {
  // 🆕 Sprint 5: Replace fragile .or() PostgREST syntax with 2 parallel queries.
  // PostgREST .or() with composite filters has been a source of bugs in this
  // codebase (see Sprint 5 Paso 5.2 templates fix).
  const [globalRes, orgRes] = await Promise.all([
    db.from('rule_definitions')
      .select('*')
      .is('org_id', null)
      .eq('is_active', true)
      .order('priority', { ascending: true }),
    db.from('rule_definitions')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('priority', { ascending: true })
  ])

  if (globalRes.error) throw new Error(`[Brain] Failed to load global rules: ${toSafeMessage(globalRes.error, 'database error')}`)
  if (orgRes.error)    throw new Error(`[Brain] Failed to load org rules: ${toSafeMessage(orgRes.error, 'database error')}`)

  // Org-specific rules override global rules with the same rule_id
  const map = new Map<string, RuleDefinition>()
  for (const rule of globalRes.data ?? []) {
    map.set(rule.rule_id, rule)
  }
  for (const rule of orgRes.data ?? []) {
    map.set(rule.rule_id, rule)    // override (later wins by Map semantics)
  }
  return Array.from(map.values()).sort((a, b) => a.priority - b.priority)
}

// ── Config helpers (Sprint 5 defensive parsing) ──────────────────────────────

/**
 * Safely extract a numeric config value with a default.
 * Handles:
 *   · undefined / null  → returns default
 *   · already a number  → returns it
 *   · string that parses as number → returns parsed
 *   · anything else     → logs warning, returns default
 */
export function cfgNumber(cfg: Record<string, unknown>, key: string, fallback: number): number {
  const v = cfg[key]
  if (v === undefined || v === null) return fallback
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const parsed = Number(v)
    if (Number.isFinite(parsed)) {
      console.warn(`[Brain] cfg[${key}] is a string "${v}", coerced to ${parsed}. Admin should fix the rule definition.`)
      return parsed
    }
  }
  console.warn(`[Brain] cfg[${key}] has invalid type (${typeof v}), using fallback ${fallback}`)
  return fallback
}

// ── Individual rule applicators ──────────────────────────────────────────────

async function applyRule(rule: RuleDefinition, input: RuleInput): Promise<EvaluatedRule> {
  const cfg = rule.config as Record<string, unknown>

  switch (rule.rule_id) {

    case 'dup_check': {
      const windowHours = cfgNumber(cfg, 'window_hours', 48)
      const windowStart = new Date(Date.now() - windowHours * 3600_000).toISOString()

      // 🆕 Sprint 5: Scope to client when present.
      let q = db.from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', input.orgId)
        .eq('amount', input.amount)
        .eq('reference', input.reference ?? '')
        .eq('is_current', true)
        .gte('created_at', windowStart)
      if (input.clientId) q = q.eq('client_id', input.clientId)

      const { count, error } = await q
      if (error) {
        return errorRule(rule, `Query error: ${toSafeMessage(error, 'database error')}`)
      }

      const fired = (count ?? 0) > 0
      return {
        id: rule.rule_id, name: rule.name, severity: rule.severity,
        score: fired ? 0.95 : 0,
        fired,
        reason: fired
          ? `Duplicate transaction detected within ${windowHours}h window${input.clientId ? ' for this client' : ''}`
          : null
      }
    }

    case 'threshold_check': {
      const limit = cfgNumber(cfg, 'default_limit', 5000)
      const fired = Math.abs(input.amount) > limit
      const score = fired ? Math.min(Math.abs(input.amount) / limit / 2, 1) : 0
      return {
        id: rule.rule_id, name: rule.name, severity: rule.severity,
        score, fired,
        reason: fired ? `Amount $${input.amount} exceeds limit $${limit}` : null
      }
    }

    case 'velocity_check': {
      const maxPerHour = cfgNumber(cfg, 'max_tx_per_hour', 20)
      const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()

      // 🆕 Sprint 5: Per-client velocity is the meaningful metric in firm mode.
      // Without client scoping, a firm with 50 clients always triggers.
      let q = db.from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', input.orgId)
        .eq('is_current', true)
        .gte('created_at', oneHourAgo)
      if (input.clientId) q = q.eq('client_id', input.clientId)

      const { count, error } = await q
      if (error) {
        return errorRule(rule, `Query error: ${toSafeMessage(error, 'database error')}`)
      }

      const fired = (count ?? 0) >= maxPerHour
      return {
        id: rule.rule_id, name: rule.name, severity: rule.severity,
        score: fired ? 0.85 : 0,
        fired,
        reason: fired
          ? `${count} transactions in the last hour${input.clientId ? ' for this client' : ''} (limit ${maxPerHour})`
          : null
      }
    }

    case 'new_counterparty': {
      if (!input.reference) {
        return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: 0, fired: false, reason: null }
      }
      const lookbackDays  = cfgNumber(cfg, 'lookback_days', 90)
      const lookbackStart = new Date(Date.now() - lookbackDays * 86400_000).toISOString()

      // 🆕 Sprint 5: "First time" must be per-client. If Maria has a regular
      // vendor "AWS" and Pedro's first AWS tx comes in, we WANT to flag it
      // (it's new for Pedro). Without client_id scoping, we'd miss it.
      let q = db.from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', input.orgId)
        .eq('reference', input.reference)
        .eq('is_current', true)
        .gte('transaction_date', lookbackStart.slice(0, 10))
      if (input.clientId) q = q.eq('client_id', input.clientId)

      const { count, error } = await q
      if (error) {
        return errorRule(rule, `Query error: ${toSafeMessage(error, 'database error')}`)
      }

      const fired = (count ?? 0) === 0
      return {
        id: rule.rule_id, name: rule.name, severity: rule.severity,
        score: fired ? 0.6 : 0,
        fired,
        reason: fired
          ? `No prior transactions with reference "${input.reference}" in ${lookbackDays} days${input.clientId ? ' for this client' : ''}`
          : null
      }
    }

    case 'missing_document': {
      // Phase 1: fired if metadata has no document_url
      const fired = !input.metadata?.['document_url']
      return {
        id: rule.rule_id, name: rule.name, severity: rule.severity,
        score: fired ? 0.7 : 0,
        fired,
        reason: fired ? 'No supporting document attached to this transaction' : null
      }
    }

    case 'budget_variance': {
      // Phase 2: requires budget table. For now, no-op.
      return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: 0, fired: false, reason: null }
    }

    default:
      // Unknown rule — skip silently, log for debugging
      console.warn(`[Brain] Unknown rule_id: ${rule.rule_id}`)
      return { id: rule.rule_id, name: rule.name, severity: rule.severity, score: 0, fired: false, reason: null }
  }
}

/**
 * 🆕 Sprint 5: Helper to build an error-state evaluation result.
 * Errored rules:
 *   · Do NOT count as fired (we don't change semaphore status based on errors)
 *   · DO carry a reason explaining the error for audit visibility
 *   · Are flagged with errored:true so dashboards can surface them
 */
function errorRule(rule: RuleDefinition, reason: string): EvaluatedRule {
  console.warn(`[Brain] Rule ${rule.rule_id} errored: ${reason}`)
  return {
    id: rule.rule_id,
    name: rule.name,
    severity: rule.severity,
    score: 0,
    fired: false,
    reason,
    errored: true
  }
}

// ── Priority resolver ────────────────────────────────────────────────────────
// Auto-assignment only: CRITICAL (red) > REVIEW (amber) > INFO (green) > NONE (green)
// Green = "no issues detected, ready for professional review."
// Blue (certified + closed) is never produced here — it is set by the
// accountant/bookkeeper via resolve-transaction (resolution='certify').
// If both critical and review rules fire, red wins.
//
// Note: .filter() returns a fresh array so .sort() does not mutate the input.

export function resolvePriority(evaluated: EvaluatedRule[]): BrainResult {
  const fired    = evaluated.filter(r => r.fired)
  const critical = fired.filter(r => r.severity === 'critical')
  const review   = fired.filter(r => r.severity === 'review')
  const info     = fired.filter(r => r.severity === 'info')

  let finalStatus: SemaphoreStatus
  let winner: EvaluatedRule | null = null

  if (critical.length > 0) {
    finalStatus = 'red'
    winner      = critical.sort((a, b) => b.score - a.score)[0] ?? null
  } else if (review.length > 0) {
    finalStatus = 'amber'
    winner      = review.sort((a, b) => b.score - a.score)[0] ?? null
  } else if (info.length > 0) {
    // info-level rules are informational only → green (never blue).
    finalStatus = 'green'
    winner      = info.sort((a, b) => b.score - a.score)[0] ?? null
  } else {
    finalStatus = 'green'
  }

  return {
    finalStatus,
    ruleTriggered:  winner?.id      ?? null,
    ruleScore:      winner?.score   ?? null,
    explanation:    winner?.reason  ?? null,
    evaluatedRules: evaluated,
    engineVersion:  ENGINE_VERSION
  }
}

// ── Persist result to rule_evaluations ──────────────────────────────────────

export async function persistEvaluation(
  transactionId:      string,
  transactionVersion: number,
  result:             BrainResult,
  // 🆕 Sprint 5: optional client_id stored alongside evaluation.
  // Pass it when the originating RuleInput had a clientId so audits can
  // filter evaluations per-client. rule_evaluations.client_id is a real,
  // nullable column (see database.types.ts) — omitted here simply leaves
  // it NULL, it is not "silently ignored" by PostgREST.
  clientId?: string | null
): Promise<void> {
  const row: RuleEvaluationInsert = {
    transaction_id:      transactionId,
    transaction_version: transactionVersion,
    final_status:        result.finalStatus,
    rule_triggered:      result.ruleTriggered,
    rule_score:          result.ruleScore,
    explanation:         result.explanation,
    evaluated_rules:     result.evaluatedRules as unknown as Json,
    engine_version:      result.engineVersion,
    ...(clientId ? { client_id: clientId } : {})
  }

  const { error } = await db.from('rule_evaluations').insert(row)

  if (error) throw new Error(`[Brain] Failed to persist evaluation: ${toSafeMessage(error, 'database error')}`)
}
