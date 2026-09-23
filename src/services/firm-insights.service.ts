// PATH: src/services/firm-insights.service.ts
//
// QuickBooks-parity insight widgets for the firm dashboards: AR aging, cash
// flow trend, anomalies, and firm P&L. Every number is computed IN SQL by
// get_firm_insights (Constitution: no UI aggregation). Single round-trip.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'

export interface ArBucket { amount: number; count: number }

export interface ArAging {
  generated_at:      string
  total_outstanding: number
  total_count:       number
  buckets: {
    current:  ArBucket
    d1_30:    ArBucket
    d31_60:   ArBucket
    d61_90:   ArBucket
    d90_plus: ArBucket
  }
  error?: string
}

export interface CashflowMonth {
  month:    string   // 'YYYY-MM'
  label:    string   // 'Jan'
  income:   number
  expenses: number
  net:      number
}
export interface CashflowTrend {
  generated_at: string
  months:       CashflowMonth[]
  error?:       string
}

export interface PlLine {
  account_id: string
  code:       string | null
  name:       string
  type:       'income' | 'expense'
  amount:     number
}
export interface FirmPl {
  generated_at:  string
  year:          number
  month:         number | null
  lines:         PlLine[]
  total_income:  number
  total_expense: number
  net_income:    number
  error?:        string
}

export interface FirmAnomalies {
  open:                number
  flagged_this_month:  number
  resolved_this_month: number
}

export interface FirmInsights {
  generated_at: string
  ar_aging:     ArAging
  cashflow:     CashflowTrend
  pl:           FirmPl
  anomalies:    FirmAnomalies
  error?:       string
}

export async function getFirmInsights(
  orgId: string,
  months = 6,
  plYear?: number,
  plMonth?: number
): Promise<FirmInsights> {
  const { data, error } = await db.rpc('get_firm_insights', {
    p_org_id: orgId,
    p_months: months,
    ...(plYear  !== undefined ? { p_pl_year:  plYear  } : {}),
    ...(plMonth !== undefined ? { p_pl_month: plMonth } : {})
  })
  if (error) throw dbError(error, 'Failed to load firm insights')
  return data as unknown as FirmInsights
}
