// PATH: src/services/sales-tax.service.ts
//
// Sales-tax engine (phase 1). Rate resolution behind a swappable provider
// interface, exactly like the KBA adapter pattern:
//   · TableProvider  — the versioned `sales_tax_rates` reference table via the
//     resolve_sales_tax_rate RPC. Works TODAY with no external keys.
//   · AvalaraProvider — a stub. Drop the real AvaTax call in when the account
//     + license key exist; callers never change because the return shape is
//     identical.
//
// `ratePct` is a percentage (0..100), so it drops straight into
// invoice_items.tax_rate when we wire the auto-fill (a later phase).

import { db } from '../lib/supabase'
import type { SalesTaxSourcing, SalesTaxProviderName } from '../types/database.types'
import { dbError } from '../lib/errors'

export type { SalesTaxSourcing, SalesTaxProviderName }

export interface SalesTaxSettings {
  org_id:               string
  collects_sales_tax:   boolean
  sourcing:             SalesTaxSourcing
  provider:             SalesTaxProviderName
  avalara_company_code: string | null
  default_category:     string
}

export interface SalesTaxAddress {
  state:       string | null      // 2-letter destination (or origin) state
  postalCode?: string | null
  country?:    string             // defaults 'US'
}

export interface SalesTaxResult {
  collecting:     boolean
  ratePct:        number                          // 0..100, ready for tax_rate
  jurisdiction?:  string | null
  category?:      string
  source?:        string
  effectiveFrom?: string | null
  provider:       SalesTaxProviderName | 'none'
  note?:          string                          // e.g. 'no_rate_on_file'
}

/** Swappable provider. Add a new implementation without touching callers. */
export interface SalesTaxProvider {
  readonly name: SalesTaxProviderName
  resolve(orgId: string, addr: SalesTaxAddress, date: string, category?: string): Promise<SalesTaxResult>
}

// ── Table provider: versioned sales_tax_rates via SQL resolver ───────────────
export const tableProvider: SalesTaxProvider = {
  name: 'table',
  async resolve(orgId, addr, date, category) {
    const { data, error } = await db.rpc('resolve_sales_tax_rate', {
      p_org_id: orgId,
      p_state:  addr.state ?? '',
      p_date:   date,
      ...(addr.postalCode ? { p_postal:  addr.postalCode } : {}),
      ...(category        ? { p_category: category }        : {}),
      ...(addr.country    ? { p_country:  addr.country }    : {})
    })
    if (error) throw dbError(error, 'Failed to look up the sales tax rate')
    const r = data as unknown as Record<string, unknown>
    if (r?.error) throw new Error(String(r.error))
    return {
      collecting:   !!r.collecting,
      ratePct:      Number(r.rate ?? 0),
      jurisdiction: (r.jurisdiction as string | null) ?? null,
      provider:     'table',
      ...(r.category       != null ? { category:      String(r.category) }       : {}),
      ...(r.source         != null ? { source:        String(r.source) }         : {}),
      ...(r.effective_from != null ? { effectiveFrom: String(r.effective_from) } : {}),
      ...(r.note           != null ? { note:          String(r.note) }           : {})
    }
  }
}

// ── Avalara (AvaTax) provider — STUB ─────────────────────────────────────────
export class AvalaraNotConfiguredError extends Error {
  constructor() {
    super('Avalara (AvaTax) is not configured — set the company code + API credentials to enable live rates.')
    this.name = 'AvalaraNotConfiguredError'
  }
}

export const avalaraProvider: SalesTaxProvider = {
  name: 'avalara',
  async resolve() {
    // When credentials exist, POST the ship-to address + line items + company
    // code to AvaTax `POST /api/v2/transactions/create` (or `tax/byaddress`),
    // then map the response's combined rate → ratePct and jurisdiction names.
    // Same SalesTaxResult shape → callers are unchanged.
    throw new AvalaraNotConfiguredError()
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────
export async function getSalesTaxSettings(orgId: string): Promise<SalesTaxSettings | null> {
  const { data, error } = await db
    .from('sales_tax_settings').select('*').eq('org_id', orgId).maybeSingle()
  if (error) throw dbError(error, 'Failed to load sales tax settings')
  return (data as SalesTaxSettings | null) ?? null
}

export async function upsertSalesTaxSettings(
  orgId: string,
  patch: Partial<Omit<SalesTaxSettings, 'org_id'>> & { updatedBy?: string }
): Promise<void> {
  const { updatedBy, ...rest } = patch
  const { error } = await db.from('sales_tax_settings').upsert({
    org_id: orgId,
    ...rest,
    ...(updatedBy ? { updated_by: updatedBy } : {}),
    updated_at: new Date().toISOString()
  })
  if (error) throw dbError(error, 'Failed to save sales tax settings')
}

// ── Dispatcher: pick the provider from org settings ──────────────────────────
export async function resolveSalesTax(
  orgId:    string,
  addr:     SalesTaxAddress,
  date:     string = new Date().toISOString().slice(0, 10),
  category?: string
): Promise<SalesTaxResult> {
  const settings = await getSalesTaxSettings(orgId)
  if (!settings || !settings.collects_sales_tax) {
    return { collecting: false, ratePct: 0, provider: 'none' }
  }
  const provider = settings.provider === 'avalara' ? avalaraProvider : tableProvider
  return provider.resolve(orgId, addr, date, category ?? settings.default_category)
}

// ── Reference-table maintenance (super-admin; RLS enforces) ──────────────────
export interface SalesTaxRateInput {
  country?:       string
  state_code:     string
  postal_code?:   string | null
  jurisdiction_name: string
  category?:      string
  rate:           number          // percentage
  effective_from: string
  effective_to?:  string | null
  source?:        string
  source_url?:    string | null
  published_at?:  string | null
}

export async function upsertSalesTaxRate(input: SalesTaxRateInput): Promise<void> {
  const { error } = await db.from('sales_tax_rates').insert({
    country:           input.country ?? 'US',
    state_code:        input.state_code,
    postal_code:       input.postal_code ?? null,
    jurisdiction_name: input.jurisdiction_name,
    category:          input.category ?? 'general',
    rate:              input.rate,
    effective_from:    input.effective_from,
    effective_to:      input.effective_to ?? null,
    source:            input.source ?? 'manual',
    source_url:        input.source_url ?? null,
    published_at:      input.published_at ?? null
  })
  if (error) throw dbError(error, 'Failed to save the sales tax rate')
}

export interface SalesTaxLookup {
  ratePct:       number
  jurisdiction:  string
  source:        string
  effectiveFrom: string
}

/**
 * Direct reference lookup of the most-specific, in-effect rate for a state
 * (rates are public data → readable by any authenticated user, no org gate).
 * Used by the invoice auto-fill. Picks: ZIP-specific > state-wide, exact
 * category > general, newest effective_from. Returns null if nothing on file.
 */
export async function lookupSalesTaxRate(
  state: string,
  opts?: { postal?: string | null; date?: string; category?: string; country?: string }
): Promise<SalesTaxLookup | null> {
  const date    = opts?.date ?? new Date().toISOString().slice(0, 10)
  const cat     = opts?.category ?? 'general'
  const country = opts?.country ?? 'US'

  const { data, error } = await db
    .from('sales_tax_rates')
    .select('rate, jurisdiction_name, source, effective_from, effective_to, postal_code, category')
    .eq('country', country)
    .eq('state_code', state)
    .lte('effective_from', date)
  if (error) throw dbError(error, 'Failed to look up the sales tax rate')

  const candidates = (data ?? []).filter(r =>
    (r.postal_code === null || r.postal_code === (opts?.postal ?? null)) &&
    (r.category === cat || r.category === 'general') &&
    (r.effective_to === null || r.effective_to >= date)
  )
  if (candidates.length === 0) return null

  candidates.sort((a, b) =>
    Number(b.postal_code !== null) - Number(a.postal_code !== null) ||
    Number(b.category === cat)     - Number(a.category === cat) ||
    (a.effective_from < b.effective_from ? 1 : a.effective_from > b.effective_from ? -1 : 0)
  )
  const w = candidates[0]
  if (!w) return null
  return {
    ratePct:       Number(w.rate),
    jurisdiction:  w.jurisdiction_name,
    source:        w.source,
    effectiveFrom: w.effective_from
  }
}

export async function listSalesTaxRates(state?: string): Promise<SalesTaxRateInput[]> {
  let q = db.from('sales_tax_rates').select('*').order('state_code').order('effective_from', { ascending: false })
  if (state) q = q.eq('state_code', state)
  const { data, error } = await q
  if (error) throw dbError(error, 'Failed to load sales tax rates')
  return (data ?? []) as unknown as SalesTaxRateInput[]
}
