// PATH: src/services/tax-estimator.service.ts
//
// Pure functions to estimate US self-employment quarterly taxes.
// No I/O — just math. Uses tax-tables-2026.ts as data.

import {
  SE_TAX_2026,
  FEDERAL_BRACKETS_2026,
  STANDARD_DEDUCTION_2026,
  SAFE_HARBOR_PCT,
  TAX_TABLES_2026_META,
  type FilingStatus
} from '../lib/tax-tables-2026'
import { formatCurrency } from '../lib/currency'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TaxEstimateInput {
  /** Net profit from Schedule C for the YEAR-TO-DATE (or annualized) */
  netProfit:       number
  /** Filing status — defaults to single */
  filingStatus?:   FilingStatus
  /** Year being computed (for table selection — only 2026 supported today) */
  year?:           number
}

export interface TaxBreakdown {
  netProfit:           number
  // SE tax pieces
  seBase:              number   // netProfit × 0.9235
  socialSecurityTax:   number   // up to wage base × 12.4%
  medicareTax:         number   // base × 2.9%
  additionalMedicare:  number   // 0.9% over threshold (rare for solo)
  totalSeTax:          number   // sum of above
  // Federal income tax pieces
  seDeduction:         number   // half of SE tax (deductible)
  taxableIncome:       number   // netProfit - seDeduction - standard_deduction
  federalIncomeTax:    number   // progressive bracket sum
  // Combined
  totalTax:            number   // seTax + federalTax
  effectiveRate:       number   // totalTax / netProfit
  // For UI
  marginalRate:        number   // top bracket the user hit
  // Provenance / fail-safe — the UI MUST surface a warning when provisional
  taxYear:             number   // tax year of the tables used
  provisional:         boolean  // true when the tables are NOT verified against an official source
  dataSource:          string   // human-readable provenance of the figures
}

export interface QuarterlyEstimate extends TaxBreakdown {
  /** Quarter (1-4) this estimate is for */
  quarter:        number
  /** Total estimated for this Q (with safe-harbor multiplier) */
  quarterlyDue:   number
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: SE Tax (Self-Employment)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes Self-Employment tax per IRS rules.
 *
 * Formula:
 *   1. SE base = netProfit × 0.9235
 *   2. SS tax = min(SE base, wage_base) × 12.4%
 *   3. Medicare = SE base × 2.9%
 *   4. Additional Medicare = max(0, SE base - threshold) × 0.9%
 *
 * Returns 0 if netProfit < $400 (IRS minimum for SE tax filing).
 */
export function computeSeTax(netProfit: number, filingStatus: FilingStatus = 'single'): {
  base:               number
  socialSecurity:     number
  medicare:           number
  additionalMedicare: number
  total:              number
} {
  if (netProfit < 400) {
    return { base: 0, socialSecurity: 0, medicare: 0, additionalMedicare: 0, total: 0 }
  }

  const t = SE_TAX_2026

  const base       = netProfit * t.NET_EARNINGS_MULTIPLIER
  const cappedSS   = Math.min(base, t.SOCIAL_SECURITY_WAGE_BASE)
  const ssTax      = cappedSS * t.SOCIAL_SECURITY_RATE
  const medicare   = base * t.MEDICARE_RATE

  const threshold = filingStatus === 'married_jointly'
    ? t.ADDITIONAL_MEDICARE_THRESHOLD_JOINT
    : t.ADDITIONAL_MEDICARE_THRESHOLD_SINGLE
  const additionalMedicare = Math.max(0, base - threshold) * t.ADDITIONAL_MEDICARE_RATE

  return {
    base,
    socialSecurity:     ssTax,
    medicare,
    additionalMedicare,
    total:              ssTax + medicare + additionalMedicare
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Federal Income Tax (progressive brackets)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes federal income tax using progressive brackets.
 * Returns total tax + marginal rate hit.
 */
export function computeFederalTax(
  taxableIncome: number,
  filingStatus: FilingStatus = 'single'
): { tax: number; marginalRate: number } {
  if (taxableIncome <= 0) return { tax: 0, marginalRate: 0 }

  const brackets = FEDERAL_BRACKETS_2026[filingStatus]
  let remaining = taxableIncome
  let lastUpperBound = 0
  let totalTax = 0
  let marginalRate = brackets[0]?.[0] ?? 0

  for (const [rate, upper] of brackets) {
    if (remaining <= 0) break
    const slice = Math.min(remaining, upper - lastUpperBound)
    totalTax += slice * rate
    marginalRate = rate
    remaining -= slice
    lastUpperBound = upper
  }

  return { tax: totalTax, marginalRate }
}

// ─────────────────────────────────────────────────────────────────────────────
// Master: full breakdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full tax breakdown given a net profit figure (annualized).
 *
 * Logic:
 *   1. Compute SE tax (15.3%-ish on 92.35% of net profit)
 *   2. Half of SE tax is deductible from federal taxable income
 *   3. Subtract standard deduction → taxable income
 *   4. Apply progressive federal brackets
 *   5. Sum
 */
export function estimateAnnualTax(input: TaxEstimateInput): TaxBreakdown {
  const filingStatus = input.filingStatus ?? 'single'
  const netProfit    = Math.max(0, input.netProfit)

  // 1. SE tax
  const se = computeSeTax(netProfit, filingStatus)

  // 2. Half of SE tax is deductible from federal taxable income
  const seDeduction = se.total / 2

  // 3. Taxable income
  const stdDeduction = STANDARD_DEDUCTION_2026[filingStatus]
  const taxableIncome = Math.max(0, netProfit - seDeduction - stdDeduction)

  // 4. Federal tax
  const fed = computeFederalTax(taxableIncome, filingStatus)

  // 5. Sum
  const totalTax = se.total + fed.tax

  return {
    netProfit,
    seBase:             se.base,
    socialSecurityTax:  se.socialSecurity,
    medicareTax:        se.medicare,
    additionalMedicare: se.additionalMedicare,
    totalSeTax:         se.total,
    seDeduction,
    taxableIncome,
    federalIncomeTax:   fed.tax,
    totalTax,
    effectiveRate:      netProfit > 0 ? totalTax / netProfit : 0,
    marginalRate:       fed.marginalRate,
    taxYear:            TAX_TABLES_2026_META.taxYear,
    provisional:        !TAX_TABLES_2026_META.verified,
    dataSource:         TAX_TABLES_2026_META.source
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quarterly estimate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimates the quarterly payment due.
 *
 * Method:
 *   1. Annualize the Q's net profit (× 4 for safe early-year estimate)
 *      OR use YTD if we have multiple quarters of data
 *   2. Compute full annual tax
 *   3. Quarterly portion = annual × 25% × safe_harbor_pct
 *
 * For real precision, the user should provide YTD net profit. The caller
 * is responsible for picking the right input.
 */
export function estimateQuarterlyTax(opts: {
  netProfit:            number    // YTD net profit (or this quarter only)
  quarter:              number    // 1-4
  basis?:               'this_quarter' | 'ytd_annualized'
  filingStatus?:        FilingStatus
}): QuarterlyEstimate {
  const basis        = opts.basis ?? 'this_quarter'
  const quartersDone = Math.max(1, Math.min(4, opts.quarter))

  // Annualize properly
  // - 'this_quarter': multiply by 4 (assume similar income for remaining qts)
  // - 'ytd_annualized': scale up by quartersDone (eg Q2 YTD × 2 = annualized)
  const annualizedNet = basis === 'this_quarter'
    ? opts.netProfit * 4
    : opts.netProfit * (4 / quartersDone)

  const annual = estimateAnnualTax({
    netProfit:    annualizedNet,
    year:         2026,
    ...(opts.filingStatus !== undefined ? { filingStatus: opts.filingStatus } : {})
  })

  // Quarterly: 25% of annual × safe-harbor (90%)
  const quarterlyDue = (annual.totalTax / 4) * SAFE_HARBOR_PCT

  return {
    ...annual,
    quarter:      opts.quarter,
    quarterlyDue
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: friendly format
// ─────────────────────────────────────────────────────────────────────────────

export function formatTax(amount: number): string {
  return formatCurrency(amount, 'USD', { maximumFractionDigits: 0 })
}

export function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}
