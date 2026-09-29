// PATH: src/components/reports/GeneralLedgerReport.tsx
// Every journal line of each account in a date range, with the balance
// brought forward and a running balance. Balances are shown on the account's
// normal side (a credit-normal account's credit balance reads positive).

import { formatCurrency } from '../../lib/currency'
import type { GeneralLedger, LedgerAccount } from '../../services/reports.service'

const fmt = (n: number) => (n ? formatCurrency(n) : '')

const KIND_LABEL: Record<string, string> = {
  transaction_linked: 'Bank',
  manual_adjustment:  'Journal',
  closing_entry:      'Closing',
  depreciation:       'Depreciation',
  opening_balance:    'Opening balance',
  invoice:            'Invoice',
  invoice_payment:    'Payment',
  bill:               'Bill',
  bill_payment:       'Bill payment',
  payroll:            'Payroll',
}

/** Debit-positive figure shown on the account's normal side. */
export function onNormalSide(a: Pick<LedgerAccount, 'normal_balance'>, debitPositive: number): number {
  const v = a.normal_balance === 'credit' ? -debitPositive : debitPositive
  return v === 0 ? 0 : v   // never -0: it prints as "-$0.00"
}

export default function GeneralLedgerReport({ data }: { data: GeneralLedger }) {
  if (data.accounts.length === 0) {
    return (
      <div className="lp-card" style={{ textAlign: 'center', padding: 28, color: 'var(--lp-text-muted)', fontSize: 13 }}>
        No activity in this range.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.accounts.map(a => (
        <div key={a.account_id} style={{ background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: 'var(--lp-surface-2)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11.5, marginRight: 10 }}>{a.code}</span>{a.name}
            </span>
            <span style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
              Balance forward {formatCurrency(onNormalSide(a, Number(a.opening)))}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--lp-text-muted)', textAlign: 'left' }}>
                <th style={{ ...th, width: 96 }}>Date</th>
                <th style={{ ...th, width: 110 }}>Type</th>
                <th style={th}>Description</th>
                <th style={{ ...th, ...num, width: 110 }}>Debit</th>
                <th style={{ ...th, ...num, width: 110 }}>Credit</th>
                <th style={{ ...th, ...num, width: 120 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {a.lines.map((l, i) => (
                <tr key={i} style={{ borderTop: '0.5px solid var(--lp-border)' }}>
                  <td style={td}>{l.date}</td>
                  <td style={{ ...td, color: 'var(--lp-text-muted)' }}>{KIND_LABEL[l.kind] ?? l.kind}</td>
                  <td style={{ ...td, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.memo ?? ''}</td>
                  <td style={{ ...td, ...num }}>{fmt(Number(l.debit))}</td>
                  <td style={{ ...td, ...num }}>{fmt(Number(l.credit))}</td>
                  <td style={{ ...td, ...num }}>{formatCurrency(onNormalSide(a, Number(l.balance)))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--lp-border)', fontWeight: 700 }}>
                <td style={td} colSpan={5}>Ending balance</td>
                <td style={{ ...td, ...num }}>{formatCurrency(onNormalSide(a, Number(a.closing)))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  )
}

const th: React.CSSProperties = { padding: '7px 12px', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '6px 12px', color: 'var(--lp-text)' }
const num: React.CSSProperties = { textAlign: 'right', fontFamily: 'monospace' }
