// PATH: src/services/period.service.ts
// Manages accounting period lifecycle: OPEN → ADJUSTMENT → CLOSED.
// Absence of a row in period_controls means the period is implicitly OPEN
// (the DB trigger and get_period_status() RPC both default to OPEN).

import { db } from '../lib/supabase'

export type PeriodStatus = 'OPEN' | 'ADJUSTMENT' | 'CLOSED'

export interface PeriodControl {
  org_id:       string
  client_id:    string
  period_year:  number
  period_month: number
  status:       PeriodStatus
  updated_by:   string
  updated_at:   string
  reason:       string | null
  created_at:   string
}

const NEXT_STATUS: Record<PeriodStatus, PeriodStatus | null> = {
  OPEN:        'ADJUSTMENT',
  ADJUSTMENT:  'CLOSED',
  CLOSED:      null,
}

// Returns all period_controls rows for (org, client, year).
// Months without a row are implicitly OPEN — callers should use
// `buildYearGrid()` to get a full 12-month picture.
export async function getPeriodControls(
  orgId:    string,
  clientId: string,
  year:     number
): Promise<PeriodControl[]> {
  const { data, error } = await db
    .from('period_controls')
    .select('*')
    .eq('org_id',      orgId)
    .eq('client_id',   clientId)
    .eq('period_year', year)
    .order('period_month')

  if (error) throw new Error(`[Period] Load failed: ${error.message}`)
  return (data ?? []) as PeriodControl[]
}

// Returns the effective status for a single period (falls back to RPC which
// defaults to OPEN when no row exists).
export async function getPeriodStatus(
  orgId:    string,
  clientId: string,
  year:     number,
  month:    number
): Promise<PeriodStatus> {
  const isoDate = `${year}-${String(month).padStart(2, '0')}-01`
  const { data, error } = await db.rpc('get_period_status', {
    p_org_id:    orgId,
    p_client_id: clientId,
    p_date:      isoDate
  })
  if (error) throw new Error(`[Period] Status check failed: ${error.message}`)
  return (data as PeriodStatus) ?? 'OPEN'
}

// Advances period one step: OPEN → ADJUSTMENT → CLOSED.
// Throws if already CLOSED (reopening requires super_admin — use reopenPeriod).
export async function advancePeriod(
  orgId:    string,
  clientId: string,
  year:     number,
  month:    number,
  userId:   string,
  reason?:  string
): Promise<PeriodControl> {
  const current = await getPeriodStatus(orgId, clientId, year, month)
  const next    = NEXT_STATUS[current]
  if (!next) throw new Error('[Period] Period is already CLOSED')

  const { data, error } = await db
    .from('period_controls')
    .upsert({
      org_id:       orgId,
      client_id:    clientId,
      period_year:  year,
      period_month: month,
      status:       next,
      updated_by:   userId,
      reason:       reason ?? null
    }, { onConflict: 'org_id,client_id,period_year,period_month' })
    .select()
    .single()

  if (error) throw new Error(`[Period] Advance failed: ${error.message}`)
  return data as PeriodControl
}

// Reverts a period to OPEN. DB trigger enforces this is super_admin only.
export async function reopenPeriod(
  orgId:    string,
  clientId: string,
  year:     number,
  month:    number,
  userId:   string,
  reason:   string
): Promise<PeriodControl> {
  if (!reason.trim()) throw new Error('[Period] Reason required to reopen a closed period')

  const { data, error } = await db
    .from('period_controls')
    .upsert({
      org_id:       orgId,
      client_id:    clientId,
      period_year:  year,
      period_month: month,
      status:       'OPEN',
      updated_by:   userId,
      reason:       reason.trim()
    }, { onConflict: 'org_id,client_id,period_year,period_month' })
    .select()
    .single()

  if (error) throw new Error(`[Period] Reopen failed: ${error.message}`)
  return data as PeriodControl
}

// Builds a 12-month grid for the UI — merges DB rows with implicit OPEN defaults.
export function buildYearGrid(
  year:  number,
  rows:  PeriodControl[]
): Array<{ month: number; label: string; status: PeriodStatus; row: PeriodControl | null }> {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const row   = rows.find(r => r.period_month === month) ?? null
    return {
      month,
      label:  `${MONTHS[i]} ${year}`,
      status: row?.status ?? 'OPEN',
      row
    }
  })
}
