// PATH: src/services/exchange-rate.service.ts
//
// Exchange rate service. Source of truth: exchange_rates table in Supabase.
// Rates are refreshed daily by the fetch-exchange-rates Edge Function.
//
// Rate convention: usd_rate = "1 USD = N of this currency"
// Example: EUR 1.10  →  1 USD = 1.10 EUR  →  €100 = $90.91
//
// FX gain/loss logic lives in src/lib/currency.ts (pure math, no DB calls).

import { db }                  from '../lib/supabase'
import type { ExchangeRates }  from '../lib/currency'
import { dbError } from '../lib/errors'

export interface ExchangeRateRow {
  currency:   string
  usd_rate:   number
  fetched_at: string
}

export interface FxGainLossRow {
  invoice_id:          string
  invoice_number:      string
  client_name:         string
  currency:            string
  invoice_amount:      number
  fx_rate_at_creation: number
  payment_amount:      number
  fx_rate_at_payment:  number
  invoice_basis_usd:   number
  payment_usd:         number
  gain_loss_usd:       number
  payment_date:        string
}

// ── Read all rates ─────────────────────────────────────────────────────────────

export async function getAllExchangeRates(): Promise<ExchangeRateRow[]> {
  // `as any` until supabase gen types runs and exchange_rates appears in Database
  const { data, error } = await (db as any).from('exchange_rates').select('*').order('currency')
  if (error) throw dbError(error, 'Failed to load exchange rates')
  return (data ?? []) as ExchangeRateRow[]
}

export async function getRatesMap(): Promise<ExchangeRates> {
  const rows  = await getAllExchangeRates()
  const rates: ExchangeRates = { USD: 1.0 }
  for (const row of rows) rates[row.currency] = row.usd_rate
  return rates
}

// ── Read a single rate ─────────────────────────────────────────────────────────

export async function getExchangeRate(currency: string): Promise<number | null> {
  if (currency === 'USD') return 1.0
  const { data } = await (db as any).rpc('get_exchange_rate', { p_currency: currency })
  return (data as number | null) ?? null
}

// ── FX snapshot — call at invoice/payment creation time ───────────────────────
// Returns the current usd_rate or null if the currency is unknown.
// Store the returned value in fx_rate_at_creation / fx_rate_at_payment.

export async function snapshotFxRate(currency: string): Promise<number | null> {
  return getExchangeRate(currency)
}

// ── Realized FX gains/losses for an org ───────────────────────────────────────

export async function getFxGainsLosses(orgId: string): Promise<FxGainLossRow[]> {
  const { data, error } = await (db as any).rpc('get_fx_gains_losses', { p_org_id: orgId })
  if (error) throw dbError(error, 'Failed to load FX gains and losses')
  return (data ?? []) as FxGainLossRow[]
}

// ── Trigger a manual rate refresh (calls the Edge Function) ───────────────────

export async function refreshExchangeRates(): Promise<void> {
  const { error } = await db.functions.invoke('fetch-exchange-rates', { body: {} })
  if (error) throw dbError(error, 'Failed to refresh exchange rates')
}
