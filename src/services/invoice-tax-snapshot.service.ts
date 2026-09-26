// PATH: src/services/invoice-tax-snapshot.service.ts
//
// The sales-tax record of an issued invoice: what was charged and how it compares
// with the reference rate for the billing address on the issue date. Written once
// by the database (capture_invoice_tax_snapshot) when the invoice leaves draft and
// never edited. Only the firm's members can read it.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'

export type TaxSnapshotStatus = 'matches_reference' | 'manual_override' | 'requires_review' | 'no_tax'

export interface ChargedRate { rate: number; taxable_amount: number; tax_amount: number }

export interface InvoiceTaxSnapshot {
  status:                   TaxSnapshotStatus
  reason:                   string | null
  destination_state:        string | null
  reference_rate:           number | null
  reference_jurisdiction:   string | null
  reference_source:         string | null
  reference_effective_from: string | null
  as_of_date:               string
  charged:                  ChargedRate[]
  tax_total:                number
  currency:                 string | null
}

// The generated database types predate this table (same as invoice-reminder.service.ts).
const untyped = db as any

export async function getInvoiceTaxSnapshot(invoiceId: string): Promise<InvoiceTaxSnapshot | null> {
  const { data, error } = await untyped
    .from('invoice_tax_snapshots')
    .select('status, reason, destination_state, reference_rate, reference_jurisdiction, reference_source, reference_effective_from, as_of_date, charged, tax_total, currency')
    .eq('invoice_id', invoiceId)
    .maybeSingle()
  if (error) throw dbError(error, 'Failed to load the sales-tax record')
  if (!data) return null
  const r = data as Record<string, any>
  return {
    ...(r as InvoiceTaxSnapshot),
    reference_rate: r.reference_rate == null ? null : Number(r.reference_rate),
    tax_total:      Number(r.tax_total),
    charged: ((r.charged ?? []) as any[]).map(c => ({
      rate: Number(c.rate), taxable_amount: Number(c.taxable_amount), tax_amount: Number(c.tax_amount)
    }))
  }
}

const pct = (v: number) => `${Number.isInteger(v) ? v : Number(v.toFixed(4))}%`

/** "6%", "6% and 8.25%", or "none". */
export function chargedLabel(s: Pick<InvoiceTaxSnapshot, 'charged'>): string {
  return s.charged.length === 0 ? 'none' : s.charged.map(c => pct(c.rate)).join(' and ')
}

export function taxSnapshotHeadline(s: InvoiceTaxSnapshot): string {
  switch (s.status) {
    case 'matches_reference': return 'Sales tax matches the reference rate'
    case 'manual_override':   return 'Sales tax differs from the reference rate'
    case 'no_tax':            return 'No sales tax charged'
    default:                  return 'Sales tax needs review'
  }
}

/** The facts under the headline, in words. */
export function taxSnapshotDetail(s: InvoiceTaxSnapshot): string {
  const ref   = s.reference_rate
  const where = s.reference_jurisdiction ?? s.destination_state
  const state = s.destination_state ?? 'the billing address'
  switch (s.status) {
    case 'matches_reference':
      return `Charged ${chargedLabel(s)}. Reference: ${pct(ref ?? 0)} ${where ? `(${where}) ` : ''}on ${s.as_of_date}${s.reference_source ? ` · ${s.reference_source}` : ''}.`
    case 'manual_override':
      return `Charged ${chargedLabel(s)}; the reference for ${state} is ${pct(ref ?? 0)}. Fine for a deliberate exemption or rate; check it was intended.`
    case 'no_tax':
      return ref != null && ref > 0
        ? `The reference rate for ${state} is ${pct(ref)}, so check none is owed.`
        : 'Nothing was taxed on this invoice.'
    default:
      return `${s.reason ?? 'The tax could not be checked.'} Charged ${chargedLabel(s)}.`
  }
}

/** True when the invoice's tax no longer equals what was recorded at issue. */
export function taxChangedSinceIssue(s: Pick<InvoiceTaxSnapshot, 'tax_total'>, currentTaxTotal: number): boolean {
  return Math.abs(currentTaxTotal - s.tax_total) >= 0.005
}
