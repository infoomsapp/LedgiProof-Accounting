// PATH: src/components/Invoices/InvoiceTaxSnapshotCard.tsx
//
// The firm's record of how an issued invoice's sales tax was worked out. Loads
// itself and renders nothing when there is no snapshot or it cannot be read, so
// it can never get in the way of the invoice.

import { useEffect, useState } from 'react'
import {
  getInvoiceTaxSnapshot, taxSnapshotHeadline, taxSnapshotDetail, taxChangedSinceIssue,
  type InvoiceTaxSnapshot
} from '../../services/invoice-tax-snapshot.service'
import { formatCurrency } from '../../lib/currency'

const TONE: Record<InvoiceTaxSnapshot['status'], { color: string; bg: string }> = {
  matches_reference: { color: 'var(--sem-green)',   bg: 'rgba(34,197,94,0.08)' },
  manual_override:   { color: 'var(--sem-amber)',   bg: 'var(--sem-amber-bg)'  },
  requires_review:   { color: 'var(--sem-red)',     bg: 'var(--sem-red-bg)'    },
  no_tax:            { color: 'var(--lp-text-muted)', bg: 'var(--lp-surface-2)' }
}

export default function InvoiceTaxSnapshotCard(
  { invoiceId, currentTaxTotal, currency }: { invoiceId: string; currentTaxTotal: number; currency: string }
) {
  const [snap, setSnap] = useState<InvoiceTaxSnapshot | null>(null)

  useEffect(() => {
    let alive = true
    setSnap(null)
    getInvoiceTaxSnapshot(invoiceId).then(s => { if (alive) setSnap(s) }).catch(() => {})
    return () => { alive = false }
  }, [invoiceId])

  if (!snap) return null
  const tone = TONE[snap.status]
  const changed = taxChangedSinceIssue(snap, currentTaxTotal)

  return (
    <div style={{
      marginBottom: 14, padding: '12px 14px', borderRadius: 10,
      background: tone.bg, border: `0.5px solid ${tone.color}`
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>{taxSnapshotHeadline(snap)}</div>
      <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 3, lineHeight: 1.5 }}>
        {taxSnapshotDetail(snap)}
      </div>
      {changed && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sem-amber)', marginTop: 6 }}>
          The tax on this invoice changed after it was issued: {formatCurrency(snap.tax_total, currency)} then,{' '}
          {formatCurrency(currentTaxTotal, currency)} now.
        </div>
      )}
    </div>
  )
}
