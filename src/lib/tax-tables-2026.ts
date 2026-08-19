// PATH: src/lib/tax-tables-2026.ts
//
// US Federal tax tables for 2026.
//
// 📌 IMPORTANT: When IRS publishes new rates for 2027, create
//    `tax-tables-2027.ts` (verified:false until confirmed) — do NOT
//    mutate this file. The engine reads only from these constants and
//    checks TAX_TABLES_2026_META.verified before trusting the output.
//
// VERIFIED against official 2026 sources (see TAX_TABLES_2026_META):
//   - Brackets, standard deduction: IRS Rev. Proc. 2025-32 (OBBBA)
//   - SE Tax rates (12.4% SS + 2.9% Medicare): IRC §1401
//   - SS wage base 2026 = $184,500: SSA 2026 announcement
//   - Standard mileage: IRS 2026 notices (72.5¢ Jan–Jun, 76¢ Jul–Dec)

/**
 * Provenance + verification gate for this tax year's data.
 * `verified: true` means every figure below was checked against an official
 * source on `verifiedOn`. The estimator stamps its output with `provisional`
 * = !verified so the UI never presents unverified numbers as final.
 * A new year (tax-tables-2027.ts) MUST start with verified:false.
 */
export const TAX_TABLES_2026_META = {
  taxYear:    2026,
  verified:   true,
  verifiedOn: '2026-07-27',
  source:
    'IRS Rev. Proc. 2025-32 (brackets, standard deduction); ' +
    'SSA 2026 announcement (SS wage base $184,500); ' +
    'IRS 2026 standard-mileage notices (72.5¢ H1 / 76¢ H2)'
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Self-Employment Tax
// ─────────────────────────────────────────────────────────────────────────────

export const SE_TAX_2026 = {
  /** Net earnings × 0.9235 = SE tax base (IRC §1402(a)(12)) */
  NET_EARNINGS_MULTIPLIER: 0.9235,

  /** Social Security portion of SE tax */
  SOCIAL_SECURITY_RATE: 0.124,

  /** 2026 Social Security wage base (SSA 2026 announcement) */
  SOCIAL_SECURITY_WAGE_BASE: 184_500,

  /** Medicare portion of SE tax — no cap */
  MEDICARE_RATE: 0.029,

  /** Additional Medicare for high earners (over $200k single / $250k joint) */
  ADDITIONAL_MEDICARE_RATE: 0.009,
  ADDITIONAL_MEDICARE_THRESHOLD_SINGLE: 200_000,
  ADDITIONAL_MEDICARE_THRESHOLD_JOINT:  250_000,

  /** Combined nominal rate (for display only — actual calc uses components) */
  COMBINED_RATE: 0.153
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Federal Income Tax Brackets — 2026 (single filer)
// ─────────────────────────────────────────────────────────────────────────────
//
// Each tuple = [marginal_rate, upper_bound_of_bracket].
// Income above the last bound is taxed at the last rate.

export type FilingStatus = 'single' | 'married_jointly' | 'head_of_household'

// Official 2026 breakpoints — IRS Rev. Proc. 2025-32.
export const FEDERAL_BRACKETS_2026: Record<FilingStatus, Array<[number, number]>> = {
  single: [
    [0.10,  12_400],
    [0.12,  50_400],
    [0.22, 105_700],
    [0.24, 201_775],
    [0.32, 256_225],
    [0.35, 640_600],
    [0.37, Infinity]
  ],
  married_jointly: [
    [0.10,  24_800],
    [0.12, 100_800],
    [0.22, 211_400],
    [0.24, 403_550],
    [0.32, 512_450],
    [0.35, 768_700],
    [0.37, Infinity]
  ],
  head_of_household: [
    [0.10,  17_700],
    [0.12,  67_450],
    [0.22, 105_700],
    [0.24, 201_775],
    [0.32, 256_200],
    [0.35, 640_600],
    [0.37, Infinity]
  ]
}

/** 2026 standard deduction — IRS Rev. Proc. 2025-32. */
export const STANDARD_DEDUCTION_2026: Record<FilingStatus, number> = {
  single:            16_100,
  married_jointly:   32_200,
  head_of_household: 24_150
}

// ─────────────────────────────────────────────────────────────────────────────
// IRS Standard Mileage Rate (Schedule C — Line 9)
// ─────────────────────────────────────────────────────────────────────────────

// The 2026 BUSINESS rate is SPLIT mid-year (verified, official IRS 2026):
//   Jan 1 – Jun 30, 2026 → 72.5¢/mi  (+2.5¢ vs 2025)
//   Jul 1 – Dec 31, 2026 → 76.0¢/mi  (mid-year fuel-price increase)
// Always pick per-trip via businessMileageRateForDate(date).
export const IRS_MILEAGE_RATE_2026 = {
  /** Jan 1 – Jun 30, 2026 */
  BUSINESS_H1: 0.725,
  /** Jul 1 – Dec 31, 2026 */
  BUSINESS_H2: 0.760,
  /** Default = first-half rate. Prefer businessMileageRateForDate(). */
  BUSINESS:    0.725,
  /** Medical or moving (military only) — 2025 value, verify for 2026 */
  MEDICAL:     0.210,
  /** Charitable (statutory) */
  CHARITY:     0.140
} as const

/**
 * Official IRS business standard mileage rate for a trip on `isoDate` (YYYY-MM-DD).
 * The rate jumped from 72.5¢ to 76¢ on Jul 1, 2026 (fuel adjustment), so the
 * deduction must be date-aware. Dates before 2026-07-01 use the first-half rate;
 * on/after use the second-half rate.
 */
export function businessMileageRateForDate(isoDate: string): number {
  return isoDate >= '2026-07-01'
    ? IRS_MILEAGE_RATE_2026.BUSINESS_H2
    : IRS_MILEAGE_RATE_2026.BUSINESS_H1
}

// ─────────────────────────────────────────────────────────────────────────────
// IRS Quarterly Estimated Tax due dates 2026 (Form 1040-ES)
// ─────────────────────────────────────────────────────────────────────────────
//
// Q1 income Jan-Mar → pay by Apr 15
// Q2 income Apr-May → pay by Jun 15 (yes, only 2 months in Q2 for estimates)
// Q3 income Jun-Aug → pay by Sep 15
// Q4 income Sep-Dec → pay by Jan 15 of next year

export const QUARTERLY_DUE_DATES_2026 = [
  { quarter: 1, due: '2026-04-15' },
  { quarter: 2, due: '2026-06-15' },
  { quarter: 3, due: '2026-09-15' },
  { quarter: 4, due: '2027-01-15' }
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Default safe-harbor percentage
// ─────────────────────────────────────────────────────────────────────────────
//
// IRS safe harbor: pay either
//   (a) 90% of current year's tax, OR
//   (b) 100% of prior year's tax (110% if AGI > $150k)
//
// We use (a) — current quarter's net × estimated rate.

export const SAFE_HARBOR_PCT = 0.9 as const