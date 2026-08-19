// PATH: src/services/tax-estimator.test.ts
import { describe, it, expect } from 'vitest'
import {
  computeSeTax, computeFederalTax, estimateAnnualTax, estimateQuarterlyTax
} from './tax-estimator.service'

describe('self-employment tax (IRC §1401, 2026 tables)', () => {
  it('is zero below the $400 SE filing floor', () => {
    const se = computeSeTax(399)
    expect(se.total).toBe(0)
  })

  it('$100,000 net profit, single — hand-computed', () => {
    // base = 100000 × 0.9235 = 92,350
    // SS  = 92,350 × 12.4% = 11,451.40 ; Medicare = 92,350 × 2.9% = 2,678.15
    const se = computeSeTax(100_000, 'single')
    expect(se.base).toBeCloseTo(92_350, 2)
    expect(se.socialSecurity).toBeCloseTo(11_451.40, 2)
    expect(se.medicare).toBeCloseTo(2_678.15, 2)
    expect(se.additionalMedicare).toBe(0)
    expect(se.total).toBeCloseTo(14_129.55, 2)
  })

  it('caps Social Security at the wage base ($184,500)', () => {
    // base = 300000 × 0.9235 = 277,050 > 184,500 → SS capped
    const se = computeSeTax(300_000, 'single')
    expect(se.socialSecurity).toBeCloseTo(184_500 * 0.124, 2) // 22,878.00
  })
})

describe('federal income tax (progressive brackets, 2026 single)', () => {
  it('is zero at or below zero taxable income', () => {
    expect(computeFederalTax(0).tax).toBe(0)
    expect(computeFederalTax(-5000).tax).toBe(0)
  })

  it('$76,835.225 taxable, single — bracket-by-bracket (2026)', () => {
    // 10% ×12,400 = 1,240.00 ; 12% ×38,000 = 4,560.00 ; 22% ×26,435.225 = 5,815.7495
    const f = computeFederalTax(76_835.225, 'single')
    expect(f.tax).toBeCloseTo(11_615.75, 2)
    expect(f.marginalRate).toBe(0.22)
  })
})

describe('full annual estimate ($100k net, single)', () => {
  const a = estimateAnnualTax({ netProfit: 100_000, filingStatus: 'single' })

  it('deducts half the SE tax + standard deduction', () => {
    expect(a.seDeduction).toBeCloseTo(7_064.775, 3)
    // taxable = 100,000 − 7,064.775 − 16,100 (2026 std) = 76,835.225
    expect(a.taxableIncome).toBeCloseTo(76_835.225, 3)
  })

  it('sums SE + federal to the expected total', () => {
    expect(a.totalSeTax).toBeCloseTo(14_129.55, 2)
    expect(a.federalIncomeTax).toBeCloseTo(11_615.75, 2)
    expect(a.totalTax).toBeCloseTo(25_745.30, 2)
    expect(a.effectiveRate).toBeCloseTo(0.25745, 4)
  })

  it('stamps the result as verified 2026 (not provisional)', () => {
    expect(a.taxYear).toBe(2026)
    expect(a.provisional).toBe(false)
  })
})

describe('quarterly estimate (safe harbor 90%)', () => {
  it('annualizes this-quarter net and applies 25% × 90%', () => {
    // $25k this quarter × 4 = $100k annual → total 25,745.30
    // quarterly = (25,745.30 / 4) × 0.9 = 5,792.69
    const q = estimateQuarterlyTax({ netProfit: 25_000, quarter: 1, basis: 'this_quarter', filingStatus: 'single' })
    expect(q.quarterlyDue).toBeCloseTo(5_792.69, 2)
    expect(q.quarter).toBe(1)
  })
})
