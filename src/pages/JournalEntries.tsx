// PATH: src/pages/JournalEntries.tsx
// Manual journal batches for an accountant firm — accruals, deferrals,
// depreciation, opening balances, and closing entries.
//
// Access: canPostJournalEntries only (accountant firm — owner/admin/accountant role).
// Route:  /clients/:clientId/journal

import { useState, useEffect, useCallback } from 'react'
import { useNavigate }    from 'react-router-dom'
import { useScope }       from '../hooks/useScope'
import { useAuthStore }   from '../store/auth.store'
import { useUserRole }    from '../hooks/useUserRole'
import { getAccounts }    from '../services/accounts.service'
import {
  listManualJournalBatches,
  postManualJournalBatch,
  reverseManualJournalBatch,
  approveManualJournalBatch,
  validateBalance,
  type ManualJournalBatch,
  type JournalLine,
  type JournalEntryKind,
  type BatchStatus,
} from '../services/journal.service'
import type { Account } from '../types/database.types'
import { formatCurrency } from '../lib/currency'
import { formatDateShort } from '../lib/dates'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ENTRY_KINDS: Array<{ value: Exclude<JournalEntryKind,'transaction_linked'>; label: string }> = [
  { value: 'manual_adjustment', label: 'Manual Adjustment' },
  { value: 'closing_entry',     label: 'Closing Entry'     },
  { value: 'depreciation',      label: 'Depreciation'      },
  { value: 'opening_balance',   label: 'Opening Balance'   },
]

const STATUS_COLORS: Record<BatchStatus, string> = {
  draft:    'var(--sem-amber)',
  posted:   'var(--sem-green)',
  reversed: 'var(--lp-text-muted)',
}
const STATUS_BG: Record<BatchStatus, string> = {
  draft:    'rgba(234,179,8,0.1)',
  posted:   'rgba(34,197,94,0.08)',
  reversed: 'rgba(0,0,0,0.04)',
}


// ── Empty line factory ────────────────────────────────────────────────────────

function emptyLine(): JournalLine & { _key: number } {
  return { _key: Date.now() + Math.random(), accountId:'', entryType:'debit', amount:0 }
}

// ── New batch form ────────────────────────────────────────────────────────────

function NewBatchForm({
  orgId, clientId, userId, accounts,
  onCreated, onCancel
}: {
  orgId:     string
  clientId:  string
  userId:    string
  accounts:  Account[]
  onCreated: () => void
  onCancel:  () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [kind,    setKind]    = useState<Exclude<JournalEntryKind,'transaction_linked'>>('manual_adjustment')
  const [date,    setDate]    = useState(today)
  const [memo,    setMemo]    = useState('')
  const [lines,   setLines]   = useState<Array<JournalLine & { _key: number }>>([emptyLine(), emptyLine()])
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState<string | null>(null)

  const totalDebit  = lines.filter(l => l.entryType === 'debit').reduce((s, l) => s + (l.amount || 0), 0)
  const totalCredit = lines.filter(l => l.entryType === 'credit').reduce((s, l) => s + (l.amount || 0), 0)
  const balanced    = Math.round(totalDebit * 100) === Math.round(totalCredit * 100)

  function updateLine(key: number, patch: Partial<JournalLine>) {
    setLines(prev => prev.map(l => l._key === key ? { ...l, ...patch } : l))
  }
  function addLine() {
    setLines(prev => [...prev, emptyLine()])
  }
  function removeLine(key: number) {
    setLines(prev => prev.filter(l => l._key !== key))
  }

  async function handleSubmit() {
    setErr(null)
    if (memo.trim().length < 5) return setErr('Memo must be at least 5 characters')
    if (lines.length < 2)       return setErr('At least 2 lines required')
    if (!lines.every(l => l.accountId && l.amount > 0)) return setErr('All lines need an account and amount > 0')
    try {
      validateBalance(lines)
    } catch (e: any) {
      return setErr(e.message)
    }
    setSaving(true)
    try {
      await postManualJournalBatch({
        orgId,
        clientId,
        entryKind:     kind,
        effectiveDate: date,
        memo:          memo.trim(),
        lines,
        preparedBy:    userId
      })
      onCreated()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'6px 10px',
    background:'var(--lp-bg)', border:'0.5px solid var(--lp-border)',
    borderRadius:6, fontSize:13, color:'var(--lp-text)', fontFamily:'inherit'
  }
  const selectStyle = { ...inputStyle }

  return (
    <div style={{
      border:'0.5px solid var(--lp-border)', borderRadius:10,
      background:'var(--lp-surface)', padding:24, marginBottom:24
    }}>
      <div style={{ fontSize:15, fontWeight:700, color:'var(--lp-text)', marginBottom:18 }}>
        New Manual Journal Entry
      </div>

      {/* Row 1: Kind + Date + Memo */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 1fr', gap:12, marginBottom:16 }}>
        <label style={{ display:'flex', flexDirection:'column', gap:4, fontSize:12, color:'var(--lp-text-muted)', fontWeight:600 }}>
          ENTRY TYPE
          <select value={kind} onChange={e => setKind(e.target.value as any)} style={selectStyle}>
            {ENTRY_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:4, fontSize:12, color:'var(--lp-text-muted)', fontWeight:600 }}>
          EFFECTIVE DATE
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:4, fontSize:12, color:'var(--lp-text-muted)', fontWeight:600 }}>
          MEMO
          <input
            type="text" placeholder="Describe this entry (min 5 chars)"
            value={memo} onChange={e => setMemo(e.target.value)} style={inputStyle}
          />
        </label>
      </div>

      {/* Lines table */}
      <div style={{
        border:'0.5px solid var(--lp-border)', borderRadius:8, overflow:'hidden', marginBottom:12
      }}>
        {/* Header */}
        <div style={{
          display:'grid', gridTemplateColumns:'1fr 100px 130px 36px',
          padding:'7px 12px', background:'var(--lp-bg)',
          fontSize:11, fontWeight:700, color:'var(--lp-text-muted)',
          letterSpacing:'0.05em', textTransform:'uppercase',
          borderBottom:'0.5px solid var(--lp-border)'
        }}>
          <span>Account</span><span>Type</span><span style={{textAlign:'right'}}>Amount</span><span/>
        </div>

        {lines.map(line => (
          <div key={line._key} style={{
            display:'grid', gridTemplateColumns:'1fr 100px 130px 36px',
            gap:8, padding:'7px 12px', alignItems:'center',
            borderBottom:'0.5px solid var(--lp-border)'
          }}>
            <select
              value={line.accountId}
              onChange={e => updateLine(line._key, { accountId: e.target.value })}
              style={{ ...selectStyle, fontSize:12.5 }}
            >
              <option value="">— Select account —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code ? `${a.code} · ` : ''}{a.name}
                </option>
              ))}
            </select>
            <select
              value={line.entryType}
              onChange={e => updateLine(line._key, { entryType: e.target.value as 'debit' | 'credit' })}
              style={{ ...selectStyle, fontSize:12.5 }}
            >
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
            <input
              type="number" min="0" step="0.01"
              value={line.amount || ''}
              onChange={e => updateLine(line._key, { amount: parseFloat(e.target.value) || 0 })}
              style={{ ...inputStyle, textAlign:'right', fontSize:12.5 }}
              placeholder="0.00"
            />
            <button
              onClick={() => removeLine(line._key)}
              disabled={lines.length <= 2}
              style={{
                background:'none', border:'none', cursor:'pointer',
                color:'var(--lp-text-muted)', fontSize:16,
                opacity: lines.length <= 2 ? 0.3 : 1,
                display:'flex', alignItems:'center', justifyContent:'center'
              }}
              title="Remove line"
            >×</button>
          </div>
        ))}

        {/* Totals */}
        <div style={{
          display:'grid', gridTemplateColumns:'1fr 100px 130px 36px',
          gap:8, padding:'8px 12px', alignItems:'center',
          background:'var(--lp-bg)', fontSize:12, fontWeight:600
        }}>
          <span style={{ color:'var(--lp-text-muted)' }}>
            <button onClick={addLine} className="lp-btn lp-btn-ghost" style={{ fontSize:12, padding:'2px 8px' }}>
              + Add line
            </button>
          </span>
          <span style={{ color:'var(--lp-text-muted)' }}>
            <div style={{ fontSize:10, color:'var(--lp-text-muted)' }}>DR: {formatCurrency(totalDebit)}</div>
            <div style={{ fontSize:10, color:'var(--lp-text-muted)' }}>CR: {formatCurrency(totalCredit)}</div>
          </span>
          <span style={{
            textAlign:'right',
            color: balanced ? 'var(--sem-green)' : 'var(--sem-red)',
            fontSize:12
          }}>
            {balanced ? '✓ Balanced' : `Diff: ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}
          </span>
          <span/>
        </div>
      </div>

      {err && (
        <div style={{
          background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.3)',
          borderRadius:6, padding:'8px 12px', fontSize:12.5, color:'var(--sem-red)', marginBottom:12
        }}>{err}</div>
      )}

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button onClick={onCancel} className="lp-btn lp-btn-ghost" style={{ fontSize:13 }}>
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !balanced}
          className="lp-btn lp-btn-primary"
          style={{ fontSize:13, opacity: saving || !balanced ? 0.6 : 1 }}
        >
          {saving ? 'Posting…' : 'Post Entry'}
        </button>
      </div>
    </div>
  )
}

// ── Batch row ─────────────────────────────────────────────────────────────────

function BatchRow({
  batch, orgId, currentUserId, canReverse, canApprove, onAction
}: {
  batch:         ManualJournalBatch
  orgId:         string
  currentUserId: string
  canReverse:    boolean
  canApprove:    boolean
  onAction:      () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState<string | null>(null)

  const canApproveThis = canApprove
    && batch.status === 'posted'
    && !batch.approved_by
    && batch.prepared_by !== currentUserId

  async function handleReverse() {
    if (!confirm('Reverse this batch? A new mirror entry will be posted.')) return
    setBusy(true); setErr(null)
    try {
      await reverseManualJournalBatch(orgId, batch.id, currentUserId, 'Accountant reversal')
      onAction()
    } catch (e: any) { setErr(e.message) }
    finally { setBusy(false) }
  }

  async function handleApprove() {
    if (!confirm('Approve this batch? This confirms your segregation-of-duties review.')) return
    setBusy(true); setErr(null)
    try {
      await approveManualJournalBatch(orgId, batch.id, currentUserId)
      onAction()
    } catch (e: any) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ borderBottom:'0.5px solid var(--lp-border)' }}>
      {/* Summary row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
          cursor:'pointer', background: expanded ? 'var(--lp-bg)' : undefined
        }}
      >
        <span style={{
          padding:'2px 8px', borderRadius:100, fontSize:11, fontWeight:600,
          background: STATUS_BG[batch.status], color: STATUS_COLORS[batch.status]
        }}>
          {batch.status}
        </span>

        <span style={{ fontSize:13, fontWeight:600, color:'var(--lp-text)', flex:1, minWidth:0 }}>
          {ENTRY_KINDS.find(k => k.value === batch.entry_kind)?.label ?? batch.entry_kind}
          <span style={{ fontWeight:400, color:'var(--lp-text-muted)', marginLeft:8 }}>
            {batch.memo}
          </span>
        </span>

        <span style={{ fontSize:12, color:'var(--lp-text-muted)', flexShrink:0 }}>
          {formatDateShort(batch.effective_date)}
        </span>

        {batch.approved_by && (
          <span style={{ fontSize:11, color:'var(--sem-green)', flexShrink:0 }}>✓ Approved</span>
        )}

        <span style={{ fontSize:12, color:'var(--lp-text-muted)', flexShrink:0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding:'0 16px 14px' }}>
          <div style={{ fontSize:12, color:'var(--lp-text-muted)', marginBottom:10 }}>
            Prepared by {batch.prepared_by.slice(0,8)}…
            {batch.approved_by && ` · Approved by ${batch.approved_by.slice(0,8)}…`}
            {batch.posted_at && ` · Posted ${formatDateShort(batch.posted_at)}`}
          </div>
          {err && (
            <div style={{
              background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.3)',
              borderRadius:6, padding:'7px 12px', fontSize:12, color:'var(--sem-red)', marginBottom:10
            }}>{err}</div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            {canApproveThis && (
              <button
                onClick={handleApprove}
                disabled={busy}
                className="lp-btn lp-btn-primary"
                style={{ fontSize:12 }}
              >
                {busy ? 'Approving…' : 'Approve'}
              </button>
            )}
            {canReverse && batch.status === 'posted' && !batch.reversed_by_batch_id && (
              <button
                onClick={handleReverse}
                disabled={busy}
                className="lp-btn lp-btn-ghost"
                style={{ fontSize:12, color:'var(--sem-red)' }}
              >
                {busy ? 'Reversing…' : 'Reverse'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function JournalEntries() {
  const scope    = useScope()
  const { profile, membership } = useAuthStore()
  const role     = useUserRole()
  const navigate = useNavigate()

  const orgId    = scope.orgId
  const clientId = scope.clientId
  const userId   = profile?.id ?? ''

  const [batches,   setBatches]   = useState<ManualJournalBatch[]>([])
  const [accounts,  setAccounts]  = useState<Account[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [filter,    setFilter]    = useState<BatchStatus | 'all'>('all')
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())

  // Guard: requires client context
  useEffect(() => {
    if (scope.isReady && !clientId) navigate('/clients', { replace: true })
  }, [scope.isReady, clientId, navigate])

  // Guard: requires canPostJournalEntries
  useEffect(() => {
    if (!role.loading && !role.canPostJournalEntries) navigate('/unauthorized', { replace: true })
  }, [role.loading, role.canPostJournalEntries, navigate])

  const load = useCallback(async () => {
    if (!orgId || !clientId) return
    setLoading(true)
    try {
      const [batchList, accts] = await Promise.all([
        listManualJournalBatches(orgId, clientId, { periodYear: yearFilter, limit: 100 }),
        getAccounts(orgId, { clientId, includeInactive: false })
      ])
      setBatches(batchList)
      setAccounts(accts)
    } finally {
      setLoading(false)
    }
  }, [orgId, clientId, yearFilter])

  useEffect(() => { load() }, [load])

  if (!scope.isReady || role.loading) {
    return (
      <div style={{ padding:32, color:'var(--lp-text-muted)', fontSize:13 }}>Loading…</div>
    )
  }
  if (!clientId) return null

  const displayed = filter === 'all'
    ? batches
    : batches.filter(b => b.status === filter)

  const counts = {
    all:      batches.length,
    posted:   batches.filter(b => b.status === 'posted').length,
    draft:    batches.filter(b => b.status === 'draft').length,
    reversed: batches.filter(b => b.status === 'reversed').length,
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer',
    fontSize:12.5, fontWeight:600, fontFamily:'inherit',
    background: active ? 'var(--lp-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--lp-text-muted)',
  })

  return (
    <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--lp-text)', letterSpacing:'-0.01em' }}>
            Journal Entries
          </div>
          <div style={{ fontSize:12.5, color:'var(--lp-text-muted)', marginTop:2 }}>
            Manual adjustments, closing entries, depreciation, and opening balances
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <select
            value={yearFilter}
            onChange={e => setYearFilter(Number(e.target.value))}
            style={{
              padding:'6px 10px', background:'var(--lp-bg)',
              border:'0.5px solid var(--lp-border)', borderRadius:6,
              fontSize:13, color:'var(--lp-text)', fontFamily:'inherit'
            }}
          >
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {role.canPostJournalEntries && (
            <button
              onClick={() => setShowForm(v => !v)}
              className="lp-btn lp-btn-primary"
              style={{ fontSize:13 }}
            >
              {showForm ? 'Cancel' : '+ New Entry'}
            </button>
          )}
        </div>
      </div>

      {/* New batch form */}
      {showForm && (
        <NewBatchForm
          orgId={orgId}
          clientId={clientId}
          userId={userId}
          accounts={accounts}
          onCreated={() => { setShowForm(false); load() }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16 }}>
        {(['all','posted','draft','reversed'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} style={tabStyle(filter === s)}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            <span style={{ marginLeft:5, opacity:0.7 }}>({counts[s]})</span>
          </button>
        ))}
      </div>

      {/* Batch list */}
      <div style={{
        border:'0.5px solid var(--lp-border)', borderRadius:10,
        background:'var(--lp-surface)', overflow:'hidden'
      }}>
        {loading ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--lp-text-muted)', fontSize:13 }}>
            Loading entries…
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--lp-text-muted)', fontSize:13 }}>
            {filter === 'all'
              ? 'No journal entries for this period. Click "+ New Entry" to post one.'
              : `No ${filter} entries.`}
          </div>
        ) : (
          displayed.map(b => (
            <BatchRow
              key={b.id}
              batch={b}
              orgId={orgId ?? ''}
              currentUserId={userId}
              canReverse={role.canReverseManualBatch}
              canApprove={role.canApproveManualBatch}
              onAction={load}
            />
          ))
        )}
      </div>
    </div>
  )
}
