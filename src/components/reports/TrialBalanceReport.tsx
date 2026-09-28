// PATH: src/components/reports/TrialBalanceReport.tsx
// Every account with a balance on a date, debits and credits side by side.
// The totals must match; when they don't, the report says so -- never hidden.

import { formatCurrency } from '../../lib/currency'
import type { TrialBalance } from '../../services/reports.service'

const fmt = (n: number) => (n ? formatCurrency(n) : '')

export default function TrialBalanceReport({ data }: { data: TrialBalance }) {
  return (
    <div style={{ background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: 'var(--lp-surface-2)', color: 'var(--lp-text-muted)', textAlign: 'left' }}>
            <th style={th}>Account</th>
            <th style={{ ...th, width: 90 }}>Type</th>
            <th style={{ ...th, textAlign: 'right', width: 140 }}>Debit</th>
            <th style={{ ...th, textAlign: 'right', width: 140 }}>Credit</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.length === 0 && (
            <tr><td colSpan={4} style={{ ...td, color: 'var(--lp-text-muted)', textAlign: 'center', padding: 24 }}>
              No account has a balance on this date.
            </td></tr>
          )}
          {data.rows.map(r => (
            <tr key={r.account_id} style={{ borderTop: '0.5px solid var(--lp-border)' }}>
              <td style={td}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--lp-text-stronger)', marginRight: 10 }}>{r.code}</span>
                {r.name}
              </td>
              <td style={{ ...td, color: 'var(--lp-text-muted)', textTransform: 'capitalize' }}>{r.type}</td>
              <td style={{ ...td, ...num }}>{fmt(Number(r.debit))}</td>
              <td style={{ ...td, ...num }}>{fmt(Number(r.credit))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1px solid var(--lp-border)', background: 'var(--lp-surface-2)', fontWeight: 700 }}>
            <td style={td} colSpan={2}>Total</td>
            <td style={{ ...td, ...num }}>{formatCurrency(Number(data.total_debit))}</td>
            <td style={{ ...td, ...num }}>{formatCurrency(Number(data.total_credit))}</td>
          </tr>
        </tfoot>
      </table>
      <div style={{
        padding: '10px 16px', fontSize: 12.5, fontWeight: 600,
        color: data.balanced ? 'var(--sem-green)' : 'var(--sem-red)',
        background: data.balanced ? 'var(--sem-green-bg)' : 'var(--sem-red-bg)',
      }}>
        {data.balanced
          ? '✓ Debits equal credits'
          : `⚠ Out of balance by ${formatCurrency(Math.abs(Number(data.total_debit) - Number(data.total_credit)))}`}
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '9px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '7px 16px', color: 'var(--lp-text)' }
const num: React.CSSProperties = { textAlign: 'right', fontFamily: 'monospace' }
