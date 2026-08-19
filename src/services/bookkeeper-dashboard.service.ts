// PATH: src/services/bookkeeper-dashboard.service.ts
// Wrappers around v20 bookkeeper dashboard RPCs.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'

// ── Types ────────────────────────────────────────────────────────────────────

export type WorkflowState = 'todo' | 'in_review' | 'reconciling' | 'closed'

export interface BookkeeperKpis {
  active_clients:    number
  clients_added_30d: number
  pending_amber:     number
  pending_red:       number
  unreconciled:      number
}

// Financial KPIs computed IN SQL by the RPC (Constitution: no UI aggregation).
export interface FirmFinancialKpis {
  period_start:         string
  period_end:           string
  income_verified:      number
  expenses_verified:    number
  cash_flow_verified:   number
  income_count:         number
  expense_count:        number
  income_pending:       number
  expenses_pending:     number
  outstanding_invoices: number
  overdue_invoices:     number
  overdue_count:        number
}

// Firm-wide semaphore distribution (for the donut) — computed in SQL.
export interface FirmSemaphoreCounts {
  blue:  number
  green: number
  amber: number
  red:   number
}

export interface KanbanClient {
  client_id:      string
  client_name:    string
  client_email:   string | null
  state:          WorkflowState
  is_manual:      boolean
  expires_at:     string | null
  red_count:      number
  amber_count:    number
  last_activity:  string | null
}

export interface ClientWithIssues {
  client_id:    string
  client_name:  string
  client_email: string | null
  red_count:    number
  amber_count:  number
}

export interface RecentActivity {
  tx_id:        string
  client_id:    string
  client_name:  string
  description:  string | null
  amount:       number
  semaphore:    'blue' | 'green' | 'amber' | 'red'
  created_at:   string
}

export interface BookkeeperDashboardData {
  generated_at:        string
  org_id:              string
  kpis:                BookkeeperKpis
  financial_kpis:      FirmFinancialKpis
  semaphore_counts:    FirmSemaphoreCounts
  kanban:              KanbanClient[]
  clients_with_issues: ClientWithIssues[]
  recent_activity:     RecentActivity[]
  error?:              string
}

// ── RPCs ─────────────────────────────────────────────────────────────────────

export async function getBookkeeperDashboard(orgId: string): Promise<BookkeeperDashboardData> {
  const { data, error } = await db.rpc('get_bookkeeper_dashboard', { p_org_id: orgId })
  if (error) throw new Error(error.message)
  return data as unknown as BookkeeperDashboardData
}

export async function setClientWorkflowState(
  clientId:        string,
  state:           WorkflowState,
  expiresInDays:   number | null = 30,
  notes:           string | null = null
): Promise<void> {
  const { error } = await db.rpc('set_client_workflow_state', pruneRpcArgs({
    p_client_id:       clientId,
    p_state:           state,
    p_expires_in_days: expiresInDays ?? undefined,
    p_notes:           notes ?? undefined
  }))
  if (error) throw new Error(error.message)
}

export async function clearClientWorkflowState(clientId: string): Promise<void> {
  const { error } = await db.rpc('clear_client_workflow_state', { p_client_id: clientId })
  if (error) throw new Error(error.message)
}