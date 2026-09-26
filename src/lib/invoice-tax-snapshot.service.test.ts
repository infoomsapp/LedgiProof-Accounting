// The wording an accountant reads when a sales-tax rate is questioned must match
// what the database recorded.

import { describe, it, expect } from 'vitest'
import {
  chargedLabel, taxSnapshotHeadline, taxSnapshotDetail, taxChangedSinceIssue,
  type InvoiceTaxSnapshot
} from '../services/invoice-tax-snapshot.service'

const snap = (over: Partial<InvoiceTaxSnapshot> = {}): InvoiceTaxSnapshot => ({
  status: 'matches_reference', reason: null, destination_state: 'MD', reference_rate: 6,
  reference_jurisdiction: 'Maryland (state rate)', reference_source: 'tax_foundation_2026',
  reference_effective_from: '2026-01-01', as_of_date: '2026-09-26',
  charged: [{ rate: 6, taxable_amount: 1000, tax_amount: 60 }], tax_total: 60, currency: 'USD', ...over
})

describe('tax snapshot wording', () => {
  it('matching states rate, place, date and source', () => {
    expect(taxSnapshotHeadline(snap())).toBe('Sales tax matches the reference rate')
    expect(taxSnapshotDetail(snap()))
      .toBe('Charged 6%. Reference: 6% (Maryland (state rate)) on 2026-09-26 · tax_foundation_2026.')
  })
  it('a different rate names both numbers', () => {
    const s = snap({ status: 'manual_override', charged: [{ rate: 7, taxable_amount: 100, tax_amount: 7 }] })
    expect(taxSnapshotHeadline(s)).toBe('Sales tax differs from the reference rate')
    expect(taxSnapshotDetail(s)).toContain('Charged 7%')
    expect(taxSnapshotDetail(s)).toContain('MD is 6%')
  })
  it('review carries the reason', () => {
    const s = snap({ status: 'requires_review', reason: 'The billing address has no state', reference_rate: null })
    expect(taxSnapshotHeadline(s)).toBe('Sales tax needs review')
    expect(taxSnapshotDetail(s)).toContain('has no state')
  })
  it('no tax only nudges when the state has a rate', () => {
    expect(taxSnapshotDetail(snap({ status: 'no_tax', charged: [] }))).toContain('check none is owed')
    expect(taxSnapshotDetail(snap({ status: 'no_tax', charged: [], reference_rate: 0 }))).toBe('Nothing was taxed on this invoice.')
    expect(taxSnapshotDetail(snap({ status: 'no_tax', charged: [], reference_rate: null }))).toBe('Nothing was taxed on this invoice.')
  })
  it('lists every rate charged', () => {
    expect(chargedLabel({ charged: [
      { rate: 6, taxable_amount: 100, tax_amount: 6 }, { rate: 8.25, taxable_amount: 100, tax_amount: 8.25 }] })).toBe('6% and 8.25%')
    expect(chargedLabel({ charged: [] })).toBe('none')
  })
  it('spots tax edited after issue', () => {
    expect(taxChangedSinceIssue({ tax_total: 60 }, 60)).toBe(false)
    expect(taxChangedSinceIssue({ tax_total: 60 }, 60.004)).toBe(false)
    expect(taxChangedSinceIssue({ tax_total: 60 }, 70)).toBe(true)
  })
})
