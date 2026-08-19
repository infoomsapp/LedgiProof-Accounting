// PATH: src/services/journal.test.ts
// Worked-examples for the double-entry guard (validateBalance). Pure, no DB.
import { describe, it, expect } from 'vitest'
import { validateBalance, type JournalLine } from './journal.service'

const D = (amount: number): JournalLine => ({ accountId: 'a', entryType: 'debit',  amount })
const C = (amount: number): JournalLine => ({ accountId: 'b', entryType: 'credit', amount })

describe('journal validateBalance — debits must equal credits', () => {
  it('passes when debits === credits', () => {
    expect(() => validateBalance([D(100), C(100)])).not.toThrow()
  })

  it('passes with multiple lines that net to balance', () => {
    expect(() => validateBalance([D(60), D(40), C(100)])).not.toThrow()
  })

  it('throws when debits ≠ credits', () => {
    expect(() => validateBalance([D(100), C(90)])).toThrow(/Unbalanced/)
  })

  it('requires at least two lines', () => {
    expect(() => validateBalance([D(100)])).toThrow(/at least 2 lines/)
    expect(() => validateBalance([])).toThrow(/at least 2 lines/)
  })

  it('is float-safe: 0.1 + 0.2 balances against 0.3', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in binary float; the cents-rounded
    // comparison must still treat this as balanced.
    expect(() => validateBalance([D(0.1), D(0.2), C(0.3)])).not.toThrow()
  })

  it('rejects a sub-cent imbalance beyond rounding', () => {
    expect(() => validateBalance([D(100.01), C(100.00)])).toThrow(/Unbalanced/)
  })
})
