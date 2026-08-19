// PATH: src/services/accountant-dashboard.service.ts
//
// Accountant Firm dashboard service — the PRIMARY professional practice type.
// Accountant firms: is_accountant_firm = true. Partners, controllers, CPAs.
// Full workflow: journal entries, period close, GAAP compliance, multi-client.
//
// This service is intentionally separate from bookkeeper-dashboard.service.
// It has its own types, its own fetch function, and its own data surface.
//
// Calls get_accountant_dashboard, which internally reuses get_bookkeeper_dashboard
// for every metric that's identical across both firm types, then layers real
// accountant-exclusive data on top (journal_backlog, period_status — both from
// real tables). compliance/tax_calendar stay null: no backing table exists yet
// for tax filing deadlines or compliance tracking — see the RPC's own comment.
//
// Shared structural types (KanbanClient, FirmFinancialKpis, etc.) are imported
// from bookkeeper-dashboard.service because they describe SQL-returned shapes,
// not business rules. Re-exported here so accountant components can import from
// this module without touching the bookkeeper module.

import { db } from '../lib/supabase'
import type {
  FirmFinancialKpis,
  FirmSemaphoreCounts,
  KanbanClient,
  ClientWithIssues,
  RecentActivity,
  WorkflowState,
} from './bookkeeper-dashboard.service'
export { setClientWorkflowState, clearClientWorkflowState } from './bookkeeper-dashboard.service'

export type {
  FirmFinancialKpis,
  FirmSemaphoreCounts,
  KanbanClient,
  ClientWithIssues,
  RecentActivity,
  WorkflowState,
}

// ── Accountant KPI shape ────────────────────────────────────────────────────────
// Mirrors BookkeeperKpis so AccountantDashboardData stays structurally
// compatible with firm-dashboard-helpers (which accepts BookkeeperDashboardData).
// Accountant-exclusive KPIs (journal_entries_pending, open_periods) will be
// added here once get_accountant_dashboard is deployed.

export interface AccountantKpis {
  active_clients:    number
  clients_added_30d: number  // mirrors BookkeeperKpis for RPC compat; shown as-is
  pending_amber:     number
  pending_red:       number
  unreconciled:      number
}

// ── Accountant-exclusive data blocks ──────────────────────────────────────────
// These surfaces exist ONLY for accountant firms. They are null while the shared
// RPC is in use, and become real objects once get_accountant_dashboard ships.

export interface JournalBacklogSummary {
  unposted_count:       number
  pending_review_count: number
  oldest_unposted_days: number
}

export interface PeriodCloseSummary {
  client_id:   string
  client_name: string
  period:      string   // ISO "YYYY-MM"
  // Mirrors the DB enum period_status (OPEN | ADJUSTMENT | CLOSED), lowercased.
  // A client with no period_controls row for the current period is implicitly
  // 'open' — the RPC fills that default in rather than omitting the client.
  status:      'open' | 'adjustment' | 'closed'
}

export interface ComplianceSummary {
  overdue_filings_count:   number
  upcoming_deadline_count: number
  missing_schedules_count: number
}

export interface TaxDeadline {
  label:     string
  due_date:  string
  client_id: string | null
  urgency:   'low' | 'medium' | 'high'
}

export interface AccountantExclusiveData {
  journal_backlog: JournalBacklogSummary | null
  period_status:   PeriodCloseSummary[]  | null
  compliance:      ComplianceSummary     | null
  tax_calendar:    TaxDeadline[]         | null
}

// ── Primary dashboard data shape ───────────────────────────────────────────────

export interface AccountantDashboardData {
  generated_at:        string
  org_id:              string
  kpis:                AccountantKpis
  financial_kpis:      FirmFinancialKpis
  semaphore_counts:    FirmSemaphoreCounts
  kanban:              KanbanClient[]
  clients_with_issues: ClientWithIssues[]
  recent_activity:     RecentActivity[]
  accountant:          AccountantExclusiveData
  error?:              string
}

// ── Internal RPC response shape ────────────────────────────────────────────────

interface RawDashboardRpc {
  generated_at:        string
  org_id:              string
  kpis:                AccountantKpis
  financial_kpis:      FirmFinancialKpis
  semaphore_counts:    FirmSemaphoreCounts
  kanban:              KanbanClient[]
  clients_with_issues: ClientWithIssues[]
  recent_activity:     RecentActivity[]
  accountant:          AccountantExclusiveData
  error?:              string
}

// ── Main fetch function ────────────────────────────────────────────────────────

export async function getAccountantDashboard(orgId: string): Promise<AccountantDashboardData> {
  const { data, error } = await db.rpc('get_accountant_dashboard', { p_org_id: orgId })
  if (error) throw new Error(error.message)

  const raw = data as unknown as RawDashboardRpc

  return {
    generated_at:        raw.generated_at,
    org_id:              raw.org_id,
    kpis:                raw.kpis,
    financial_kpis:      raw.financial_kpis,
    semaphore_counts:    raw.semaphore_counts,
    kanban:              raw.kanban              ?? [],
    clients_with_issues: raw.clients_with_issues ?? [],
    recent_activity:     raw.recent_activity     ?? [],
    ...(raw.error !== undefined ? { error: raw.error } : {}),
    accountant: {
      journal_backlog: raw.accountant?.journal_backlog ?? null,
      period_status:   raw.accountant?.period_status   ?? null,
      compliance:      raw.accountant?.compliance      ?? null,
      tax_calendar:    raw.accountant?.tax_calendar     ?? null,
    },
  }
}
