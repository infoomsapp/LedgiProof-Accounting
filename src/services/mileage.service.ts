// PATH: src/services/mileage.service.ts
//
// Manual mileage entries → IRS business-mileage deduction.
//
// The applied IRS rate and resulting deduction are SNAPSHOTTED per entry at
// save time (via businessMileageRateForDate), so the mid-2026 rate change
// (72.5¢ → 76¢ on Jul 1) is preserved historically — a mile logged in March
// keeps its 72.5¢ even after July. Totals come from a SQL aggregate RPC
// (get_mileage_summary), never a client-side reduce (governance: UI/service
// must not aggregate raw rows).

import { db } from '../lib/supabase'
import { businessMileageRateForDate } from '../lib/tax-tables-2026'

export interface MileageEntry {
  id:          string
  org_id:      string
  client_id:   string | null
  miles:       number
  entry_date:  string
  purpose:     string | null
  category:    string
  rate:        number
  deduction:   number
  created_by:  string
  created_at:  string
}

export interface AddMileageInput {
  orgId:     string
  userId:    string
  miles:     number
  date:      string          // ISO 'YYYY-MM-DD'
  purpose?:  string | null
  clientId?: string | null
}

export interface MileageSummary {
  totalMiles:     number
  totalDeduction: number
  count:          number
}

/**
 * Persist one manual mileage entry. The IRS rate is chosen from the trip date
 * and the deduction is stored alongside it (snapshot), so historical entries
 * keep the rate that applied when they were driven.
 */
export async function addMileageEntry(input: AddMileageInput): Promise<MileageEntry> {
  const rate = businessMileageRateForDate(input.date)
  const deduction = Math.round(input.miles * rate * 100) / 100

  const { data, error } = await db
    .from('mileage_entries')
    .insert({
      org_id:     input.orgId,
      client_id:  input.clientId ?? null,
      miles:      input.miles,
      entry_date: input.date,
      purpose:    input.purpose ?? null,
      category:   'business',
      rate,
      deduction,
      created_by: input.userId
    })
    .select()
    .single()

  if (error || !data) throw new Error(`[Mileage] Save failed: ${error?.message}`)
  return data as MileageEntry
}

/**
 * YTD totals for a year (miles + deduction), computed server-side by the
 * get_mileage_summary RPC. Optional clientId scopes to a firm client.
 */
export async function getMileageSummary(
  orgId:    string,
  year:     number,
  clientId?: string | null
): Promise<MileageSummary> {
  const { data, error } = await db.rpc('get_mileage_summary', {
    p_org_id: orgId,
    p_year:   year,
    ...(clientId ? { p_client_id: clientId } : {})
  })
  if (error) throw new Error(`[Mileage] Summary failed: ${error.message}`)

  const row = (Array.isArray(data) ? data[0] : data) as
    { total_miles: number | string; total_deduction: number | string; entry_count: number } | undefined

  return {
    totalMiles:     Number(row?.total_miles ?? 0),
    totalDeduction: Number(row?.total_deduction ?? 0),
    count:          Number(row?.entry_count ?? 0)
  }
}

/** Recent mileage entries (for a future list view). Newest first. */
export async function listMileageEntries(
  orgId: string,
  year:  number,
  clientId?: string | null,
  limit = 50
): Promise<MileageEntry[]> {
  let q = db
    .from('mileage_entries')
    .select('*')
    .eq('org_id', orgId)
    .gte('entry_date', `${year}-01-01`)
    .lte('entry_date', `${year}-12-31`)
    .order('entry_date', { ascending: false })
    .limit(limit)
  if (clientId) q = q.eq('client_id', clientId)

  const { data, error } = await q
  if (error) throw new Error(`[Mileage] List failed: ${error.message}`)
  return (data ?? []) as MileageEntry[]
}
