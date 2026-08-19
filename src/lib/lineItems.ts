// PATH: src/lib/lineItems.ts
//
// Shared line-item math for any document made of quantity/price/discount/tax
// rows — invoices and estimates use the exact same formula. Previously
// implemented independently in three places (Invoices.tsx's ItemRow render,
// Invoices.tsx's editorTotals reducer, and types/estimate.ts's own
// calcLineTotals) with no single source of truth. Consolidated here so a
// future formula change (rounding, discount-before-tax ordering, etc.)
// can't silently drift between invoices and estimates again.

export interface LineTotalsInput {
  quantity:     number
  unit_price:   number
  discount_pct: number
  tax_rate:     number
}

export interface LineTotals {
  line_subtotal: number
  line_discount: number
  line_tax:      number
  line_total:    number
}

/** Calculate a single line's totals: discount is applied to the subtotal, tax is applied to the post-discount amount. */
export function calcLineTotals(item: LineTotalsInput): LineTotals {
  const subtotal = (item.quantity || 0) * (item.unit_price || 0)
  const discount = subtotal * (item.discount_pct || 0) / 100
  const tax      = (subtotal - discount) * (item.tax_rate || 0) / 100
  const total    = subtotal - discount + tax
  return {
    line_subtotal: round2(subtotal),
    line_discount: round2(discount),
    line_tax:      round2(tax),
    line_total:    round2(total)
  }
}

/** Sum any array of already-computed line totals (invoice items, estimate items, or plain drafts) into document-level totals. */
export function calcDocumentTotals(items: readonly LineTotals[]): {
  subtotal:       number
  discount_total: number
  tax_total:      number
  total:          number
} {
  return items.reduce(
    (acc, it) => ({
      subtotal:       acc.subtotal       + it.line_subtotal,
      discount_total: acc.discount_total + it.line_discount,
      tax_total:      acc.tax_total      + it.line_tax,
      total:          acc.total          + it.line_total
    }),
    { subtotal: 0, discount_total: 0, tax_total: 0, total: 0 }
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
