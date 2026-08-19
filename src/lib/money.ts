// PATH: src/lib/money.ts
//
// Canonical money math in INTEGER CENTS (Fail-Safe Accounting: never float for
// money). This mirrors the SQL invoice line/total logic (compute_invoice_totals
// + the invoice_items generated columns) so the UI preview always matches what
// the database stores to the cent.
//
// Per-line rounding order matches Postgres NUMERIC: multiply, then divide, then
// round — computing `rate/100` first would introduce binary-float error.

export interface MoneyLineInput {
  quantity:    number   // may be fractional
  unitPrice:   number   // dollars
  discountPct: number   // 0..100
  taxRate:     number   // 0..100
}

export interface MoneyLine {
  subtotalCents: number
  discountCents: number
  taxCents:      number
  totalCents:    number
}

export interface MoneyInvoiceTotals {
  subtotalCents:      number
  discountTotalCents: number
  taxTotalCents:      number
  totalCents:         number
}

export function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

/** One invoice line, computed in integer cents. Mirrors invoice_items columns. */
export function computeInvoiceLine(input: MoneyLineInput): MoneyLine {
  const unitCents     = toCents(input.unitPrice)
  const subtotalCents = Math.round(input.quantity * unitCents)
  const discountCents = Math.round((subtotalCents * input.discountPct) / 100)
  const taxableCents  = subtotalCents - discountCents
  const taxCents      = Math.round((taxableCents * input.taxRate) / 100)
  const totalCents    = taxableCents + taxCents
  return { subtotalCents, discountCents, taxCents, totalCents }
}

/** Invoice-level totals = Σ of each line's computed cents. Mirrors compute_invoice_totals. */
export function sumInvoice(lines: MoneyLineInput[]): MoneyInvoiceTotals {
  return lines.reduce<MoneyInvoiceTotals>((acc, l) => {
    const c = computeInvoiceLine(l)
    return {
      subtotalCents:      acc.subtotalCents      + c.subtotalCents,
      discountTotalCents: acc.discountTotalCents + c.discountCents,
      taxTotalCents:      acc.taxTotalCents      + c.taxCents,
      totalCents:         acc.totalCents         + c.totalCents
    }
  }, { subtotalCents: 0, discountTotalCents: 0, taxTotalCents: 0, totalCents: 0 })
}

/** Outstanding balance. Mirrors SQL GREATEST(total - amount_paid, 0) — never negative. */
export function invoiceBalanceCents(totalCents: number, paidCents: number): number {
  return Math.max(totalCents - paidCents, 0)
}
