// PATH: src/lib/money.test.ts
import { describe, it, expect } from 'vitest'
import { computeInvoiceLine, sumInvoice, invoiceBalanceCents, toCents } from './money'

describe('invoice line math (integer cents, mirrors compute_invoice_totals)', () => {
  it('line with 10% discount + 8.5% tax — SQL-verified', () => {
    // 3 × $100, 10% disc → $30, taxable $270, 8.5% tax → $22.95, total $292.95
    const l = computeInvoiceLine({ quantity: 3, unitPrice: 100, discountPct: 10, taxRate: 8.5 })
    expect(l.subtotalCents).toBe(30000)
    expect(l.discountCents).toBe(3000)
    expect(l.taxCents).toBe(2295)
    expect(l.totalCents).toBe(29295)
  })

  it('fractional-cent unit price, no disc/tax', () => {
    const l = computeInvoiceLine({ quantity: 2, unitPrice: 49.99, discountPct: 0, taxRate: 0 })
    expect(l.totalCents).toBe(9998) // $99.98
  })

  it('tax rounds at the cent without binary-float drift', () => {
    // $10.00 × 8.25% = $0.825 → rounds to $0.83 (multiply-before-divide avoids 0.0825 drift)
    const l = computeInvoiceLine({ quantity: 1, unitPrice: 10, discountPct: 0, taxRate: 8.25 })
    expect(l.taxCents).toBe(83)
  })

  it('full invoice totals match the DB smoke test ($392.93)', () => {
    const t = sumInvoice([
      { quantity: 3, unitPrice: 100,   discountPct: 10, taxRate: 8.5 },
      { quantity: 2, unitPrice: 49.99, discountPct: 0,  taxRate: 0 }
    ])
    expect(t.subtotalCents).toBe(39998)      // $399.98
    expect(t.discountTotalCents).toBe(3000)  // $30.00
    expect(t.taxTotalCents).toBe(2295)       // $22.95
    expect(t.totalCents).toBe(39293)         // $392.93
  })
})

describe('payment reconciliation — balance clamps at 0', () => {
  const total = 39293 // $392.93

  it('partial payment leaves exact remainder', () => {
    expect(invoiceBalanceCents(total, toCents(200))).toBe(19293) // $192.93
  })

  it('full payment zeroes the balance', () => {
    expect(invoiceBalanceCents(total, total)).toBe(0)
  })

  it('overpayment never goes negative (mirrors GREATEST(...,0))', () => {
    expect(invoiceBalanceCents(10000, 12000)).toBe(0)
  })
})
