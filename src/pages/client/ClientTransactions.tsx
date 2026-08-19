// PATH: src/pages/client/ClientTransactions.tsx
//
// Client's own transaction list. Same data the bookkeeper sees but scoped
// to client_id via RLS. Clicking a row opens the chat panel on the right.
//
// Lives at /client/transactions (registered under ClientPortalShell).
//
// Restrictions enforced server-side (RLS):
//   · Only rows where transactions.client_id matches the user's profile.client_id
//   · Only is_current = true (no historical versions)
//
// What the client CAN do here:
//   · See their transactions
//   · Filter by semaphore status
//   · Open the chat panel to ask the bookkeeper about a specific transaction
//
// What the client CANNOT do:
//   · Edit a transaction (Constitution: bookkeeper-owned)
//   · Delete a transaction (BLUE = immutable; for review states, the
//     bookkeeper decides)

import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClientContext } from '../../hooks/useClientContext'
import { useClientTransactions } from '../../hooks/useClientTransactions'
import SemaphoreFilter from '../../components/semaphore/SemaphoreFilter'
import SemaphoreBadge from '../../components/semaphore/SemaphoreBadge'
import ChatPanel from '../../components/chat/chatpanel'
import SemaphoreSpinner from '../../components/ui/SemaphoreSpinner'
import type { Transaction, SemaphoreStatus } from '../../types/database.types'
import { formatCurrency } from '../../lib/currency'
import { formatDateShort } from '../../lib/dates'

type FilterSem = SemaphoreStatus | 'all'

export default function ClientTransactions() {
  const { clientId, orgId, loading: ctxLoading } = useClientContext()
  const [params, setParams] = useSearchParams()

  // ── Filter state (URL-synced) ──────────────────────────────────────────
  const semFilterParam = (params.get('status') ?? 'all') as FilterSem
  const [semFilter, setSemFilter] = useState<FilterSem>(semFilterParam)

  function applySemFilter(v: FilterSem) {
    setSemFilter(v)
    if (v === 'all') params.delete('status')
    else             params.set('status', v)
    setParams(params, { replace: true })
  }

  // ── Selected transaction (for chat panel) ──────────────────────────────
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)

  // ── Data ───────────────────────────────────────────────────────────────
  const query = useClientTransactions(
    clientId ?? '',
    semFilter === 'all' ? undefined : { semaphore: semFilter }
  )

  const transactions = query.data ?? []

  // Counts for filter chips (computed from currently-loaded result set).
  // A global count across all states would need a separate aggregate RPC,
  // which is out of scope for this sprint.
  const counts = useMemo<Record<SemaphoreStatus, number>>(() => {
    const c: Record<SemaphoreStatus, number> = {
      blue: 0, green: 0, amber: 0, red: 0
    }
    transactions.forEach(tx => { c[tx.semaphore] = (c[tx.semaphore] ?? 0) + 1 })
    return c
  }, [transactions])

  // ── Render ─────────────────────────────────────────────────────────────

  if (ctxLoading) {
    return (
      <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
        <SemaphoreSpinner size="md" inline />
      </div>
    )
  }

  if (!clientId) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)' }}>
          No client linked to your account
        </div>
        <div style={{
          fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 6,
          maxWidth: 420, margin: '6px auto 0'
        }}>
          Your bookkeeper needs to link your account before you can view
          transactions. Reach out via Messages if this seems wrong.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* ─────────────────────── Left: transactions list ──────────────────── */}
      <div style={{
        flex: 1,
        minWidth: 0,
        padding: '24px 28px',
        overflowY: 'auto'
      }}>
        <h1 className="lp-page-title" style={{ margin: 0 }}>
          My Transactions
        </h1>
        <p className="lp-page-sub" style={{ margin: '4px 0 18px 0' }}>
          Click a transaction to ask your bookkeeper about it.
        </p>

        {/* Filter bar */}
        <div style={{ marginBottom: 14 }}>
          <SemaphoreFilter
            value={semFilter}
            onChange={applySemFilter}
            counts={counts}
          />
        </div>

        {/* State: loading */}
        {query.isLoading && (
          <div style={{ padding: 36, display: 'flex', justifyContent: 'center' }}>
            <SemaphoreSpinner size="sm" inline />
          </div>
        )}

        {/* State: error */}
        {query.isError && (
          <div style={{
            padding: '12px 14px',
            background: 'var(--sem-red-bg)',
            border: '0.5px solid var(--sem-red)',
            borderRadius: 8,
            color: 'var(--sem-red)',
            fontSize: 12.5,
            marginBottom: 12
          }}>
            ⚠ {(query.error as Error)?.message ?? 'Could not load transactions'}
            <button
              onClick={() => query.refetch()}
              style={{
                marginLeft: 12,
                background: 'transparent',
                border: '0.5px solid var(--sem-red)',
                color: 'var(--sem-red)',
                borderRadius: 6,
                padding: '2px 8px',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* State: empty */}
        {query.isSuccess && transactions.length === 0 && (
          <div style={{
            padding: '36px 20px',
            textAlign: 'center',
            background: 'var(--lp-surface)',
            border: '0.5px solid var(--lp-border)',
            borderRadius: 10
          }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
            <div style={{
              fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)',
              marginBottom: 4
            }}>
              {semFilter === 'all'
                ? 'No transactions yet'
                : `No ${semFilter} transactions`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
              {semFilter === 'all'
                ? 'Once your bank is connected, transactions will appear here.'
                : 'Try a different filter to see other transactions.'}
            </div>
          </div>
        )}

        {/* List */}
        {query.isSuccess && transactions.length > 0 && (
          <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 100px 120px 80px',
              gap: 12,
              padding: '10px 14px',
              background: 'var(--lp-surface-2)',
              borderBottom: '0.5px solid var(--lp-border)',
              fontSize: 10,
              color: 'var(--lp-text-muted)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em'
            }}>
              <div>Date</div>
              <div>Description</div>
              <div>Status</div>
              <div style={{ textAlign: 'right' }}>Amount</div>
              <div style={{ textAlign: 'center' }}>Chat</div>
            </div>

            {/* Rows */}
            {transactions.map((tx, i) => {
              const isSelected = selectedTx?.id === tx.id
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr 100px 120px 80px',
                    gap: 12,
                    padding: '11px 14px',
                    borderBottom: i < transactions.length - 1
                      ? '0.5px solid var(--chat-row-divider)'
                      : 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    color: 'var(--lp-text)',
                    background: isSelected
                      ? 'var(--chat-bubble-mine-bg)'
                      : 'transparent',
                    transition: 'background 0.12s',
                    alignItems: 'center'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--chat-row-hover)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {/* Date */}
                  <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                    {formatDateShort(tx.transaction_date)}
                  </div>

                  {/* Description */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: 'var(--lp-text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {tx.description || tx.reference || 'Untitled'}
                    </div>
                    {tx.ai_reason && (
                      <div style={{
                        fontSize: 11,
                        color: 'var(--lp-text-muted)',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {tx.ai_reason}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <SemaphoreBadge status={tx.semaphore} size="sm" />
                  </div>

                  {/* Amount */}
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: tx.amount < 0 ? 'var(--sem-red)' : 'var(--lp-text)',
                    textAlign: 'right'
                  }}>
                    {formatCurrency(tx.amount, tx.currency)}
                  </div>

                  {/* Chat indicator */}
                  <div style={{ textAlign: 'center', fontSize: 14 }}>
                    💬
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────── Right: chat panel ────────────────────────── */}
      {selectedTx && orgId && (
        <div style={{
          width: 380,
          flexShrink: 0,
          borderLeft: '0.5px solid var(--lp-border)',
          background: 'var(--lp-surface)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '0.5px solid var(--lp-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 11,
                color: 'var(--lp-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 600
              }}>
                Chat about
              </div>
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--lp-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {selectedTx.description || selectedTx.reference || 'Transaction'}
              </div>
            </div>
            <button
              onClick={() => setSelectedTx(null)}
              title="Close chat"
              style={{
                background:   'transparent',
                border:       'none',
                color:        'var(--lp-text-muted)',
                fontSize:     18,
                cursor:       'pointer',
                fontFamily:   'inherit',
                lineHeight:   1,
                padding:      '2px 6px'
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatPanel transaction={selectedTx} orgId={orgId} />
          </div>
        </div>
      )}
    </div>
  )
}
