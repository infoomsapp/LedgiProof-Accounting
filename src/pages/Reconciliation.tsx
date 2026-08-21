// PATH: src/pages/Reconciliation.tsx
//
// CSS-TODO (file-level): remaining are semantic alpha gradations for matched/unmatched states (green 0.04/0.08/0.1/0.3, red 0.3, blue 0.08) plus generic white overlays 0.03/0.15. Direct mappings migrated.
//
// Visual bank reconciliation.
// Bookkeeper loads a period, enters the bank statement balance,
// checks off each matching transaction, watches the difference go to $0.

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore }  from '../store/auth.store'
import { useScope }      from '../hooks/useScope'
import {
  createSession, getSessions, loadSessionTransactions,
  loadUnreconciledTransactions, addTransactionsToSession,
  toggleCleared, clearAll, unclearAll, autoMatch, closeSession,
  type ReconciliationSummary
} from '../services/reconciliation.service'
import SemaphoreBadge    from '../components/semaphore/SemaphoreBadge'
import type { Transaction } from '../types/database.types'
import { formatCurrency } from '../lib/currency'

type TxWithCleared = Transaction & { is_cleared: boolean; item_id: string }

function fmt(n: number) {
  return formatCurrency(n)
}

// ── Session setup card ────────────────────────────────────────────────────────
function NewSessionForm({ orgId, userId, clientId, onCreated }: {
  orgId: string; userId: string; clientId: string | null; onCreated: () => void
}) {
  const today  = new Date().toISOString().slice(0,10)
  const first  = today.slice(0,8) + '01'
  const [start,   setStart]   = useState(first)
  const [end,     setEnd]     = useState(today)
  const [opening, setOpening] = useState('')
  const [closing, setClosing] = useState('')
  const [creating, setCreating] = useState(false)
  const [error,   setError]   = useState<string|null>(null)

  async function handleCreate() {
    if (!opening || !closing) return setError('Enter both opening and closing balance')
    setCreating(true); setError(null)
    try {
      const session = await createSession({
        orgId, userId, clientId,
        periodStart:    start,
        periodEnd:      end,
        openingBalance: parseFloat(opening),
        closingBalance: parseFloat(closing)
      })
      // Auto-load transactions for this period
      const txns = await loadUnreconciledTransactions(orgId, start, end, clientId)
      if (txns.length > 0) {
        await addTransactionsToSession(session.id, txns.map(t => t.id), orgId)
      }
      onCreated()
    } catch (e: any) { setError(e.message) }
    setCreating(false)
  }

  return (
    <div className="lp-card" style={{ maxWidth: 520 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 16 }}>
        New Reconciliation Period
      </div>
      {error && (
        <div style={{ padding:'8px 12px', borderRadius:7, marginBottom:12,
          background:'var(--sem-red-bg)', border:'0.5px solid rgba(239,68,68,0.3)',
          fontSize:12.5, color:'var(--sem-red)' }}>
          {error}
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div>
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>
            Period start
          </label>
          <input type="date" className="lp-input" value={start}
            onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>
            Period end
          </label>
          <input type="date" className="lp-input" value={end}
            onChange={e => setEnd(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>
            Opening balance (bank statement)
          </label>
          <input type="number" step="0.01" className="lp-input"
            placeholder="0.00" value={opening}
            onChange={e => setOpening(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>
            Closing balance (bank statement)
          </label>
          <input type="number" step="0.01" className="lp-input"
            placeholder="0.00" value={closing}
            onChange={e => setClosing(e.target.value)} />
        </div>
      </div>
      <button
        onClick={handleCreate}
        disabled={creating || !start || !end || !opening || !closing}
        className="lp-btn lp-btn-primary"
        style={{ justifyContent:'center', width:'100%' }}
      >
        {creating ? 'Creating…' : 'Start reconciliation →'}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Reconciliation() {
  const { profile } = useAuthStore()
  // scope.clientId is set when reached via /clients/:clientId/reconciliation.
  // Without it, every client's reconciliation sessions and unreconciled
  // transactions were combined into one unfiltered list regardless of which
  // client's URL was loaded — same class of bug already fixed on
  // Transactions.tsx/BankImports.tsx (reconciliation_sessions needed a real
  // client_id column added first; see the migration).
  const scope    = useScope()
  const orgId    = scope.orgId
  const clientId = scope.clientId
  const userId   = profile?.id ?? ''

  const [sessions,    setSessions]   = useState<ReconciliationSummary[]>([])
  const [activeId,    setActiveId]   = useState<string | null>(null)
  const [activeSess,  setActiveSess] = useState<ReconciliationSummary | null>(null)
  const [items,       setItems]      = useState<TxWithCleared[]>([])
  const [loading,     setLoading]    = useState(true)
  const [autoMatching, setAutoMatch] = useState(false)
  const [closing,     setClosing]    = useState(false)
  const [closedResult, setClosedResult] = useState<{ balanced: boolean; difference: number } | null>(null)
  const [showNew,     setShowNew]    = useState(false)
  const [search,      setSearch]     = useState('')

  // ── Load sessions list ─────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const data = await getSessions(orgId, clientId)
    setSessions(data)
    setLoading(false)
  }, [orgId, clientId])

  useEffect(() => { loadSessions() }, [loadSessions])

  // ── Load active session ────────────────────────────────────────────────
  const loadActive = useCallback(async () => {
    if (!activeId || !orgId) return
    const [txns, summary] = await Promise.all([
      loadSessionTransactions(activeId, orgId),
      getSessions(orgId, clientId).then(list => list.find(s => s.session_id === activeId) ?? null)
    ])
    setItems(txns)
    setActiveSess(summary)
  }, [activeId, orgId, clientId])

  useEffect(() => { if (activeId) loadActive() }, [activeId, loadActive])

  // ── Toggle a single transaction ────────────────────────────────────────
  async function handleToggle(item: TxWithCleared) {
    if (!activeSess || activeSess.status !== 'open') return
    const next = !item.is_cleared
    setItems(prev => prev.map(i => i.item_id === item.item_id ? { ...i, is_cleared: next } : i))
    await toggleCleared(item.item_id, next)
    await loadActive()
  }

  // ── Auto-match (Plaid transactions) ───────────────────────────────────
  async function handleAutoMatch() {
    if (!activeId) return
    setAutoMatch(true)
    const count = await autoMatch(activeId, orgId)
    await loadActive()
    setAutoMatch(false)
    if (count === 0) alert('No automatic matches found. Mark transactions manually.')
  }

  // ── Clear / unclear all ────────────────────────────────────────────────
  async function handleClearAll() {
    if (!activeId) return
    await clearAll(activeId)
    await loadActive()
  }

  async function handleUnclearAll() {
    if (!activeId) return
    await unclearAll(activeId)
    await loadActive()
  }

  // ── Close session ──────────────────────────────────────────────────────
  async function handleClose() {
    if (!activeId || !userId) return
    setClosing(true)
    try {
      const result = await closeSession(activeId, userId)
      setClosedResult(result)
      await loadSessions()
      await loadActive()
    } catch (e: any) { alert(e.message) }
    setClosing(false)
  }

  // ── Filtered items ─────────────────────────────────────────────────────
  const visible = items.filter(t =>
    !search ||
    t.description?.toLowerCase().includes(search.toLowerCase()) ||
    t.reference?.toLowerCase().includes(search.toLowerCase()) ||
    String(t.amount).includes(search)
  )

  const clearedTotal   = items.filter(i => i.is_cleared).reduce((s,i) => s + i.amount, 0)
  const unclearedCount = items.filter(i => !i.is_cleared).length
  const difference     = activeSess
    ? clearedTotal + activeSess.statement_opening_balance - activeSess.statement_closing_balance
    : 0
  const isBalanced     = Math.abs(difference) < 0.01

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'100%' }}>

      {/* ── Left: session list ─────────────────────────────────────────── */}
      <div style={{
        width: 260, flexShrink:0, borderRight:'0.5px solid var(--lp-border)',
        display:'flex', flexDirection:'column', overflowY:'auto'
      }}>
        <div style={{ padding:'16px 14px 12px', borderBottom:'0.5px solid var(--lp-border)' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--lp-text)', marginBottom:10 }}>
            Reconciliation
          </div>
          <button
            onClick={() => { setShowNew(true); setActiveId(null) }}
            className="lp-btn lp-btn-primary"
            style={{ width:'100%', justifyContent:'center', fontSize:12.5 }}
          >
            + New period
          </button>
        </div>

        {loading ? (
          <div style={{ padding:16, fontSize:12, color:'var(--lp-text-muted)' }}>Loading…</div>
        ) : sessions.length === 0 ? (
          <div style={{ padding:16, fontSize:12, color:'var(--lp-text-muted)', lineHeight:1.6 }}>
            No reconciliation periods yet.<br />Create your first one.
          </div>
        ) : (
          <div style={{ flex:1, overflowY:'auto' }}>
            {sessions.map(s => {
              const isActive = s.session_id === activeId
              const balanced = Math.abs(s.difference ?? 1) < 0.01
              return (
                <button
                  key={s.session_id}
                  onClick={() => { setActiveId(s.session_id); setShowNew(false); setClosedResult(null) }}
                  style={{
                    width:'100%', background: isActive ? 'rgba(59,130,246,0.08)' : 'none',
                    border:'none', borderBottom:'0.5px solid var(--lp-border)',
                    padding:'11px 14px', textAlign:'left', cursor:'pointer', transition:'background 0.1s'
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background='rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background='none' }}
                >
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, color:'var(--lp-text)', fontWeight:500 }}>
                      {new Date(s.period_end + 'T12:00:00').toLocaleDateString('en-US', { month:'short', year:'numeric' })}
                    </span>
                    <span style={{
                      fontSize:9.5, padding:'2px 6px', borderRadius:100, fontWeight:600,
                      color: s.status === 'closed' ? 'var(--sem-green)'
                           : s.status === 'discrepancy' ? 'var(--sem-red)' : 'var(--sem-amber)',
                      background: s.status === 'closed' ? 'rgba(34,197,94,0.1)'
                                : s.status === 'discrepancy' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                      textTransform:'uppercase'
                    }}>
                      {s.status}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--lp-text-muted)' }}>
                    {s.cleared_items}/{s.total_items} cleared
                    {s.status !== 'open' && (
                      <span style={{
                        marginLeft:6,
                        color: balanced ? 'var(--sem-green)' : 'var(--sem-red)'
                      }}>
                        · {balanced ? '✓ Balanced' : `Δ ${fmt(s.difference ?? 0)}`}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Right: main content ────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto', padding:'24px 28px' }}>

        {/* New session form */}
        {showNew && (
          <NewSessionForm
            orgId={orgId} userId={userId} clientId={clientId}
            onCreated={() => { setShowNew(false); loadSessions() }}
          />
        )}

        {/* Active session */}
        {activeId && activeSess && (
          <>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
              <div>
                <div style={{ fontSize:17, fontWeight:700, color:'var(--lp-text)', letterSpacing:'-0.01em' }}>
                  {new Date(activeSess.period_start+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                  {' — '}
                  {new Date(activeSess.period_end+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                </div>
                <div style={{ fontSize:12.5, color:'var(--lp-text-muted)', marginTop:3 }}>
                  {activeSess.cleared_items} of {activeSess.total_items} transactions cleared
                </div>
              </div>

              {activeSess.status === 'open' && (
                <div style={{ display:'flex', gap:7 }}>
                  <button onClick={handleAutoMatch} disabled={autoMatching} className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}>
                    {autoMatching ? '…' : '⚡ Auto-match'}
                  </button>
                  <button onClick={handleClearAll} className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}>
                    ✓ All
                  </button>
                  <button onClick={handleUnclearAll} className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}>
                    ✗ None
                  </button>
                  <button
                    onClick={handleClose}
                    disabled={closing || !isBalanced}
                    className="lp-btn lp-btn-primary"
                    style={{ fontSize:12.5,
                      opacity: isBalanced ? 1 : 0.4,
                      cursor: isBalanced ? 'pointer' : 'not-allowed' }}
                    title={!isBalanced ? `Difference of ${fmt(difference)} must be $0 to close` : undefined}
                  >
                    {closing ? 'Closing…' : '✓ Close period'}
                  </button>
                </div>
              )}
            </div>

            {/* Close result banner */}
            {closedResult && (
              <div style={{
                padding:'12px 16px', borderRadius:9, marginBottom:16,
                background: closedResult.balanced ? 'rgba(34,197,94,0.08)' : 'var(--sem-red-bg)',
                border: `0.5px solid ${closedResult.balanced ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                fontSize:13, color: closedResult.balanced ? 'var(--sem-green)' : 'var(--sem-red)',
                display:'flex', alignItems:'center', gap:10
              }}>
                <span style={{ fontSize:18 }}>{closedResult.balanced ? '🎉' : '⚠️'}</span>
                <span>
                  {closedResult.balanced
                    ? 'Period closed and balanced. All cleared transactions marked blue (verified).'
                    : `Period closed with a discrepancy of ${fmt(closedResult.difference)}. Review outstanding items.`}
                </span>
              </div>
            )}

            {/* Balance meter */}
            <div className="lp-card" style={{ marginBottom:16, padding:'14px 18px' }}>
              <div style={{ display:'flex', gap:0, flexWrap:'wrap' }}>
                {[
                  { label:'Opening balance',  value: activeSess.statement_opening_balance },
                  { label:'Statement closing', value: activeSess.statement_closing_balance },
                  { label:'Cleared total',     value: clearedTotal },
                ].map(({ label, value }, i) => (
                  <div key={i} style={{
                    flex:1, minWidth:120,
                    borderRight: i < 2 ? '0.5px solid var(--lp-border)' : 'none',
                    padding:'0 16px 0 0', marginRight: i < 2 ? 16 : 0
                  }}>
                    <div style={{ fontSize:11, color:'var(--lp-text-muted)', marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:16, fontWeight:600, color:'var(--lp-text)' }}>{fmt(value)}</div>
                  </div>
                ))}

                {/* Difference — the hero number */}
                <div style={{
                  marginLeft:'auto', padding:'8px 16px', borderRadius:9,
                  background: isBalanced ? 'rgba(34,197,94,0.08)' : 'var(--sem-red-bg)',
                  border: `0.5px solid ${isBalanced ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                }}>
                  <div style={{ fontSize:11, color:'var(--lp-text-muted)', marginBottom:4 }}>Difference</div>
                  <div style={{ fontSize:20, fontWeight:700, color: isBalanced ? 'var(--sem-green)' : 'var(--sem-red)' }}>
                    {isBalanced ? '✓ $0.00' : fmt(difference)}
                  </div>
                  {!isBalanced && (
                    <div style={{ fontSize:11, color:'var(--lp-text-muted)', marginTop:2 }}>
                      {unclearedCount} uncleared
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom:12 }}>
              <input
                className="lp-input"
                style={{ width:260 }}
                placeholder="Search transactions…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Transaction table */}
            <div className="lp-table-wrap" style={{ flex:1 }}>
              <table className="lp-table">
                <thead>
                  <tr>
                    <th style={{ width:40 }}>✓</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Status</th>
                    <th style={{ textAlign:'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'var(--lp-text-muted)' }}>
                      No transactions in this period
                    </td></tr>
                  ) : visible.map(tx => (
                    <tr
                      key={tx.item_id}
                      onClick={() => activeSess.status === 'open' && handleToggle(tx)}
                      style={{
                        cursor: activeSess.status === 'open' ? 'pointer' : 'default',
                        background: tx.is_cleared ? 'rgba(34,197,94,0.04)' : 'transparent',
                        opacity: activeSess.status !== 'open' && !tx.is_cleared ? 0.6 : 1,
                        transition: 'background 0.1s'
                      }}
                      onMouseEnter={e => {
                        if (activeSess.status === 'open')
                          e.currentTarget.style.background = tx.is_cleared
                            ? 'var(--sem-green-bg)'
                            : 'rgba(255,255,255,0.03)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = tx.is_cleared
                          ? 'rgba(34,197,94,0.04)'
                          : 'transparent'
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign:'center' }}>
                        <div style={{
                          width:17, height:17, borderRadius:4, margin:'0 auto',
                          background: tx.is_cleared ? 'var(--sem-green)' : 'rgba(255,255,255,0.06)',
                          border: `1.5px solid ${tx.is_cleared ? 'var(--sem-green)' : 'rgba(255,255,255,0.15)'}`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:10, color:'#fff', transition:'all 0.1s'
                        }}>
                          {tx.is_cleared && '✓'}
                        </div>
                      </td>

                      <td style={{ fontSize:12.5, color:'var(--lp-text-muted)', whiteSpace:'nowrap' }}>
                        {tx.transaction_date}
                      </td>

                      <td style={{
                        fontSize:12.5, color: tx.is_cleared ? 'var(--lp-text)' : 'var(--lp-text-muted)',
                        maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                      }}>
                        {tx.description ?? '—'}
                      </td>

                      <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--lp-text-muted)',
                        maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {tx.reference ?? '—'}
                      </td>

                      <td><SemaphoreBadge status={tx.semaphore} size="sm" /></td>

                      <td style={{
                        textAlign:'right', fontWeight:500, whiteSpace:'nowrap',
                        color: tx.amount >= 0 ? 'var(--lp-text)' : '#f87171',
                        fontSize:13
                      }}>
                        {fmt(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Empty state */}
        {!showNew && !activeId && (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🏦</div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--lp-text)', marginBottom:6 }}>
                Bank Reconciliation
              </div>
              <div style={{ fontSize:13, color:'var(--lp-text-muted)', maxWidth:300, lineHeight:1.7 }}>
                Select a period from the left or create a new reconciliation session.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}