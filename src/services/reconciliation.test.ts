// PATH: src/services/reconciliation.test.ts
// Truth table for the auto-clear predicate. Pure, no DB.
import { describe, it, expect } from 'vitest'
import { shouldAutoClear } from './reconciliation.service'

describe('reconciliation shouldAutoClear — bank-feed lines with a reference', () => {
  it('clears a bank_api tx that has a reference', () => {
    expect(shouldAutoClear({ source: 'bank_api', reference: 'plaid_abc123' })).toBe(true)
  })

  it('does NOT clear a bank_api tx without a reference', () => {
    expect(shouldAutoClear({ source: 'bank_api', reference: null })).toBe(false)
    expect(shouldAutoClear({ source: 'bank_api', reference: '' })).toBe(false)
  })

  it('does NOT clear a non-bank-feed tx even with a reference', () => {
    expect(shouldAutoClear({ source: 'manual', reference: 'inv-100' })).toBe(false)
    expect(shouldAutoClear({ source: 'csv_import', reference: 'ref' })).toBe(false)
  })

  it('is null/undefined safe', () => {
    expect(shouldAutoClear(null)).toBe(false)
    expect(shouldAutoClear(undefined)).toBe(false)
    expect(shouldAutoClear({})).toBe(false)
  })
})
