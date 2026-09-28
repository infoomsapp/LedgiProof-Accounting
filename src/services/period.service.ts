// PATH: src/services/period.service.ts
// Month-end close, QuickBooks/Xero style: a closing date per set of books.
//   · closeBooksThrough(y, m)  closes that month and every earlier one with
//     activity (close_books_through). Refused while transactions in the
//     period wait in For review (LP003) or a draft journal batch is dated in
//     it (LP004). Needs the plan's period_closing feature (LQ008).
//   · reopenBooksFrom(y, m, reason)  owner/admin moves the closing date back:
//     that month and every later one reopen (reopen_books_from, LP005/LP006).
// Works for the workspace's own books (clientId null) and a firm's client
// books. period_controls is read-only to the app; only those two RPCs write it.
// A month without a row is OPEN.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'

export type PeriodStatus = 'OPEN' | 'ADJUSTMENT' | 'CLOSED'

export interface PeriodControl {
  id:           string
  org_id:       string
  client_id:    string | null
  period_year:  number
  period_month: number
  status:       PeriodStatus
  updated_by:   string
  updated_at:   string
  reason:       string | null
  created_at:   string
}

export interface CloseChecklist {
  through:              string
  /** Blocking: bank transactions up to that date not yet categorized. */
  to_review:            number
  /** Blocking: draft manual journal batches dated up to then. */
  draft_batches:        number
  /** Informational: open reconciliation sessions ending by then. */
  open_reconciliations: number
  closed_through:       string | null
}

export async function getPeriodControls(orgId: string, clientId: string | null, year: number): Promise<PeriodControl[]> {
  let q = db.from('period_controls').select('*').eq('org_id', orgId).eq('period_year', year)
  q = clientId ? q.eq('client_id', clientId) : q.is('client_id', null)
  const { data, error } = await q.order('period_month')
  if (error) throw dbError(error, 'Could not load the periods')
  return (data ?? []) as unknown as PeriodControl[]
}

export async function getCloseChecklist(orgId: string, clientId: string | null, year: number, month: number): Promise<CloseChecklist> {
  const { data, error } = await db.rpc('get_close_checklist', {
    p_org_id: orgId, p_client_id: clientId as string, p_year: year, p_month: month,
  })
  if (error) throw dbError(error, 'Could not check the period')
  return data as unknown as CloseChecklist
}

export async function closeBooksThrough(orgId: string, clientId: string | null, year: number, month: number) {
  const { data, error } = await db.rpc('close_books_through', {
    p_org_id: orgId, p_client_id: clientId as string, p_year: year, p_month: month,
  })
  if (error) throw dbError(error, 'Could not close the books')
  return data as unknown as { closed_through: string; months_closed: number; open_reconciliations: number }
}

export async function reopenBooksFrom(orgId: string, clientId: string | null, year: number, month: number, reason: string) {
  const { data, error } = await db.rpc('reopen_books_from', {
    p_org_id: orgId, p_client_id: clientId as string, p_year: year, p_month: month, p_reason: reason,
  })
  if (error) throw dbError(error, 'Could not reopen the books')
  return data as unknown as { reopened_from: string; months_reopened: number }
}

// A 12-month grid for the UI: DB rows merged with implicit OPEN months.
export function buildYearGrid(
  year: number,
  rows: PeriodControl[]
): Array<{ month: number; label: string; status: PeriodStatus; row: PeriodControl | null }> {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const row   = rows.find(r => r.period_month === month) ?? null
    return { month, label: `${MONTHS[i]} ${year}`, status: row?.status ?? 'OPEN', row }
  })
}
