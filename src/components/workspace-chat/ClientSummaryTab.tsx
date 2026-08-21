// PATH: src/components/workspace-chat/ClientSummaryTab.tsx
//
// "Resumen" tab in the chat header — quick numbers for the client being
// chatted with, so staff don't have to leave the conversation to check
// revenue/expenses/balance status. Reuses get_firm_client_summary (built
// for FirmReportsSummary.tsx) rather than a new RPC — that call already
// returns every client's numbers for the org, this just filters to one.

import { useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { formatCurrency } from '../../lib/currency'

interface Props {
  orgId:    string
  clientId: string
}

interface ClientSummaryRow {
  client_id:      string
  client_name:    string
  total_revenue:  number
  total_expenses: number
  net_income:     number
  is_balanced:    boolean
}

export default function ClientSummaryTab({ orgId, clientId }: Props) {
  const [row,     setRow]     = useState<ClientSummaryRow | null | undefined>(undefined)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setRow(undefined)
    setError(null)
    const now = new Date()

    db.rpc('get_firm_client_summary', {
      p_org_id: orgId, p_as_of_year: now.getFullYear(), p_as_of_month: now.getMonth() + 1
    }).then(({ data, error: err }) => {
      if (!alive) return
      if (err) { setError(err.message); return }
      const rows = (data ?? []) as unknown as ClientSummaryRow[]
      setRow(rows.find(r => r.client_id === clientId) ?? null)
    })

    return () => { alive = false }
  }, [orgId, clientId])

  if (error) {
    return (
      <div style={{ padding: 16, fontSize: 12.5, color: 'var(--sem-red)' }}>⚠ {error}</div>
    )
  }

  if (row === undefined) {
    return (
      <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
        Loading…
      </div>
    )
  }

  if (row === null) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
          No posted numbers yet for this client this period.
        </div>
      </div>
    )
  }

  const stats = [
    { label: 'Revenue',    value: row.total_revenue,  color: 'var(--sem-green)' },
    { label: 'Expenses',   value: row.total_expenses,  color: 'var(--sem-red-soft)' },
    { label: 'Net Income', value: row.net_income,      color: row.net_income >= 0 ? 'var(--sem-green)' : 'var(--sem-red-soft)' },
  ]

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 500,
        background: row.is_balanced ? 'var(--sem-green-bg)' : 'var(--sem-red-bg)',
        border: `0.5px solid ${row.is_balanced ? 'var(--sem-green-border)' : 'var(--sem-red-border)'}`,
        color: row.is_balanced ? 'var(--sem-green)' : 'var(--sem-red)'
      }}>
        {row.is_balanced ? '✓ Balanced' : '⚠ Out of balance'}
      </div>

      {stats.map(s => (
        <div key={s.label} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 12px', borderRadius: 8,
          background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)'
        }}>
          <span style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>{s.label}</span>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>
            {formatCurrency(s.value)}
          </span>
        </div>
      ))}

      <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', textAlign: 'center', marginTop: 4 }}>
        Month-to-date · from the ledger
      </div>
    </div>
  )
}
