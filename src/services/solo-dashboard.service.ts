// PATH: src/services/solo-dashboard.service.ts
// Wrappers around v21 RPCs for Solo Dashboard.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'

// ── Types: get_solo_dashboard ────────────────────────────────────────────────

export interface SoloPeriod {
  quarter_start:    string  // ISO date
  quarter_end:      string
  quarter_due_date: string  // IRS Form 1040-ES deadline
  year_start:       string
  year_end:         string
}

export interface SoloKpiBlock {
  income:     number
  expenses:   number
  net_profit: number
  margin_pct: number
  tx_count:   number
}

export interface SoloPending {
  amber: number
  red:   number
  total: number
}

export interface SoloRecentTx {
  tx_id:            string
  description:      string | null
  merchant:         string | null
  amount:           number
  semaphore:        'blue' | 'green' | 'amber' | 'red'
  transaction_date: string
  created_at:       string
  requires_review:  boolean
}

export interface SoloProfile {
  workspace_kind: 'solo' | 'pro' | null
  display_name:   string | null
  state_code:     string | null
}

export interface SoloDashboardData {
  generated_at:    string
  org_id:          string
  year:            number
  quarter:         number          // 1-4
  period:          SoloPeriod
  quarter_kpis:    SoloKpiBlock    // ← renamed from 'quarter' to avoid clash
  ytd:             SoloKpiBlock
  pending:         SoloPending
  recent_tx:       SoloRecentTx[]
  profile:         SoloProfile
  error?:          string
}

// NOTE: The RPC returns the KPI block under the key "quarter" (alongside
// the quarter number). The service maps it to `quarter_kpis` in the
// wrapper below for cleaner consumption.

// ── Types: get_schedule_c_data ───────────────────────────────────────────────

export interface ScheduleCAccount {
  account_id:   string
  account_code: string
  account_name: string
  amount:       number
}

export interface ScheduleCLine {
  line_number:  number
  account_type: 'income' | 'expense'
  accounts:     ScheduleCAccount[]
  line_total:   number
}

export interface ScheduleCUnmapped {
  account_id:   string
  account_code: string
  account_name: string
  account_type: 'income' | 'expense'
  amount:       number
}

export interface ScheduleCTotals {
  gross_receipts: number  // Line 1
  total_expenses: number  // Lines 8-27
  net_profit:     number  // Line 31
}

export interface ScheduleCData {
  org_id:   string
  year:     number
  lines:    ScheduleCLine[]
  unmapped: ScheduleCUnmapped[]
  totals:   ScheduleCTotals
}

// ── RPCs ─────────────────────────────────────────────────────────────────────

// ── Solo — cargos recurrentes (suscripciones) ───────────────────────────────

export interface RecurringCharge {
  display:         string
  months:          number
  occurrences:     number
  avg_amount:      number
  annual_estimate: number
  last_charge:     string
}

export async function getRecurringSubscriptions(orgId: string): Promise<RecurringCharge[]> {
  const { data, error } = await db.rpc('rpc_solo_recurring', { p_org_id: orgId })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as RecurringCharge[]
}

export async function getSoloDashboard(
  orgId:   string,
  year?:   number,
  quarter?: number
): Promise<SoloDashboardData> {
  const { data, error } = await db.rpc('get_solo_dashboard', pruneRpcArgs({
    p_org_id:  orgId,
    p_year:    year ?? undefined,
    p_quarter: quarter ?? undefined
  }))
  if (error) throw new Error(error.message)

  // RPC now returns quarter_kpis directly (see migration
  // fix_get_solo_dashboard_quarter_key_collision) — no remap needed.
  const raw = data as unknown as SoloDashboardData
  return {
    generated_at: raw.generated_at,
    org_id:       raw.org_id,
    year:         raw.year,
    quarter:      raw.quarter,
    period:       raw.period,
    quarter_kpis: raw.quarter_kpis,
    ytd:          raw.ytd,
    pending:      raw.pending,
    recent_tx:    raw.recent_tx ?? [],
    profile:      raw.profile ?? {},
    ...(raw.error !== undefined ? { error: raw.error } : {})
  }
}

export async function getScheduleCData(
  orgId: string,
  year?: number
): Promise<ScheduleCData> {
  const { data, error } = await db.rpc('get_schedule_c_data', pruneRpcArgs({
    p_org_id: orgId,
    p_year:   year ?? undefined
  }))
  if (error) throw new Error(error.message)
  return data as unknown as ScheduleCData
}

// ── Schedule C line labels (official IRS Form 1040 Schedule C 2026) ─────────

export const SCHEDULE_C_LINE_LABELS: Record<number, string> = {
  1:  'Gross receipts',
  8:  'Advertising',
  9:  'Car and truck expenses',
  10: 'Commissions and fees',
  11: 'Contract labor',
  12: 'Depletion',
  13: 'Depreciation',
  14: 'Employee benefit programs',
  15: 'Insurance (other than health)',
  16: 'Interest',
  17: 'Legal and professional services',
  18: 'Office expense',
  19: 'Pension and profit-sharing',
  20: 'Rent or lease',
  21: 'Repairs and maintenance',
  22: 'Supplies',
  23: 'Taxes and licenses',
  24: 'Travel and meals',
  25: 'Utilities',
  26: 'Wages',
  27: 'Other expenses',
  31: 'Net profit'
}