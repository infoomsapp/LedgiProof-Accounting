// PATH: src/pages/FirmReportsSummary.tsx
import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useScope }       from '../hooks/useScope'
import { db }              from '../lib/supabase'
import { formatCurrency }  from '../lib/currency'
import { getClients }      from '../services/invoice.service'
import type { Client }     from '../types/database.types'
import Reports             from './Reports'

const fmt = (n: number) => formatCurrency(n)

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

interface ClientSummaryRow {
  client_id:       string
  client_name:     string
  total_revenue:   number
  total_expenses:  number
  net_income:      number
  is_balanced:     boolean
}

// Firm-wide Reports — one row per client, each client's own real numbers.
// Deliberately NOT a merged/combined financial statement: separate client
// entities' books have no shared meaning to add together. Each row links
// out to that client's own full Balance Sheet / P&L for drill-down.
export default function FirmReportsSummary() {
  const scope = useScope()
  const orgId = scope.orgId
  const now   = new Date()

  // 'all' → the per-client comparison table below (default). Any other
  // value is a client id → jump straight to that one client's own Balance
  // Sheet / P&L, inline, right here — the fast path this selector exists
  // for, instead of Clients → pick client → Reports (3 clicks, 3 pages).
  const [clients,          setClients]          = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('all')

  useEffect(() => {
    if (!orgId) return
    getClients(orgId).then(setClients).catch(() => setClients([]))
  }, [orgId])

  const [year,    setYear]    = useState(now.getFullYear())
  const [month,   setMonth]   = useState(now.getMonth() + 1)
  const [rows,    setRows]    = useState<ClientSummaryRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [hasRun,  setHasRun]  = useState(false)

  const runReport = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await db.rpc('get_firm_client_summary', {
      p_org_id: orgId, p_as_of_year: year, p_as_of_month: month
    })
    if (err) setError(err.message)
    else setRows(data as unknown as ClientSummaryRow[])
    setLoading(false); setHasRun(true)
  }, [orgId, year, month])

  const totalRevenue  = rows?.reduce((s, r) => s + r.total_revenue,  0) ?? 0
  const totalExpenses = rows?.reduce((s, r) => s + r.total_expenses, 0) ?? 0
  const totalNet       = totalRevenue - totalExpenses

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 className="lp-page-title">Reports</h1>
        <p className="lp-page-sub">Revenue, expenses, and balance status across every client</p>
      </div>

      {/* Client selector — jump straight to one client's own report, or
          stay on "All clients" for the comparison table below. */}
      <div className="lp-card" style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Client</label>
          <select className="lp-input" style={{ width: '100%' }} value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}>
            <option value="all">All clients (comparison)</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.company_name || c.display_name}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedClientId !== 'all' ? (
        <div style={{ margin: '0 -32px' }}>
          <Reports
            key={selectedClientId}
            clientIdOverride={selectedClientId}
            entityNameOverride={selectedClient?.company_name || selectedClient?.display_name || ''}
          />
        </div>
      ) : (
      <>

      {/* Controls */}
      <div className="lp-card" style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Year</label>
          <select className="lp-input" style={{ width: 90 }} value={year}
            onChange={e => setYear(Number(e.target.value))}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y =>
              <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Through month</label>
          <select className="lp-input" style={{ width: 130 }} value={month}
            onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>

        <button onClick={runReport} disabled={loading} className="lp-btn lp-btn-primary"
          style={{ padding: '9px 24px' }}>
          {loading ? 'Generating…' : 'Run report'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)', color: 'var(--sem-red)' }}>
          ⚠ {error}
        </div>
      )}

      {hasRun && !loading && rows && rows.length === 0 && (
        <div className="lp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
            No active clients yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
            Add a client to start seeing their numbers here.
          </div>
        </div>
      )}

      {hasRun && !loading && rows && rows.length > 0 && (
        <div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20
          }}>
            {[
              { label: 'Total Revenue',  value: totalRevenue,  color: 'var(--sem-green)' },
              { label: 'Total Expenses', value: totalExpenses, color: 'var(--sem-red-soft)' },
              { label: 'Net Income',     value: totalNet,      color: totalNet >= 0 ? 'var(--sem-green)' : 'var(--sem-red-soft)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="lp-card">
                <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'monospace' }}>{fmt(value)}</div>
              </div>
            ))}
          </div>

          <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--lp-surface-2)', borderBottom: '0.5px solid var(--lp-border)' }}>
                    {['Client', 'Revenue', 'Expenses', 'Net Income', 'Status', ''].map((h, i) => (
                      <th key={h || i} style={{
                        textAlign: i === 0 ? 'left' : i === 5 ? 'left' : 'right',
                        padding: '10px 16px', fontSize: 11.5, fontWeight: 600,
                        color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.client_id} style={{ borderBottom: '0.5px solid var(--lp-border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--lp-text)' }}>
                        {r.client_name}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontFamily: 'monospace', color: 'var(--sem-green)' }}>
                        {fmt(r.total_revenue)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontFamily: 'monospace', color: 'var(--sem-red-soft)' }}>
                        {fmt(r.total_expenses)}
                      </td>
                      <td style={{
                        padding: '12px 16px', fontSize: 13, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600,
                        color: r.net_income >= 0 ? 'var(--sem-green)' : 'var(--sem-red-soft)'
                      }}>
                        {fmt(r.net_income)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 500,
                          background: r.is_balanced ? 'var(--sem-green-bg)' : 'var(--sem-red-bg)',
                          border: `0.5px solid ${r.is_balanced ? 'var(--sem-green-border)' : 'var(--sem-red-border)'}`,
                          color: r.is_balanced ? 'var(--sem-green)' : 'var(--sem-red)'
                        }}>
                          {r.is_balanced ? '✓ Balanced' : '⚠ Out of balance'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'left' }}>
                        <Link to={`/clients/${r.client_id}/reports`} className="lp-btn lp-btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}>
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{
            marginTop: 20, paddingTop: 12, borderTop: '0.5px solid var(--lp-border)',
            fontSize: 10.5, color: 'var(--lp-text-muted)', textAlign: 'center'
          }}>
            Prepared with LedgiProof · {rows.length} client{rows.length === 1 ? '' : 's'} · Through {MONTHS[month - 1]} {year}
          </div>
        </div>
      )}

      {!hasRun && !loading && (
        <div className="lp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
            Select a period and run the report
          </div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
            One row per client — revenue, expenses, net income, and balance status.
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
