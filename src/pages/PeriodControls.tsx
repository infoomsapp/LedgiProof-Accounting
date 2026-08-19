// PATH: src/pages/PeriodControls.tsx
// Accounting period lifecycle UI: OPEN → ADJUSTMENT → CLOSED.
// Absence of a period_controls row = implicitly OPEN (DB default).
//
// Access: canClosePeriods (accountant firm — owner/admin/accountant role).
// Route:  /clients/:clientId/periods

import { useState, useEffect, useCallback } from 'react'
import { useNavigate }  from 'react-router-dom'
import { useScope }     from '../hooks/useScope'
import { useAuthStore } from '../store/auth.store'
import { useUserRole }  from '../hooks/useUserRole'
import {
  getPeriodControls,
  advancePeriod,
  reopenPeriod,
  buildYearGrid,
  type PeriodStatus,
  type PeriodControl,
} from '../services/period.service'
import { formatDateShort } from '../lib/dates'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<PeriodStatus, { label: string; color: string; bg: string; next: string }> = {
  OPEN:        { label:'Open',        color:'var(--sem-green)', bg:'rgba(34,197,94,0.08)',   next:'Lock for Adjustment' },
  ADJUSTMENT:  { label:'Adjustment',  color:'var(--sem-amber)', bg:'rgba(234,179,8,0.1)',    next:'Close Period' },
  CLOSED:      { label:'Closed',      color:'var(--lp-text-muted)', bg:'rgba(0,0,0,0.05)', next:'' },
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Period cell ───────────────────────────────────────────────────────────────

function PeriodCell({
  month, label, status, row,
  canAdvance, canReopen, userId, orgId, clientId,
  onChanged
}: {
  month:       number
  label:       string
  status:      PeriodStatus
  row:         PeriodControl | null
  canAdvance:  boolean
  canReopen:   boolean
  userId:      string
  orgId:       string
  clientId:    string
  onChanged:   () => void
}) {
  const [busy,   setBusy]   = useState(false)
  const [err,    setErr]    = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [showReopen, setShowReopen] = useState(false)

  const meta    = STATUS_META[status]
  const canMove = canAdvance && status !== 'CLOSED'
  const year    = row?.period_year ?? new Date().getFullYear()

  async function handleAdvance() {
    if (!confirm(`${meta.next} for ${label}?`)) return
    setBusy(true); setErr(null)
    try {
      await advancePeriod(orgId, clientId, year, month, userId)
      onChanged()
    } catch (e: any) { setErr(e.message) }
    finally { setBusy(false) }
  }

  async function handleReopen() {
    if (!reason.trim()) return setErr('Reason required')
    setBusy(true); setErr(null)
    try {
      await reopenPeriod(orgId, clientId, year, month, userId, reason.trim())
      setShowReopen(false)
      setReason('')
      onChanged()
    } catch (e: any) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div style={{
      border:'0.5px solid var(--lp-border)', borderRadius:8,
      background:'var(--lp-surface)', overflow:'hidden',
      display:'flex', flexDirection:'column'
    }}>
      {/* Month header */}
      <div style={{
        padding:'8px 12px', background: meta.bg,
        borderBottom:'0.5px solid var(--lp-border)',
        display:'flex', alignItems:'center', justifyContent:'space-between'
      }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--lp-text)' }}>
          {MONTHS_SHORT[month - 1]}
        </span>
        <span style={{
          fontSize:11, fontWeight:700, color: meta.color,
          padding:'1px 7px', borderRadius:100,
          background: meta.bg, border:`0.5px solid ${meta.color}33`
        }}>
          {meta.label}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding:'10px 12px', flex:1, display:'flex', flexDirection:'column', gap:6 }}>
        {row && (
          <div style={{ fontSize:11, color:'var(--lp-text-muted)' }}>
            Updated {formatDateShort(row.updated_at, { withYear: false })}
            {row.reason && <span> · {row.reason}</span>}
          </div>
        )}

        {err && (
          <div style={{
            fontSize:11, color:'var(--sem-red)',
            background:'rgba(239,68,68,0.06)', borderRadius:4, padding:'4px 8px'
          }}>{err}</div>
        )}

        {/* Advance button */}
        {canMove && meta.next && (
          <button
            onClick={handleAdvance}
            disabled={busy}
            className="lp-btn lp-btn-ghost"
            style={{ fontSize:11.5, padding:'4px 8px', marginTop:'auto',
              color: status === 'ADJUSTMENT' ? 'var(--sem-red)' : 'var(--lp-text-muted)' }}
          >
            {busy ? '…' : meta.next} →
          </button>
        )}

        {/* Reopen (super_admin only) */}
        {canReopen && status === 'CLOSED' && !showReopen && (
          <button
            onClick={() => setShowReopen(true)}
            className="lp-btn lp-btn-ghost"
            style={{ fontSize:11, color:'var(--lp-text-muted)', marginTop:'auto' }}
          >
            Reopen ↩
          </button>
        )}

        {showReopen && (
          <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:'auto' }}>
            <input
              placeholder="Reason (required)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{
                fontSize:11.5, padding:'4px 8px',
                border:'0.5px solid var(--lp-border)', borderRadius:4,
                background:'var(--lp-bg)', color:'var(--lp-text)', fontFamily:'inherit'
              }}
            />
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={handleReopen} disabled={busy} className="lp-btn lp-btn-primary" style={{ fontSize:11, flex:1 }}>
                {busy ? '…' : 'Confirm'}
              </button>
              <button onClick={() => { setShowReopen(false); setErr(null) }} className="lp-btn lp-btn-ghost" style={{ fontSize:11 }}>
                ×
              </button>
            </div>
          </div>
        )}

        {status === 'CLOSED' && !canReopen && (
          <div style={{ fontSize:11, color:'var(--lp-text-muted)', marginTop:'auto' }}>
            Locked — contact super admin to reopen
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PeriodControls() {
  const scope    = useScope()
  const { profile } = useAuthStore()
  const role     = useUserRole()
  const navigate = useNavigate()

  const orgId    = scope.orgId
  const clientId = scope.clientId
  const userId   = profile?.id ?? ''

  const currentYear = new Date().getFullYear()
  const [year,    setYear]    = useState(currentYear)
  const [rows,    setRows]    = useState<PeriodControl[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (scope.isReady && !clientId) navigate('/clients', { replace: true })
  }, [scope.isReady, clientId, navigate])

  useEffect(() => {
    if (!role.loading && !role.canClosePeriods) navigate('/unauthorized', { replace: true })
  }, [role.loading, role.canClosePeriods, navigate])

  const load = useCallback(async () => {
    if (!orgId || !clientId) return
    setLoading(true)
    try {
      const data = await getPeriodControls(orgId, clientId, year)
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [orgId, clientId, year])

  useEffect(() => { load() }, [load])

  if (!scope.isReady || role.loading) {
    return <div style={{ padding:32, color:'var(--lp-text-muted)', fontSize:13 }}>Loading…</div>
  }
  if (!clientId) return null

  const grid    = buildYearGrid(year, rows)
  const closed  = grid.filter(g => g.status === 'CLOSED').length
  const inAdj   = grid.filter(g => g.status === 'ADJUSTMENT').length
  const open    = grid.filter(g => g.status === 'OPEN').length

  return (
    <div style={{ padding:24, maxWidth:960, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--lp-text)', letterSpacing:'-0.01em' }}>
            Period Controls
          </div>
          <div style={{ fontSize:12.5, color:'var(--lp-text-muted)', marginTop:2 }}>
            Lock and close accounting periods to prevent further changes
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setYear(y => y - 1)} className="lp-btn lp-btn-ghost" style={{ fontSize:13, padding:'5px 10px' }}>
            ←
          </button>
          <span style={{ fontSize:15, fontWeight:700, color:'var(--lp-text)', minWidth:48, textAlign:'center' }}>
            {year}
          </span>
          <button
            onClick={() => setYear(y => y + 1)}
            disabled={year >= currentYear}
            className="lp-btn lp-btn-ghost"
            style={{ fontSize:13, padding:'5px 10px', opacity: year >= currentYear ? 0.4 : 1 }}
          >
            →
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:24
      }}>
        {[
          { label:'Open',       count: open,   color:'var(--sem-green)' },
          { label:'Adjustment', count: inAdj,  color:'var(--sem-amber)' },
          { label:'Closed',     count: closed, color:'var(--lp-text-muted)' },
        ].map(s => (
          <div key={s.label} style={{
            border:'0.5px solid var(--lp-border)', borderRadius:8,
            background:'var(--lp-surface)', padding:'12px 16px',
            display:'flex', alignItems:'center', gap:12
          }}>
            <span style={{ fontSize:24, fontWeight:800, color: s.color, fontVariantNumeric:'tabular-nums' }}>
              {s.count}
            </span>
            <span style={{ fontSize:13, color:'var(--lp-text-muted)', fontWeight:500 }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Period grid */}
      {loading ? (
        <div style={{ padding:32, textAlign:'center', color:'var(--lp-text-muted)', fontSize:13 }}>
          Loading periods…
        </div>
      ) : (
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(4, 1fr)',
          gap:12
        }}>
          {grid.map(g => (
            <PeriodCell
              key={g.month}
              month={g.month}
              label={g.label}
              status={g.status}
              row={g.row}
              canAdvance={role.canClosePeriods}
              canReopen={role.canReopenClosedPeriod}
              userId={userId}
              orgId={orgId}
              clientId={clientId}
              onChanged={load}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop:24, fontSize:11.5, color:'var(--lp-text-muted)', display:'flex', gap:20 }}>
        <span><strong style={{color:'var(--sem-green)'}}>Open</strong> — transactions can be posted freely</span>
        <span><strong style={{color:'var(--sem-amber)'}}>Adjustment</strong> — only accountants can post; period under review</span>
        <span><strong style={{color:'var(--lp-text)'}}>Closed</strong> — no transactions allowed; super admin required to reopen</span>
      </div>
    </div>
  )
}
