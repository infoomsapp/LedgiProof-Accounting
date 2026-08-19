// PATH: src/types/dashboard.ts
//
// Strict types for dashboard RPC responses.
// Mirrors the jsonb_build_object shapes returned by:
//   - get_solo_dashboard
//   - get_pyme_dashboard
//   - get_bookkeeper_dashboard
//
// Validate against the actual RPC output. If a key differs, fix HERE.

import type { SemaphoreStatus } from './audit'

// ── Shared ───────────────────────────────────────────────────────────────────

export interface DashboardTxRow {
  tx_id:            string
  description:      string | null
  merchant:         string | null
  amount:           number
  semaphore:        SemaphoreStatus
  transaction_date: string
  created_at:       string
  requires_review:  boolean
}

export interface PeriodKpis {
  income:     number
  expenses:   number
  net_profit: number
  margin_pct: number
  tx_count:   number
}

export interface PendingCounts {
  amber: number
  red:   number
  total: number
}

// ── get_solo_dashboard ───────────────────────────────────────────────────────

export interface SoloDashboardData {
  generated_at: string
  org_id:       string
  year:         number
  quarter:      number
  period: {
    quarter_start:    string
    quarter_end:      string
    quarter_due_date: string
    year_start:       string
    year_end:         string
  }
  // NOTE: backend reuses key "quarter" for both the number and the KPIs object.
  // Access KPIs via `quarter_kpis` after normalization in the hook, OR read the
  // raw object. We expose a normalized shape below.
  quarter_kpis?: PeriodKpis
  ytd:          PeriodKpis
  pending:      PendingCounts
  recent_tx:    DashboardTxRow[]
  profile: {
    workspace_kind?: string
    display_name?:   string
  }
}

// ── get_pyme_dashboard ───────────────────────────────────────────────────────

export interface PymeReceiptRequest {
  id:              string
  transaction_id:  string | null
  merchant_hint:   string | null
  amount_hint:     number | null
  date_hint:       string | null
  request_note:    string | null
  status:          string
  created_at:      string
}

export interface PymeFirm {
  org_id: string
  name:   string
}

export interface PymeClient {
  id:    string
  name:  string
  email: string | null
}

export interface PymeDashboardData {
  generated_at:     string
  firm:             PymeFirm
  client:           PymeClient
  kpis: {
    income:        number
    expenses:      number
    net_profit:    number
    income_delta?: number | null
    expenses_delta?: number | null
  }
  pending:          PendingCounts
  receipt_requests: PymeReceiptRequest[]
  recent_tx:        DashboardTxRow[]
}

// ── get_bookkeeper_dashboard ─────────────────────────────────────────────────

export interface BookkeeperClientSummary {
  client_id:      string
  client_name:    string
  pending_amber:  number
  pending_red:    number
  workflow_state: string | null
  last_activity:  string | null
}

export interface BookkeeperDashboardData {
  generated_at:    string
  org_id:          string
  firm_name:       string
  total_clients:   number
  total_pending:   PendingCounts
  clients:         BookkeeperClientSummary[]
  recent_events:   import('./audit').AuditActivityItem[]
}

// ── Semaphore display helpers ────────────────────────────────────────────────

export const SEMAPHORE_ORDER: SemaphoreStatus[] = ['blue', 'green', 'amber', 'red']

export const SEMAPHORE_COLORS: Record<SemaphoreStatus, string> = {
  blue:  '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  red:   '#ef4444'
}

export const SEMAPHORE_LABELS: Record<SemaphoreStatus, string> = {
  blue:  'New',
  green: 'Clear',
  amber: 'Needs review',
  red:   'Action required'
}