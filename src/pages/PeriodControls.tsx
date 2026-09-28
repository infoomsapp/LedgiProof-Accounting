// PATH: src/pages/PeriodControls.tsx
// Month-end close in one click (QuickBooks / Xero "closing date"):
//   · pick a month → a checklist says what still stands in the way (bank
//     transactions waiting in For review, draft journal entries — both block;
//     open reconciliations — a warning) → "Close the books through <month>"
//     closes it and every earlier month with activity;
//   · an owner or admin can move the closing date back from any closed month,
//     with a reason (kept in period_lock_history).
// Works for the workspace's own books (/periods) and a firm's client books
// (/clients/:clientId/periods). The server enforces every rule
// (phase4_period_close.sql); this page explains them.
//
// Access: canClosePeriods (owner/admin/accountant of an accountant firm, the
// plan that includes period closing).

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScope }     from '../hooks/useScope'
import { useUserRole }  from '../hooks/useUserRole'
import {
  getPeriodControls, getCloseChecklist, closeBooksThrough, reopenBooksFrom, buildYearGrid,
  type PeriodStatus, type PeriodControl, type CloseChecklist,
} from '../services/period.service'
import { formatDateShort } from '../lib/dates'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const STATUS_META: Record<PeriodStatus, { label: string; color: string; bg: string }> = {
  OPEN:       { label: 'Open',       color: 'var(--sem-green)',      bg: 'rgba(34,197,94,0.08)' },
  ADJUSTMENT: { label: 'Adjustment', color: 'var(--sem-amber)',      bg: 'rgba(234,179,8,0.1)'  },
  CLOSED:     { label: 'Closed',     color: 'var(--lp-text-muted)',  bg: 'rgba(0,0,0,0.05)'     },
}

function monthLabel(year: number, month: number) {
  return `${MONTHS[month - 1]} ${year}`
}

export default function PeriodControls() {
  const scope    = useScope()
  const role     = useUserRole()
  const navigate = useNavigate()

  const orgId    = scope.orgId
  const clientId = scope.clientId ?? null
  const now      = new Date()
  const currentYear = now.getFullYear()

  // Default target: last month (the one usually being closed).
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [year,     setYear]     = useState(currentYear)
  const [target,   setTarget]   = useState({ year: lastMonth.getFullYear(), month: lastMonth.getMonth() + 1 })
  const [rows,     setRows]     = useState<PeriodControl[]>([])
  const [check,    setCheck]    = useState<CloseChecklist | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [notice,   setNotice]   = useState<string | null>(null)

  useEffect(() => {
    if (!role.loading && !role.canClosePeriods) navigate('/unauthorized', { replace: true })
  }, [role.loading, role.canClosePeriods, navigate])

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true); setError(null)
    try {
      const [r, c] = await Promise.all([
        getPeriodControls(orgId, clientId, year),
        getCloseChecklist(orgId, clientId, target.year, target.month),
      ])
      setRows(r); setCheck(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [orgId, clientId, year, target])

  useEffect(() => { void load() }, [load])

  async function handleClose() {
    if (!confirm(`Close the books through ${monthLabel(target.year, target.month)}? `
      + 'Nothing dated on or before the end of that month can be changed until an owner or admin reopens it.')) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await closeBooksThrough(orgId, clientId, target.year, target.month)
      setNotice(`Books closed through ${monthLabel(target.year, target.month)}`
        + (res.open_reconciliations > 0 ? ` — ${res.open_reconciliations} reconciliation(s) are still open.` : '.'))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleReopen(y: number, m: number) {
    const reason = prompt(`Reopen the books from ${monthLabel(y, m)}? Every later month reopens too. Why?`)
    if (!reason || !reason.trim()) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await reopenBooksFrom(orgId, clientId, y, m, reason.trim())
      setNotice(`Reopened ${res.months_reopened} month(s) from ${monthLabel(y, m)}.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!scope.isReady || role.loading) {
    return <div style={{ padding: 32, color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>
  }

  const grid     = buildYearGrid(year, rows)
  const blocking = !!check && (check.to_review > 0 || check.draft_batches > 0)
  const targets: { year: number; month: number }[] = []
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    targets.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  const booksName = scope.client?.company_name || scope.client?.display_name || 'your books'

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--lp-text)', letterSpacing: '-0.01em' }}>Close the books</div>
        <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
          Lock {booksName} through a month so nothing dated in it can change.
          {check?.closed_through && <> Closed through <strong>{formatDateShort(check.closed_through)}</strong>.</>}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, fontSize: 12.5,
          background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)', color: 'var(--sem-red)' }}>{error}</div>
      )}
      {notice && (
        <div role="status" style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, fontSize: 12.5,
          background: 'var(--sem-blue-bg)', border: '0.5px solid var(--sem-blue-border)', color: 'var(--sem-blue)' }}>✓ {notice}</div>
      )}

      {/* One click: the month, what's in the way, the button */}
      <div className="lp-card" style={{ marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>Close through</label>
            <select className="lp-input" style={{ width: 200 }}
              value={`${target.year}-${target.month}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-').map(Number)
                setTarget({ year: y!, month: m! })
              }}>
              {targets.map(t => (
                <option key={`${t.year}-${t.month}`} value={`${t.year}-${t.month}`}>{monthLabel(t.year, t.month)}</option>
              ))}
            </select>
          </div>
          <button className="lp-btn lp-btn-primary" disabled={busy || loading || blocking} onClick={() => { void handleClose() }}>
            {busy ? 'Closing…' : `Close the books through ${monthLabel(target.year, target.month)}`}
          </button>
        </div>

        {check && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
            <ChecklistItem ok={check.to_review === 0}
              text={check.to_review === 0
                ? 'Every bank transaction up to then is categorized'
                : `${check.to_review} transaction(s) still waiting in For review`}
              action={check.to_review > 0 ? { label: 'Open For review', go: () => navigate(clientId ? `/clients/${clientId}/review` : '/review') } : undefined} />
            <ChecklistItem ok={check.draft_batches === 0}
              text={check.draft_batches === 0
                ? 'No draft journal entries'
                : `${check.draft_batches} draft journal entr(ies) — post or delete them`} />
            <ChecklistItem ok={check.open_reconciliations === 0} warning
              text={check.open_reconciliations === 0
                ? 'Bank reconciliations are finished'
                : `${check.open_reconciliations} reconciliation(s) still open (you can close anyway)`} />
          </ul>
        )}
      </div>

      {/* The year at a glance */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--lp-text)' }}>{year}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setYear(y => y - 1)} className="lp-btn lp-btn-ghost" style={{ fontSize: 13, padding: '5px 10px' }}>←</button>
          <button onClick={() => setYear(y => y + 1)} disabled={year >= currentYear} className="lp-btn lp-btn-ghost"
            style={{ fontSize: 13, padding: '5px 10px', opacity: year >= currentYear ? 0.4 : 1 }}>→</button>
        </div>
      </div>
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading periods…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {grid.map(g => {
            const meta = STATUS_META[g.status]
            return (
              <div key={g.month} style={{ border: '0.5px solid var(--lp-border)', borderRadius: 8, background: 'var(--lp-surface)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: meta.bg, borderBottom: '0.5px solid var(--lp-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--lp-text)' }}>{MONTHS[g.month - 1]!.slice(0, 3)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                </div>
                <div style={{ padding: '8px 12px', minHeight: 40, fontSize: 11, color: 'var(--lp-text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {g.row && <span>{formatDateShort(g.row.updated_at, { withYear: false })}{g.row.reason ? ` · ${g.row.reason}` : ''}</span>}
                  {g.status === 'CLOSED' && role.canReopenClosedPeriod && (
                    <button className="lp-btn lp-btn-ghost" style={{ fontSize: 11, padding: '3px 8px', alignSelf: 'flex-start' }}
                      disabled={busy} onClick={() => { void handleReopen(year, g.month) }}>
                      Reopen from here ↩
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11.5, color: 'var(--lp-text-muted)', lineHeight: 1.6 }}>
        Closing is cumulative: closing a month also closes every earlier month. Reopening a month reopens every later one.
        Only an owner or admin can reopen, and the reason is kept in the period history.
      </div>
    </div>
  )
}

function ChecklistItem({ ok, text, warning, action }: {
  ok: boolean; text: string; warning?: boolean; action?: { label: string; go: () => void } | undefined
}) {
  const color = ok ? 'var(--sem-green)' : warning ? 'var(--sem-amber)' : 'var(--sem-red)'
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color, fontWeight: 700, width: 14 }}>{ok ? '✓' : warning ? '!' : '✗'}</span>
      <span style={{ color: 'var(--lp-text)' }}>{text}</span>
      {action && (
        <button className="lp-btn lp-btn-ghost" style={{ fontSize: 11.5, padding: '2px 8px' }} onClick={action.go}>{action.label}</button>
      )}
    </li>
  )
}
