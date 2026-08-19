// PATH: src/services/setaside.service.ts
//
// Solo — Apartado de impuestos (tax set-aside). Recomienda apartar un % de la
// ganancia y trackea los aportes reales. Ahorro, no tax-prep.

import { db } from '../lib/supabase'

export interface SetAsideSummary {
  totalSetAside: number
  entryCount:    number
  rate:          number   // 0..1
}

export interface SetAsideEntry {
  id:         string
  amount:     number
  entry_date: string
  note:       string | null
}

export async function getSetAsideSummary(
  orgId: string, year: number, clientId?: string | null
): Promise<SetAsideSummary> {
  const { data, error } = await db.rpc('get_tax_setaside_summary', {
    p_org_id: orgId, p_year: year,
    ...(clientId ? { p_client_id: clientId } : {})
  })
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0]
  return {
    totalSetAside: Number(row?.total_set_aside ?? 0),
    entryCount:    Number(row?.entry_count ?? 0),
    rate:          Number(row?.setaside_rate ?? 0.30)
  }
}

export async function listSetAsideEntries(
  orgId: string, year: number, clientId?: string | null
): Promise<SetAsideEntry[]> {
  let q = db.from('tax_setaside_entries')
    .select('id, amount, entry_date, note')
    .eq('org_id', orgId)
    .gte('entry_date', `${year}-01-01`)
    .lte('entry_date', `${year}-12-31`)
  if (clientId) q = q.eq('client_id', clientId)
  const { data, error } = await q.order('entry_date', { ascending: false }).limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []) as SetAsideEntry[]
}

export async function addSetAside(input: {
  orgId:    string
  userId:   string
  amount:   number
  date:     string
  note?:    string
  clientId?: string | null
}): Promise<void> {
  const { error } = await db.from('tax_setaside_entries').insert({
    org_id:     input.orgId,
    user_id:    input.userId,
    amount:     input.amount,
    entry_date: input.date,
    ...(input.note ? { note: input.note } : {}),
    ...(input.clientId ? { client_id: input.clientId } : {})
  })
  if (error) throw new Error(error.message)
}

/** Actualiza el % de apartado del org (0..1). */
export async function updateSetAsideRate(orgId: string, rate: number): Promise<void> {
  const { error } = await db.from('organizations')
    .update({ tax_setaside_rate: rate })
    .eq('id', orgId)
  if (error) throw new Error(error.message)
}
