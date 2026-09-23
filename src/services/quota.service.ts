// PATH: src/services/quota.service.ts
// Centralized quota guard. Wraps every billable operation with a check_quota
// pre-flight call and (on success) increment_usage.
//
// Usage:
//   const ok = await assertQuota(orgId, 'ai_queries')
//   if (!ok.allowed) { throw new QuotaExceededError(ok.message) }
//   await doAiCall()
//   await trackUsage(orgId, 'ai_queries')
//
// Or with the convenience wrapper:
//   const result = await runWithQuota(orgId, 'ai_queries', async () => doAiCall())

import { db } from '../lib/supabase'
import { toSafeMessage } from '../lib/errors'

// ── Types ────────────────────────────────────────────────────────────────────

export type UsageMetric =
  | 'plaid_connections'
  | 'ai_queries'
  | 'transactions'
  | 'receipts'
  | 'mileage_trips'
  | 'invoices'
  | 'storage_mb'

export type QuotaReason =
  | 'within_limit'
  | 'overage_allowed'
  | 'overage_tracked'
  | 'unlimited'
  | 'soft_cap'
  | 'hard_cap'

export interface QuotaResult {
  allowed:       boolean
  reason:        QuotaReason
  current_value: number
  limit_value:   number
  used_pct:      number
  plan:          string
  message?:      string
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class QuotaExceededError extends Error {
  constructor(
    public readonly metric:  UsageMetric,
    public readonly result:  QuotaResult
  ) {
    super(result.message ?? `Quota exceeded for ${metric}`)
    this.name = 'QuotaExceededError'
  }
}

// ── Pre-flight check ─────────────────────────────────────────────────────────

/**
 * Calls check_quota RPC. Returns the decision.
 * Throws if the RPC errors out (auth, network, etc.)
 *
 * NOTE: This DOES log overage events as a side effect when applicable.
 *       It does NOT increment the usage counter — that's `trackUsage`.
 */
export async function assertQuota(
  orgId: string,
  metric: UsageMetric,
  amount = 1
): Promise<QuotaResult> {
  const { data, error } = await db.rpc('check_quota', {
    p_org_id: orgId,
    p_metric: metric,
    p_amount: amount
  })
  if (error) throw new Error(`Quota check failed: ${toSafeMessage(error, 'database error')}`)
  return data as unknown as QuotaResult
}

// ── Increment counter ────────────────────────────────────────────────────────

/**
 * Increments the usage counter. Should be called AFTER the operation
 * succeeds (so failed attempts don't burn quota).
 *
 * Does NOT throw on error — usage tracking failures should never break
 * the user's actual workflow. Errors are logged to console.
 */
export async function trackUsage(
  orgId: string,
  metric: UsageMetric,
  amount = 1
): Promise<void> {
  try {
    const { error } = await db.rpc('increment_usage', {
      p_org_id: orgId,
      p_metric: metric,
      p_amount: amount
    })
    if (error) {
      console.warn(`[trackUsage] ${metric} +${amount} failed:`, error.message)
    }
  } catch (e: any) {
    console.warn(`[trackUsage] ${metric} +${amount} threw:`, e?.message)
  }
}

// ── Convenience wrapper ──────────────────────────────────────────────────────

/**
 * Runs an async operation with full quota protection:
 *   1. Pre-flight check_quota
 *   2. Throws QuotaExceededError if blocked
 *   3. Runs the operation
 *   4. Increments usage on success
 *   5. Does NOT increment on operation failure
 *
 * Example:
 *   const reply = await runWithQuota(
 *     orgId,
 *     'ai_queries',
 *     () => askAi('What is my net profit Q1?')
 *   )
 */
export async function runWithQuota<T>(
  orgId: string,
  metric: UsageMetric,
  fn: () => Promise<T>,
  amount = 1
): Promise<T> {
  // 1. Pre-flight
  const check = await assertQuota(orgId, metric, amount)
  if (!check.allowed) {
    throw new QuotaExceededError(metric, check)
  }

  // 2. Run the operation
  const result = await fn()

  // 3. Track usage (non-blocking)
  void trackUsage(orgId, metric, amount)

  return result
}

// ── Helper: friendly metric labels ───────────────────────────────────────────

export const METRIC_LABELS: Record<UsageMetric, string> = {
  plaid_connections: 'bank connections',
  ai_queries:        'AI queries',
  transactions:      'transactions',
  receipts:          'receipts',
  mileage_trips:     'mileage trips',
  invoices:          'invoices',
  storage_mb:        'storage'
}

// ── Helper: detect quota errors ──────────────────────────────────────────────

export function isQuotaExceededError(err: unknown): err is QuotaExceededError {
  return err instanceof QuotaExceededError
}
