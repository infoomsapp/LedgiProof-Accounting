// PATH: src/pages/Transactions.tsx
//
// CSS-TODO (file-level): remaining are blue accent gradations rgba(59,130,246,0.04/0.05/0.08/0.1/0.15/0.2/0.3/0.4) for transaction-state visuals. Need --tx-state-* vars in globals.css. Direct mappings migrated.
//
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams }   from 'react-router-dom'
import { useTranslation }    from 'react-i18next'
import { useAuthStore }      from '../store/auth.store'
import { useScope }          from '../hooks/useScope'
import { useTransactions }   from '../hooks/useTransactions'
import SemaphoreFilter       from '../components/semaphore/SemaphoreFilter'
import SemaphoreBadge        from '../components/semaphore/SemaphoreBadge'
import TransactionDetail     from '../components/transactions/TransactionDetail'
import { exportTransactionsCSV, downloadCSV } from '../services/export.service'
import { approveTransaction, lockTransaction } from '../services/transactions.service'
import { postTransactionToLedger } from '../services/journal.service'
import { askAi } from '../services/ai-assistant.service'
import { db } from '../lib/supabase'
import type { Transaction, SemaphoreStatus, Account } from '../types/database.types'
import { formatCurrency } from '../lib/currency'
import Modal from '../components/ui/modal'

type FilterSem = SemaphoreStatus | 'all'

const fmt = (n: number) => formatCurrency(n)

export default function Transactions() {
  const { t }           = useTranslation()
  const { membership }  = useAuthStore()
  // scope.clientId is set when reached via /clients/:clientId/transactions
  // (a firm's client workspace) and null for solo/pyme orgs. Without this,
  // every client's transactions were combined into one unfiltered list
  // regardless of which client's URL was loaded — the same class of bug
  // already found and fixed on Reports.tsx earlier.
  const scope    = useScope()
  const orgId    = scope.orgId
  const clientId = scope.clientId

  // Deep-link params (from the Solo dashboard's pending-review CTAs).
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')

  // Filters
  const [semFilter, setSemFilter]   = useState<FilterSem>('all')
  // ?filter=pending means amber + red together, which the single-value
  // semaphore chips can't express — so it's its own client-side toggle.
  const [pendingOnly, setPendingOnly] = useState(() => searchParams.get('filter') === 'pending')
  const [search,    setSearch]      = useState('')
  const [dateFrom,  setDateFrom]    = useState('')
  const [dateTo,    setDateTo]      = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Selection (bulk actions)
  const [selected,  setSelected]    = useState<Set<string>>(new Set())
  const [detail,    setDetail]      = useState<Transaction | null>(null)
  const [tick,      setTick]        = useState(0)
  const [bulkWorking, setBulkWorking] = useState(false)
  const [bulkError,   setBulkError]   = useState<string | null>(null)

  // Bulk: post to ledger — needs the Chart of Accounts to offer debit/credit
  // account choices, and its own modal since (unlike Approve/Lock) it needs
  // input before it can run.
  const [accounts,      setAccounts]      = useState<Account[]>([])
  const [showPostModal, setShowPostModal] = useState(false)
  const [postDebitId,   setPostDebitId]   = useState('')
  const [postCreditId,  setPostCreditId]  = useState('')
  const [postMemo,      setPostMemo]      = useState('')
  const [postSummary,   setPostSummary]   = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    let q = db.from('accounts').select('*').eq('org_id', orgId).eq('is_active', true).order('code')
    q = clientId ? q.eq('client_id', clientId) : q.is('client_id', null)
    q.then(({ data }) => setAccounts((data ?? []) as Account[]))
  }, [orgId, clientId])

  // AI assistant
  const [showAI,    setShowAI]      = useState(false)
  const [aiQuery,   setAiQuery]     = useState('')
  const [aiAnswer,  setAiAnswer]    = useState('')
  const [aiLoading, setAiLoading]   = useState(false)

  useEffect(() => {
    function handler() { setTick(t => t + 1) }
    window.addEventListener('lp:tx-updated', handler)
    return () => window.removeEventListener('lp:tx-updated', handler)
  }, [])

  const { data: rows = [], isLoading } = useTransactions(
    orgId,
    {
      ...(semFilter !== 'all' ? { semaphore: semFilter } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo   ? { dateTo }   : {}),
      clientId
    },
    tick
  )

  // Client-side search on top of server filter
  const visible = rows.filter(r =>
    (!search ||
      r.reference?.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase()))
    && (!pendingOnly || r.semaphore === 'amber' || r.semaphore === 'red')
  )

  // Deep link ?id=… opens that transaction's detail once rows are loaded
  // (e.g. tapping a row in the Solo dashboard's pending-review list).
  useEffect(() => {
    if (!idParam || detail) return
    const found = rows.find(r => r.id === idParam)
    if (found) setDetail(found)
  }, [idParam, rows, detail])

  const counts = rows.reduce((a, r) => {
    a[r.semaphore as SemaphoreStatus] = (a[r.semaphore as SemaphoreStatus] ?? 0) + 1
    return a
  }, {} as Record<SemaphoreStatus, number>)

  // Selected rows
  const selectedRows  = visible.filter(r => selected.has(r.id))
  const allSelected   = visible.length > 0 && visible.every(r => selected.has(r.id))
  const someSelected  = selected.size > 0

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(visible.map(r => r.id)))
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Bulk: approve selected (amber/green → blue) ────────────────────────
  // Routes through transactions.service.approveTransaction so the audit
  // hash chain (appendAuditEvent) is written — a raw db.update() here would
  // silently skip the audit trail, which the Constitution explicitly forbids.
  async function bulkApprove() {
    const targets = selectedRows.filter(r =>
      r.semaphore === 'amber' || r.semaphore === 'green'
    )
    if (!targets.length) return
    if (!membership?.user_id) {
      setBulkError(t('transactions.noAuthUserApprove'))
      return
    }
    setBulkWorking(true)
    setBulkError(null)

    const results = await Promise.allSettled(targets.map(t =>
      approveTransaction({
        transactionId: t.id,
        orgId:         orgId,
        approverId:    membership.user_id
      })
    ))

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    )
    if (failures.length) {
      setBulkError(t('transactions.approvalsFailed', {
        failed:  failures.length,
        total:   targets.length,
        details: failures.map(f => (f.reason as Error)?.message ?? String(f.reason)).join('; ')
      }))
    }

    setSelected(new Set())
    setTick(t => t + 1)
    setBulkWorking(false)
  }

  // ── Bulk: lock selected (blue → locked) ────────────────────────────────
  // Routes through transactions.service.lockTransaction, which computes
  // final_hash and writes the audit event BEFORE calling UPDATE. A raw
  // db.update({ locked_at }) here always violates transactions_lock_final_hash_chk
  // (final_hash is required whenever locked_at is set) — that raw version
  // failed silently on every call because nothing checked the returned error.
  async function bulkLock() {
    const targets = selectedRows.filter(r =>
      r.semaphore === 'blue' && !r.locked_at
    )
    if (!targets.length) return
    setBulkWorking(true)
    setBulkError(null)

    const results = await Promise.allSettled(targets.map(t =>
      lockTransaction(t.id, orgId)
    ))

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    )
    if (failures.length) {
      setBulkError(t('transactions.locksFailed', {
        failed:  failures.length,
        total:   targets.length,
        details: failures.map(f => (f.reason as Error)?.message ?? String(f.reason)).join('; ')
      }))
    }

    setSelected(new Set())
    setTick(t => t + 1)
    setBulkWorking(false)
  }

  // ── Bulk: post selected transactions straight to the ledger ────────────
  // The only path that ever populated journal_entries before this was
  // AccountAssignment.tsx, one transaction at a time — this is the same
  // engine (postTransactionToLedger, which itself mirrors
  // AccountAssignment's post-then-approve sequence), just looped over a
  // multi-select so a whole batch of same-category transactions (e.g. a
  // month of the same recurring vendor) can be posted to one debit/credit
  // pair in a single action instead of opening each one individually.
  async function bulkPostToLedger() {
    const targets = selectedRows.filter(r => r.semaphore !== 'blue')
    if (!targets.length || !postDebitId || !postCreditId) return
    if (!membership?.user_id) {
      setBulkError(t('transactions.noAuthUserPost'))
      return
    }

    setBulkWorking(true)
    setBulkError(null)
    setPostSummary(null)

    const results = await Promise.allSettled(targets.map(t =>
      postTransactionToLedger(
        {
          id: t.id, amount: t.amount, currency: t.currency,
          transaction_date: t.transaction_date,
          description: postMemo.trim() || t.description
        },
        postDebitId, postCreditId, orgId, membership.user_id
      )
    ))

    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    const alreadyPosted = failures.filter(f => (f.reason as Error)?.message === 'Already posted to the ledger')
    const realFailures  = failures.filter(f => (f.reason as Error)?.message !== 'Already posted to the ledger')
    const succeeded = targets.length - failures.length

    setPostSummary(
      t('transactions.postedSummary', { ok: succeeded, total: targets.length }) +
      (alreadyPosted.length ? t('transactions.postedAlready', { count: alreadyPosted.length }) : '') +
      (realFailures.length
        ? t('transactions.postedFailed', {
            count:   realFailures.length,
            details: realFailures.map(f => (f.reason as Error)?.message ?? String(f.reason)).join('; ')
          })
        : '')
    )

    setSelected(new Set())
    setTick(t => t + 1)
    setBulkWorking(false)
    if (!realFailures.length) {
      setShowPostModal(false)
      setPostDebitId(''); setPostCreditId(''); setPostMemo('')
    }
  }

  // ── AI Accounting Assistant ──────────────────────────────────────────
  async function askAI() {
    if (!aiQuery.trim()) return
    if (!orgId) { setAiAnswer(t('transactions.noWorkspaceSelected')); return }
    setAiLoading(true); setAiAnswer('')

    // Compact context for the assistant. Routed through OUR ai-query Edge
    // Function via askAi() — no external API key ever touches the browser and
    // the call is quota-gated (runWithQuota 'ai_queries'). This replaced a
    // direct client-side fetch to api.anthropic.com that had no auth (always
    // failed) and bypassed the quota system.
    const income   = visible.filter(r => r.amount > 0).reduce((s,r) => s + r.amount, 0)
    const expenses = visible.filter(r => r.amount < 0).reduce((s,r) => s + Math.abs(r.amount), 0)
    const pending  = visible.filter(r => r.semaphore === 'amber' || r.semaphore === 'red').length

    try {
      const { reply } = await askAi({
        orgId,
        prompt: aiQuery,
        context: {
          page:          'transactions',
          shown:         visible.length,
          income,
          expenses,
          net:           income - expenses,
          pendingReview: pending,
          dateFrom:      dateFrom || null,
          dateTo:        dateTo   || null
        }
      })
      setAiAnswer(reply)
    } catch (e) {
      // askAi throws QuotaExceededError (message = upgrade prompt) or a generic
      // Error; both carry a user-readable message.
      setAiAnswer(e instanceof Error ? e.message : t('transactions.aiUnreachable'))
    }
    setAiLoading(false)
  }

  const hasDateFilter = !!dateFrom || !!dateTo

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left: transaction list ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        padding: '20px 20px 0', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h1 className="lp-page-title">{t('transactions.title')}</h1>
            <p className="lp-page-sub">
              {t('transactions.entriesCount', { count: visible.length })}
              {someSelected && (
                <span style={{ color: 'var(--lp-accent)', marginLeft: 8 }}>
                  {t('transactions.selectedSuffix', { count: selected.size })}
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* AI Assistant toggle */}
            <button
              onClick={() => setShowAI(s => !s)}
              className="lp-btn lp-btn-ghost"
              style={{ fontSize: 12.5,
                background: showAI ? 'rgba(167,139,250,0.1)' : undefined,
                borderColor: showAI ? 'rgba(167,139,250,0.4)' : undefined,
                color:       showAI ? 'var(--lp-violet)' : undefined
              }}
            >
              {t('transactions.aiAssistant')}
            </button>
            {/* Filters toggle */}
            <button
              onClick={() => setShowFilters(s => !s)}
              className="lp-btn lp-btn-ghost"
              style={{ fontSize: 12.5,
                background: (showFilters || hasDateFilter) ? 'rgba(59,130,246,0.08)' : undefined,
                borderColor: hasDateFilter ? 'rgba(59,130,246,0.4)' : undefined,
                color:       hasDateFilter ? 'var(--lp-accent)' : undefined
              }}
            >
              {t('transactions.filtersButton')}{hasDateFilter ? ' ●' : ''}
            </button>
            {/* Search */}
            <input
              className="lp-input"
              style={{ width: 190, fontSize: 12.5 }}
              placeholder={t('transactions.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {/* CSV export */}
            {visible.length > 0 && (
              <button
                onClick={() => downloadCSV(
                  exportTransactionsCSV(visible),
                  `transactions-${new Date().toISOString().slice(0,10)}.csv`
                )}
                className="lp-btn lp-btn-ghost"
                style={{ fontSize: 12.5 }}
              >
                {t('transactions.csv')}
              </button>
            )}
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-end',
            padding: '12px 14px', borderRadius: 9,
            background: 'rgba(59,130,246,0.05)', border: '0.5px solid rgba(59,130,246,0.15)' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>
                {t('transactions.from')}
              </label>
              <input type="date" className="lp-input" style={{ fontSize: 12.5 }}
                value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>
                {t('transactions.to')}
              </label>
              <input type="date" className="lp-input" style={{ fontSize: 12.5 }}
                value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            {hasDateFilter && (
              <button
                onClick={() => { setDateFrom(''); setDateTo('') }}
                className="lp-btn lp-btn-ghost"
                style={{ fontSize: 12, color: 'var(--sem-red)', borderColor: 'rgba(239,68,68,0.25)' }}
              >
                {t('transactions.clearDates')}
              </button>
            )}
          </div>
        )}

        {/* AI assistant panel */}
        {showAI && (
          <div style={{ marginBottom: 12, padding: '14px', borderRadius: 10,
            background: 'var(--lp-violet-bg)', border: '0.5px solid rgba(167,139,250,0.2)' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--lp-violet)', marginBottom: 10 }}>
              {t('transactions.aiPanelTitle')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="lp-input"
                style={{ flex: 1, fontSize: 12.5 }}
                placeholder={t('transactions.aiPlaceholder')}
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && askAI()}
              />
              <button
                onClick={askAI}
                disabled={aiLoading || !aiQuery.trim()}
                className="lp-btn lp-btn-primary"
                style={{ fontSize: 12.5, padding: '0 14px' }}
              >
                {aiLoading ? '…' : t('transactions.ask')}
              </button>
            </div>
            {aiAnswer && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#c4b5fd',
                lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {aiAnswer}
              </div>
            )}
          </div>
        )}

        {/* Semaphore filter */}
        <div style={{ marginBottom: 10 }}>
          <SemaphoreFilter
            value={semFilter}
            onChange={v => { setSemFilter(v); setPendingOnly(false) }}
            counts={counts as any}
          />
        </div>

        {/* Pending-only indicator (from ?filter=pending) */}
        {pendingOnly && (
          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
              {t('transactions.showingPendingOnly')}
            </span>
            <button
              onClick={() => setPendingOnly(false)}
              className="lp-btn lp-btn-ghost"
              style={{ fontSize: 11.5 }}
            >
              {t('transactions.showAll')}
            </button>
          </div>
        )}

        {/* Bulk action bar */}
        {someSelected && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center',
            padding: '8px 12px', borderRadius: 8, marginBottom: 8,
            background: 'var(--sem-blue-bg)', border: '0.5px solid rgba(59,130,246,0.2)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--lp-accent)', fontWeight: 500 }}>
              {t('transactions.selectedCount', { count: selected.size })}
            </span>
            <div style={{ height: 14, width: 1, background: 'rgba(59,130,246,0.3)' }} />
            <button
              onClick={bulkApprove}
              disabled={bulkWorking}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(34,197,94,0.1)', border: '0.5px solid rgba(34,197,94,0.3)',
                color: 'var(--sem-green)', fontFamily: 'inherit' }}
            >
              {t('transactions.approveToBlue')}
            </button>
            <button
              onClick={() => { setPostSummary(null); setShowPostModal(true) }}
              disabled={bulkWorking}
              title={t('transactions.postToLedgerTitle')}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                background: 'var(--lp-violet-bg)', border: '0.5px solid var(--lp-violet-border)',
                color: 'var(--lp-violet)', fontFamily: 'inherit' }}
            >
              {t('transactions.postToLedger')}
            </button>
            <button
              onClick={bulkLock}
              disabled={bulkWorking}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(59,130,246,0.1)', border: '0.5px solid rgba(59,130,246,0.3)',
                color: 'var(--lp-accent)', fontFamily: 'inherit' }}
            >
              {t('transactions.lock')}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                background: 'none', border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text-muted)', fontFamily: 'inherit', marginLeft: 'auto' }}
            >
              {t('transactions.clear')}
            </button>
          </div>
        )}

        {bulkError && (
          <div className="lp-banner error"
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12.5 }}>{bulkError}</span>
            <button
              onClick={() => setBulkError(null)}
              style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                background: 'none', border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text-muted)', fontFamily: 'inherit', marginLeft: 'auto' }}
            >
              {t('common.dismiss')}
            </button>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>{t('common.loading')}</div>
        ) : visible.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
                {t('transactions.noTransactions')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
                {hasDateFilter || search || semFilter !== 'all'
                  ? t('transactions.noMatchFilters')
                  : t('transactions.connectBankPrompt')}
              </div>
            </div>
          </div>
        ) : (
          <div className="lp-table-wrap" style={{ flex: 1, overflow: 'auto' }}>
            <table className="lp-table">
              <thead>
                <tr>
                  {/* Select all */}
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer', accentColor: 'var(--lp-accent)' }}
                    />
                  </th>
                  <th>{t('transactions.colDate')}</th>
                  <th>{t('transactions.colDescription')}</th>
                  <th>{t('transactions.colReference')}</th>
                  <th>{t('transactions.colStatus')}</th>
                  <th style={{ textAlign: 'right' }}>{t('transactions.colAmount')}</th>
                  <th style={{ textAlign: 'center' }}>{t('transactions.colLocked')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(tx => (
                  <tr
                    key={tx.id}
                    style={{
                      background: selected.has(tx.id)
                        ? 'var(--sem-blue-bg)'
                        : detail?.id === tx.id
                          ? 'rgba(59,130,246,0.04)'
                          : 'transparent',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => {
                      if (!selected.has(tx.id) && detail?.id !== tx.id)
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    }}
                    onMouseLeave={e => {
                      if (!selected.has(tx.id) && detail?.id !== tx.id)
                        e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(tx.id)}
                        onChange={() => toggleRow(tx.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer', accentColor: 'var(--lp-accent)' }}
                      />
                    </td>
                    {/* Rest of row — click to open detail */}
                    <td
                      onClick={() => setDetail(tx)}
                      style={{ cursor: 'pointer', fontSize: 12.5,
                        color: 'var(--lp-text-muted)', whiteSpace: 'nowrap' }}>
                      {tx.transaction_date}
                    </td>
                    <td
                      onClick={() => setDetail(tx)}
                      style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--lp-text)',
                        maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.description ?? '—'}
                    </td>
                    <td
                      onClick={() => setDetail(tx)}
                      style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 11,
                        color: 'var(--lp-text-muted)', maxWidth: 100,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.reference ?? '—'}
                    </td>
                    <td onClick={() => setDetail(tx)} style={{ cursor: 'pointer' }}>
                      <SemaphoreBadge status={tx.semaphore} size="sm" />
                    </td>
                    <td
                      onClick={() => setDetail(tx)}
                      style={{ textAlign: 'right', cursor: 'pointer', fontWeight: 500,
                        fontSize: 13, whiteSpace: 'nowrap',
                        color: tx.amount >= 0 ? 'var(--lp-text)' : '#f87171' }}>
                      {fmt(tx.amount)}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>
                      {tx.locked_at ? '🔒' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Right: detail panel ─────────────────────────────────────── */}
      {detail && (
        <TransactionDetail
          transaction={detail}
          orgId={orgId}
          onClose={() => setDetail(null)}
        />
      )}

      {/* ── Bulk post-to-ledger modal ────────────────────────────────── */}
      <Modal
        open={showPostModal}
        onClose={() => { if (!bulkWorking) { setShowPostModal(false); setPostSummary(null) } }}
        title={t('transactions.postModalTitle')}
        subtitle={t('transactions.postModalSubtitle', {
          postable: selectedRows.filter(r => r.semaphore !== 'blue').length,
          selected: selected.size
        })}
        width={440}
        footer={
          <>
            <button
              onClick={() => setShowPostModal(false)}
              className="lp-btn lp-btn-ghost"
              disabled={bulkWorking}
            >
              {postSummary ? t('common.close') : t('common.cancel')}
            </button>
            {!postSummary && (
              <button
                onClick={bulkPostToLedger}
                disabled={bulkWorking || !postDebitId || !postCreditId || postDebitId === postCreditId}
                className="lp-btn lp-btn-primary"
              >
                {bulkWorking
                  ? t('transactions.posting')
                  : t('transactions.postNToLedger', {
                      count: selectedRows.filter(r => r.semaphore !== 'blue').length
                    })}
              </button>
            )}
          </>
        }
      >
        {postSummary ? (
          <div style={{
            padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: 'var(--sem-green-bg)', border: '0.5px solid rgba(34,197,94,0.3)',
            color: 'var(--sem-green)', lineHeight: 1.6
          }}>
            {postSummary}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              fontSize: 12, color: 'var(--lp-text-muted)', lineHeight: 1.5,
              padding: '8px 12px', borderRadius: 7,
              background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)'
            }}>
              {t('transactions.postModalExplain')}
            </div>

            {postDebitId === postCreditId && postDebitId !== '' && (
              <div style={{
                padding: '8px 12px', borderRadius: 7, fontSize: 12,
                background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)',
                color: 'var(--sem-red)'
              }}>
                Debit and credit accounts must be different.
              </div>
            )}

            {(['Debit', 'Credit'] as const).map(label => {
              const value    = label === 'Debit' ? postDebitId : postCreditId
              const setValue = label === 'Debit' ? setPostDebitId : setPostCreditId
              const grouped = (['asset','liability','equity','income','expense'] as const)
                .map(type => ({ type, accs: accounts.filter(a => a.type === type) }))
                .filter(g => g.accs.length > 0)
              return (
                <div key={label}>
                  <label style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                    {label} account
                  </label>
                  <select
                    className="lp-input"
                    style={{ fontSize: 12.5 }}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                  >
                    <option value="">Select account…</option>
                    {grouped.map(({ type, accs }) => (
                      <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                        {accs.map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )
            })}

            <div>
              <label style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Memo (optional — defaults to each transaction's own description)
              </label>
              <input
                type="text"
                className="lp-input"
                style={{ fontSize: 12.5 }}
                value={postMemo}
                onChange={e => setPostMemo(e.target.value)}
                placeholder="e.g. Monthly office supplies"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
