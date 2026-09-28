// PATH: src/components/reports/AgingReport.tsx
// Receivables (open invoices) or payables (unpaid bills) by how late they
// are, per customer / vendor. The total is reconciled to the Accounts
// Receivable / Payable balance in the ledger; any part no open document
// explains (e.g. an opening balance imported from another system) is shown
// on its own line rather than silently dropped.

import { formatCurrency } from '../../lib/currency'
import { AGING_BUCKETS, type Aging, type AgingBucket } from '../../services/reports.service'

const fmt = (n: number) => (n ? formatCurrency(n) : '')

interface PartyRow { party: string; buckets: Record<AgingBucket, number>; total: number }

export function agingByParty(data: Aging): PartyRow[] {
  const map = new Map<string, PartyRow>()
  for (const d of data.documents) {
    const row = map.get(d.party) ?? {
      party: d.party, total: 0,
      buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
    }
    row.buckets[d.bucket] += Number(d.amount)
    row.total += Number(d.amount)
    map.set(d.party, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export default function AgingReport({ data }: { data: Aging }) {
  const rows = agingByParty(data)
  const partyLabel = data.kind === 'ar' ? 'Customer' : 'Vendor'
  const unapplied = Number(data.unapplied)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'var(--lp-surface-2)', color: 'var(--lp-text-muted)', textAlign: 'left' }}>
              <th style={th}>{partyLabel}</th>
              {AGING_BUCKETS.map(b => <th key={b.key} style={{ ...th, ...num }}>{b.label}</th>)}
              <th style={{ ...th, ...num }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 24, color: 'var(--lp-text-muted)' }}>
                {data.kind === 'ar' ? 'No open invoices.' : 'No unpaid bills.'}
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.party} style={{ borderTop: '0.5px solid var(--lp-border)' }}>
                <td style={td}>{r.party}</td>
                {AGING_BUCKETS.map(b => (
                  <td key={b.key} style={{ ...td, ...num, color: b.key === 'current' ? 'var(--lp-text)' : 'var(--sem-red)' }}>
                    {fmt(r.buckets[b.key])}
                  </td>
                ))}
                <td style={{ ...td, ...num, fontWeight: 600 }}>{formatCurrency(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid var(--lp-border)', background: 'var(--lp-surface-2)', fontWeight: 700 }}>
              <td style={td}>Total</td>
              {AGING_BUCKETS.map(b => <td key={b.key} style={{ ...td, ...num }}>{formatCurrency(Number(data.buckets[b.key] ?? 0))}</td>)}
              <td style={{ ...td, ...num }}>{formatCurrency(Number(data.total_documents))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>
          {data.kind === 'ar' ? 'Accounts Receivable' : 'Accounts Payable'} in the ledger on {data.as_of}:{' '}
          <strong style={{ color: 'var(--lp-text)' }}>{formatCurrency(Number(data.ledger_balance))}</strong>
        </span>
        {Math.abs(unapplied) >= 0.01 && (
          <span style={{ color: 'var(--sem-amber)' }}>
            {formatCurrency(unapplied)} of that balance isn't explained by any open {data.kind === 'ar' ? 'invoice' : 'bill'}
            {' '}(for example, an opening balance imported from your previous system).
          </span>
        )}
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '9px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '7px 14px', color: 'var(--lp-text)' }
const num: React.CSSProperties = { textAlign: 'right', fontFamily: 'monospace' }
