// PATH: src/services/quota.service.ts
// Quota errors as the UI sees them. Enforcement lives on the server only
// (see "Server refusals" below).


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

// ── Server refusals ─────────────────────────────────────────────────────────
//
// Quotas are enforced ONLY on the server: the ai-query and
// plaid-create-link-token edge functions check and count (check_quota /
// increment_usage), the database triggers cover invoices, receipts, mileage,
// transactions and seats (plan_limits_server.sql). The browser never checks
// or counts on its own -- that is how AI queries used to be counted twice.
// An edge function at the cap answers 429 { code: 'QUOTA_EXCEEDED', … };
// this turns that response into a QuotaExceededError the UI already handles.

export async function quotaErrorFromFunction(
  err: unknown,
  metric: UsageMetric
): Promise<QuotaExceededError | null> {
  const ctx = (err as { context?: unknown } | null)?.context
  if (!(ctx instanceof Response) || ctx.status !== 429) return null
  try {
    const body = await ctx.clone().json() as {
      code?: string; error?: string; reason?: QuotaReason; plan?: string
      current?: number; limit?: number; used_pct?: number
    }
    if (body.code !== 'QUOTA_EXCEEDED') return null
    return new QuotaExceededError(metric, {
      allowed:       false,
      reason:        body.reason ?? 'hard_cap',
      current_value: body.current ?? 0,
      limit_value:   body.limit ?? 0,
      used_pct:      body.used_pct ?? 100,
      plan:          body.plan ?? '',
      ...(body.error ? { message: body.error } : {}),
    })
  } catch {
    return null
  }
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
