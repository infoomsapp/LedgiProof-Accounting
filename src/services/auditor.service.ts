// PATH: src/services/auditor.service.ts
// Wrappers around v27 RPCs for ReadOnly (auditor) dashboard.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuditorWorkspace {
  org_id:        string
  name:          string
  slug:          string
  my_role:       'auditor' | 'owner' | 'admin'
  client_count:  number
  tx_count_30d:  number
  tx_count_all:  number
}

export interface AuditorWorkspaceList {
  count:      number
  workspaces: AuditorWorkspace[]
}

export interface AuditSummaryTotals {
  income:             number
  expenses:           number
  net_profit:         number
  transactions_count: number
  first_date:         string | null
  last_date:          string | null
}

export interface AuditSummary {
  org_id:    string
  period:    { from: string; to: string }
  client_id: string | null
  totals:    AuditSummaryTotals
  by_status: Record<string, number>   // { blue: 100, green: 250, amber: 12, red: 3 }
  integrity: {
    workspace_integrity: boolean
    last_verified_at:    string
  }
}

export interface AuditTransaction {
  tx_id:             string
  org_id:            string
  client_id:         string | null
  client_name:       string | null
  transaction_date:  string
  merchant_name:     string | null
  description:       string | null
  amount:            number
  currency:          string
  semaphore:         'blue' | 'green' | 'amber' | 'red'
  review_status:     string
  created_at:        string
  created_by:        string | null
  created_by_name:   string | null
  approved_at:       string | null
  approved_by:       string | null
  approved_by_name:  string | null
  reconciled_at:     string | null
  reconciled_by:     string | null
  reconciled_by_name: string | null
  has_documents:     boolean
  has_messages:      boolean
}

export interface AuditTransactionsPage {
  org_id:       string
  page_size:    number
  returned:     number
  has_more:     boolean
  next_cursor:  string | null
  transactions: AuditTransaction[]
}

export interface AuditFilters {
  date_from?:  string         // YYYY-MM-DD
  date_to?:    string
  client_id?:  string
  semaphore?:  Array<'blue' | 'green' | 'amber' | 'red'>
  min_amount?: number
  max_amount?: number
  search?:     string
}

export interface ActivityEvent {
  event:   'created' | 'approved' | 'reconciled' | 'locked'
  at:      string
  by_id:   string | null
  by_name: string | null
  note:    string | null
}

export interface AuditTransactionActivity {
  tx_id:           string
  org_id:          string
  client_id:       string | null
  current_version: number
  is_current:      boolean
  activity:        ActivityEvent[]
  versions_count:  number
  documents_count: number
  messages_count:  number
}

// ── RPCs ─────────────────────────────────────────────────────────────────────

export async function getAuditorWorkspaces(): Promise<AuditorWorkspaceList> {
  const { data, error } = await db.rpc('get_auditor_workspaces')
  if (error) throw new Error(error.message)
  return data as unknown as AuditorWorkspaceList
}

export async function getAuditSummary(
  orgId:    string,
  filters:  Pick<AuditFilters, 'date_from' | 'date_to' | 'client_id'> = {}
): Promise<AuditSummary> {
  const { data, error } = await db.rpc('get_audit_summary', pruneRpcArgs({
    p_org_id:    orgId,
    p_date_from: filters.date_from ?? undefined,
    p_date_to:   filters.date_to   ?? undefined,
    p_client_id: filters.client_id ?? undefined
  }))
  if (error) throw new Error(error.message)
  return data as unknown as AuditSummary
}

export async function getAuditTransactions(
  orgId:   string,
  filters: AuditFilters = {},
  cursor?: string | null,
  limit    = 200
): Promise<AuditTransactionsPage> {
  const { data, error } = await db.rpc('get_audit_transactions', pruneRpcArgs({
    p_org_id:     orgId,
    p_date_from:  filters.date_from  ?? undefined,
    p_date_to:    filters.date_to    ?? undefined,
    p_client_id:  filters.client_id  ?? undefined,
    p_semaphore:  filters.semaphore  ?? undefined,
    p_min_amount: filters.min_amount ?? undefined,
    p_max_amount: filters.max_amount ?? undefined,
    p_search:     filters.search     ?? undefined,
    p_cursor:     cursor             ?? undefined,
    p_limit:      Math.min(Math.max(limit, 1), 200)
  }))
  if (error) throw new Error(error.message)
  return data as unknown as AuditTransactionsPage
}

export async function getAuditTransactionActivity(
  txId: string
): Promise<AuditTransactionActivity> {
  const { data, error } = await db.rpc('get_audit_transaction_activity', {
    p_tx_id: txId
  })
  if (error) throw new Error(error.message)
  return data as unknown as AuditTransactionActivity
}

export async function exportAuditCsv(
  orgId:   string,
  filters: AuditFilters = {}
): Promise<string> {
  const { data, error } = await db.rpc('export_audit_csv', pruneRpcArgs({
    p_org_id:     orgId,
    p_date_from:  filters.date_from  ?? undefined,
    p_date_to:    filters.date_to    ?? undefined,
    p_client_id:  filters.client_id  ?? undefined,
    p_semaphore:  filters.semaphore  ?? undefined,
    p_min_amount: filters.min_amount ?? undefined,
    p_max_amount: filters.max_amount ?? undefined,
    p_search:     filters.search     ?? undefined
  }))
  if (error) throw new Error(error.message)
  return data as string
}

// ── Browser helper: trigger CSV download ─────────────────────────────────────

export function downloadCsvBlob(csvText: string, filename: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}