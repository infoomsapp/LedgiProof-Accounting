// PATH: src/components/audit/AuditTransactionsTable.tsx
// Audit transactions table with cursor pagination + expandable row showing activity log.
// Read-only by definition. No edit/approve actions.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getAuditTransactionActivity,
  type AuditTransaction,
  type AuditTransactionActivity
} from '../../services/auditor.service'
import { formatCurrency } from '../../lib/currency'

interface Props {
  transactions:  AuditTransaction[]
  loading:       boolean
  loadingMore:   boolean
  hasMore:       boolean
  onLoadMore:    () => void
}

const semIcon = (s: string): string =>
  s === 'red'   ? '🔴'
  : s === 'amber' ? '🟡'
  : s === 'green' ? '🟢'
  : '🔵'

export default function AuditTransactionsTable({
  transactions, loading, loadingMore, hasMore, onLoadMore
}: Props) {
  const { t } = useTranslation()

  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)
  const [activityMap, setActivityMap]   = useState<Record<string, AuditTransactionActivity>>({})
  const [activityLoading, setActivityLoading] = useState<string | null>(null)

  async function toggleExpand(txId: string) {
    if (expandedTxId === txId) {
      setExpandedTxId(null)
      return
    }
    setExpandedTxId(txId)

    // Load activity if not cached
    if (!activityMap[txId]) {
      setActivityLoading(txId)
      try {
        const activity = await getAuditTransactionActivity(txId)
        setActivityMap(prev => ({ ...prev, [txId]: activity }))
      } catch (e: any) {
        console.error('[AuditTransactionsTable] activity error:', e?.message)
      } finally {
        setActivityLoading(null)
      }
    }
  }

  // ── Loading initial state ──────────────────────────────────────────────────
  if (loading && transactions.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center',
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        borderRadius: 11,
        color: '#64748b', fontSize: 13, fontStyle: 'italic'
      }}>
        {t('audit.loadingTransactions')}
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (transactions.length === 0) {
    return (
      <div style={{
        padding: '40px 20px', textAlign: 'center',
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        borderRadius: 11
      }}>
        <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>📋</div>
        <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4, fontWeight: 500 }}>
          {t('audit.noTransactionsMatch')}
        </div>
        <div style={{ fontSize: 11.5, color: '#64748b' }}>
          {t('audit.tryAdjustingFilters')}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: '0.5px solid var(--lp-border)',
      borderRadius: 11,
      overflow: 'hidden'
    }}>

      {/* Header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '20px 100px 1fr 110px 100px 100px 90px 24px',
        gap: 10, padding: '9px 14px',
        borderBottom: '0.5px solid var(--lp-border)',
        background: 'rgba(255,255,255,0.02)',
        fontSize: 10, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600
      }}>
        <span></span>
        <span>{t('audit.colDate')}</span>
        <span>{t('audit.colClientMerchant')}</span>
        <span style={{ textAlign: 'right' }}>{t('audit.colAmount')}</span>
        <span>{t('audit.colCreatedBy')}</span>
        <span>{t('audit.colApprovedBy')}</span>
        <span>{t('audit.colStatus')}</span>
        <span></span>
      </div>

      {/* Rows */}
      <div>
        {transactions.map((tx, i) => {
          const isExpanded = expandedTxId === tx.tx_id
          const isLoading  = activityLoading === tx.tx_id
          const activity   = activityMap[tx.tx_id]

          return (
            <div key={tx.tx_id} style={{
              borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.03)' : 'none',
              borderLeft: tx.semaphore === 'red'   ? '3px solid #ef4444'
                        : tx.semaphore === 'amber' ? '3px solid #f59e0b'
                        : '3px solid transparent'
            }}>

              {/* Main row */}
              <button
                onClick={() => toggleExpand(tx.tx_id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 100px 1fr 110px 100px 100px 90px 24px',
                  gap: 10, padding: '10px 14px',
                  width: '100%', background: 'transparent', border: 'none',
                  textAlign: 'left', cursor: 'pointer',
                  fontFamily: 'inherit', alignItems: 'center',
                  transition: 'background 0.12s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 12 }}>{semIcon(tx.semaphore)}</span>

                <span style={{ fontSize: 12, color: 'var(--lp-text-muted)', fontFamily: 'monospace' }}>
                  {tx.transaction_date}
                </span>

                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>
                    {tx.merchant_name ?? tx.description ?? t('dashboard.transactionFallback')}
                  </div>
                  {tx.client_name && (
                    <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tx.client_name}
                    </div>
                  )}
                </div>

                <span style={{
                  fontFamily: 'monospace', fontSize: 12.5, fontWeight: 500,
                  color: tx.amount >= 0 ? '#22c55e' : '#f87171',
                  textAlign: 'right', whiteSpace: 'nowrap'
                }}>
                  {formatCurrency(tx.amount, tx.currency)}
                </span>

                <span style={{
                  fontSize: 11, color: 'var(--lp-text-muted)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {tx.created_by_name ?? '—'}
                </span>

                <span style={{
                  fontSize: 11, color: tx.approved_by_name ? 'var(--lp-text-muted)' : '#475569',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {tx.approved_by_name ?? '—'}
                </span>

                <span style={{
                  fontSize: 10, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: statusColor(tx.review_status),
                  whiteSpace: 'nowrap'
                }}>
                  {t(`audit.reviewStatus.${tx.review_status}`, { defaultValue: tx.review_status })}
                </span>

                <span style={{
                  fontSize: 10, color: '#475569',
                  textAlign: 'right'
                }}>
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {/* Expanded activity timeline */}
              {isExpanded && (
                <div style={{
                  padding: '12px 14px 16px 44px',
                  background: 'rgba(255,255,255,0.02)',
                  borderTop: '0.5px solid rgba(255,255,255,0.04)'
                }}>
                  {isLoading ? (
                    <div style={{ fontSize: 11.5, color: '#64748b', fontStyle: 'italic' }}>
                      {t('audit.loadingActivity')}
                    </div>
                  ) : activity ? (
                    <ActivityTimeline activity={activity} tx={tx} />
                  ) : (
                    <div style={{ fontSize: 11.5, color: '#ef4444' }}>
                      {t('audit.couldNotLoadActivity')}
                    </div>
                  )}
                </div>
              )}

            </div>
          )
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          style={{
            width: '100%', padding: '11px 14px',
            background: 'rgba(255,255,255,0.02)',
            border: 'none', borderTop: '0.5px solid var(--lp-border)',
            fontSize: 12, color: loadingMore ? '#64748b' : '#3b82f6',
            cursor: loadingMore ? 'wait' : 'pointer',
            fontFamily: 'inherit', fontWeight: 500
          }}
        >
          {loadingMore ? t('audit.loadingMore') : t('audit.loadMore')}
        </button>
      )}

      {/* Counter footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '0.5px solid var(--lp-border)',
        background: 'rgba(255,255,255,0.01)',
        fontSize: 10.5, color: '#64748b', textAlign: 'right'
      }}>
        {transactions.length === 1
          ? t('audit.showingCountOne',   { count: transactions.length })
          : t('audit.showingCountOther', { count: transactions.length })}
        {hasMore ? t('audit.moreAvailable') : ''}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY TIMELINE
// ─────────────────────────────────────────────────────────────────────────────

function ActivityTimeline({
  activity, tx
}: {
  activity: AuditTransactionActivity
  tx: AuditTransaction
}) {
  const { t } = useTranslation()
  return (
    <div>
      <div style={{
        fontSize: 10, color: '#64748b', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 9
      }}>
        {t('audit.activityLog')}
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 12,
        fontSize: 11, color: 'var(--lp-text-muted)'
      }}>
        <span>{t('audit.versionCurrent', { version: activity.current_version })}</span>
        <span>{activity.versions_count === 1
          ? t('audit.versionsCountOne',   { count: activity.versions_count })
          : t('audit.versionsCountOther', { count: activity.versions_count })}</span>
        <span>{activity.documents_count === 1
          ? t('audit.documentsCountOne',   { count: activity.documents_count })
          : t('audit.documentsCountOther', { count: activity.documents_count })}</span>
        <span>{activity.messages_count === 1
          ? t('audit.messagesCountOne',   { count: activity.messages_count })
          : t('audit.messagesCountOther', { count: activity.messages_count })}</span>
      </div>

      {/* Timeline */}
      {activity.activity.length === 0 ? (
        <div style={{ fontSize: 11.5, color: '#64748b', fontStyle: 'italic' }}>
          {t('audit.noActivityEvents')}
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          paddingLeft: 14, borderLeft: '0.5px dashed rgba(167,139,250,0.30)'
        }}>
          {activity.activity.map((event, i) => (
            <div key={i} style={{
              fontSize: 11.5, position: 'relative'
            }}>
              {/* Dot */}
              <span style={{
                position: 'absolute', left: -18, top: 4,
                width: 7, height: 7, borderRadius: '50%',
                background: eventColor(event.event),
                border: '1.5px solid #0f172a',
                boxShadow: `0 0 0 0.5px ${eventColor(event.event)}50`
              }} />

              <div style={{
                color: 'var(--lp-text)', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 100,
                  background: `${eventColor(event.event)}15`,
                  border: `0.5px solid ${eventColor(event.event)}40`,
                  color: eventColor(event.event), fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.04em'
                }}>
                  {t(`audit.events.${event.event}`, { defaultValue: event.event })}
                </span>
                <span>{t('audit.byActor', { name: event.by_name ?? '—' })}</span>
              </div>

              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                {new Date(event.at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit'
                })}
              </div>

              {event.note && (
                <div style={{
                  fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 4,
                  padding: '4px 8px', borderRadius: 5,
                  background: 'rgba(255,255,255,0.03)',
                  fontStyle: 'italic'
                }}>
                  "{event.note}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Extras line */}
      <div style={{
        marginTop: 10,
        fontSize: 10.5, color: '#475569',
        paddingTop: 10, borderTop: '0.5px dashed rgba(255,255,255,0.05)'
      }}>
        {t('audit.transactionIdLabel')} <span style={{ fontFamily: 'monospace' }}>{tx.tx_id}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'approved':   return '#22c55e'
    case 'pending':    return '#f59e0b'
    case 'rejected':   return '#ef4444'
    case 'reconciled': return '#06b6d4'
    default:           return 'var(--lp-text-muted)'
  }
}

function eventColor(event: string): string {
  switch (event) {
    case 'created':    return 'var(--lp-text-muted)'
    case 'approved':   return '#22c55e'
    case 'reconciled': return '#06b6d4'
    case 'locked':     return '#a78bfa'
    default:           return '#64748b'
  }
}