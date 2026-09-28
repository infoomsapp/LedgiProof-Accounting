// PATH: src/services/reports.service.ts
//
// Phase 4 reports. Every one of them reads the same ledger on the server
// (lp_private.ledger_lines: each journal line with its real date, reversed
// lines and draft batches excluded), so they always agree with each other,
// with the balance sheet and with the dashboard snapshot.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'

export interface PlRow {
  account_id: string
  code:       string
  name:       string
  type:       'income' | 'expense'
  debit:      number
  credit:     number
}

export interface TrialBalanceRow {
  account_id: string
  code:       string
  name:       string
  type:       string
  debit:      number
  credit:     number
}

export interface TrialBalance {
  as_of:        string
  rows:         TrialBalanceRow[]
  total_debit:  number
  total_credit: number
  balanced:     boolean
}

export interface LedgerLine {
  date:           string
  memo:           string | null
  kind:           string
  transaction_id: string | null
  batch_id:       string | null
  debit:          number
  credit:         number
  /** Running balance, debit-positive. */
  balance:        number
}

export interface LedgerAccount {
  account_id:     string
  code:           string
  name:           string
  type:           string
  normal_balance: 'debit' | 'credit'
  /** Debit-positive; flip for credit-normal accounts when displaying. */
  opening:        number
  closing:        number
  lines:          LedgerLine[]
}

export interface GeneralLedger {
  from:     string
  to:       string
  accounts: LedgerAccount[]
}

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'
export const AGING_BUCKETS: { key: AgingBucket; label: string }[] = [
  { key: 'current',  label: 'Current'    },
  { key: 'd1_30',    label: '1–30 days'  },
  { key: 'd31_60',   label: '31–60 days' },
  { key: 'd61_90',   label: '61–90 days' },
  { key: 'd90_plus', label: '90+ days'   },
]

export interface AgingDocument {
  id:            string
  number:        string | null
  party:         string
  date:          string
  due_date:      string
  amount:        number
  days_past_due: number
  bucket:        AgingBucket
}

export interface Aging {
  kind:            'ar' | 'ap'
  as_of:           string
  documents:       AgingDocument[]
  buckets:         Record<AgingBucket, number>
  bucket_counts:   Record<AgingBucket, number>
  total_documents: number
  /** Accounts Receivable / Payable balance in the ledger on as_of. */
  ledger_balance:  number
  /** Ledger balance no open document explains (e.g. imported opening balances). */
  unapplied:       number
}

export interface BooksSnapshot {
  as_of:           string
  owed_to_you:     number
  owed_overdue:    number
  you_owe:         number
  you_owe_overdue: number
  cash:            number
  month:      { from: string; to: string; income: number; expenses: number; profit: number }
  last_month: { income: number; expenses: number; profit: number }
  /** Bank transactions not in the numbers above until categorized. */
  to_review:       number
}

const scopeArg = (clientId: string | null | undefined) => (clientId ? { p_client_id: clientId } : {})

export async function getProfitAndLossRange(orgId: string, from: string, to: string, clientId?: string | null): Promise<PlRow[]> {
  const { data, error } = await db.rpc('get_profit_and_loss_range', { p_org_id: orgId, p_from: from, p_to: to, ...scopeArg(clientId) })
  if (error) throw dbError(error, 'Could not run the profit and loss report')
  return ((data ?? []) as unknown as PlRow[]).map(r => ({ ...r, debit: Number(r.debit), credit: Number(r.credit) }))
}

export async function getTrialBalance(orgId: string, asOf: string, clientId?: string | null): Promise<TrialBalance> {
  const { data, error } = await db.rpc('get_trial_balance', { p_org_id: orgId, p_as_of: asOf, ...scopeArg(clientId) })
  if (error) throw dbError(error, 'Could not run the trial balance')
  return data as unknown as TrialBalance
}

export async function getGeneralLedger(
  orgId: string, from: string, to: string, clientId?: string | null, accountId?: string | null
): Promise<GeneralLedger> {
  const { data, error } = await db.rpc('get_general_ledger', {
    p_org_id: orgId, p_from: from, p_to: to, ...scopeArg(clientId),
    ...(accountId ? { p_account_id: accountId } : {}),
  })
  if (error) throw dbError(error, 'Could not run the general ledger')
  return data as unknown as GeneralLedger
}

export async function getAging(orgId: string, kind: 'ar' | 'ap', asOf: string): Promise<Aging> {
  const { data, error } = await db.rpc('get_aging', { p_org_id: orgId, p_kind: kind, p_as_of: asOf })
  if (error) throw dbError(error, kind === 'ar' ? 'Could not run receivables aging' : 'Could not run payables aging')
  return data as unknown as Aging
}

export async function getBooksSnapshot(orgId: string, clientId?: string | null): Promise<BooksSnapshot> {
  const { data, error } = await db.rpc('get_books_snapshot', { p_org_id: orgId, ...scopeArg(clientId) })
  if (error) throw dbError(error, 'Could not load the snapshot')
  return data as unknown as BooksSnapshot
}

// ── Date ranges ─────────────────────────────────────────────────────────────

export type RangePreset = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' | 'custom'

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'this_month',   label: 'This month'   },
  { key: 'last_month',   label: 'Last month'   },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'last_quarter', label: 'Last quarter' },
  { key: 'this_year',    label: 'This year'    },
  { key: 'last_year',    label: 'Last year'    },
  { key: 'custom',       label: 'Custom'       },
]

/** YYYY-MM-DD in local time (never UTC-shifted). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: Date = new Date()): { from: string; to: string } {
  const y = today.getFullYear()
  const m = today.getMonth()
  const q = Math.floor(m / 3)
  const range = (a: Date, b: Date) => ({ from: isoDate(a), to: isoDate(b) })
  switch (preset) {
    case 'this_month':   return range(new Date(y, m, 1),         new Date(y, m + 1, 0))
    case 'last_month':   return range(new Date(y, m - 1, 1),     new Date(y, m, 0))
    case 'this_quarter': return range(new Date(y, q * 3, 1),     new Date(y, q * 3 + 3, 0))
    case 'last_quarter': return range(new Date(y, q * 3 - 3, 1), new Date(y, q * 3, 0))
    case 'this_year':    return range(new Date(y, 0, 1),         new Date(y, 11, 31))
    case 'last_year':    return range(new Date(y - 1, 0, 1),     new Date(y - 1, 11, 31))
  }
}

/** "Jan 1 – Mar 31, 2026" */
export function formatRange(from: string, to: string): string {
  const f = new Date(from + 'T12:00:00')
  const t = new Date(to + 'T12:00:00')
  const sameYear = f.getFullYear() === t.getFullYear()
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${f.toLocaleDateString('en-US', sameYear ? opts : { ...opts, year: 'numeric' })} – ${t.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}
