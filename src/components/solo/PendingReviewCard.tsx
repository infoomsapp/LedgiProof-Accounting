// PATH: src/components/solo/PendingReviewCard.tsx
// Shows amber + red transactions needing classification, with CTA to swipe mode.

import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SoloPending, SoloRecentTx } from '../../services/solo-dashboard.service'
import { formatCurrency } from '../../lib/currency'

interface Props {
  pending:   SoloPending
  recentTx:  SoloRecentTx[]   // we'll filter amber/red here
}

const fmt = (n: number) => formatCurrency(n)

export default function PendingReviewCard({ pending, recentTx }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const items = recentTx
    .filter(t => t.semaphore === 'amber' || t.semaphore === 'red')
    .slice(0, 4)

  if (pending.total === 0) {
    return (
      <div style={{
        background: 'var(--lp-surface)',
        border: '0.5px solid rgba(34,197,94,0.25)',
        borderRadius: 12,
        padding: '16px 18px',
        marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        <div style={{ fontSize: 24 }}>✓</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>
            {t('solo.allCaughtUp')}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
            {t('solo.noTxNeedingReview')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: `0.5px solid ${pending.red > 0
        ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        background: pending.red > 0
          ? 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(245,158,11,0.04))'
          : 'rgba(245,158,11,0.06)',
        borderBottom: '0.5px solid var(--lp-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10
      }}>
        <div>
          <div style={{
            fontSize: 11, color: 'var(--lp-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.07em',
            fontWeight: 600, marginBottom: 4
          }}>
            {t('solo.needsYourReview')}
          </div>
          <div style={{
            fontSize: 20, fontWeight: 700, color: 'var(--lp-text)',
            letterSpacing: '-0.02em'
          }}>
            {pending.total === 1
              ? t('solo.transactionCountOne',   { count: pending.total })
              : t('solo.transactionCountOther', { count: pending.total })}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            {pending.red > 0 && (
              <>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>
                  {t('solo.urgentCount', { count: pending.red })}
                </span>
                {pending.amber > 0 && <span style={{ color: '#475569' }}> · </span>}
              </>
            )}
            {pending.amber > 0 && (
              <span style={{ color: '#f59e0b' }}>
                {t('solo.reviewCount', { count: pending.amber })}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => navigate('/transactions?filter=pending')}
          style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
            border: 'none', color: '#fff',
            fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(59,130,246,0.25)'
          }}
        >
          {t('solo.reviewPending')}
        </button>
      </div>

      {/* Preview list */}
      <div>
        {items.map((tx, i) => (
          <button
            key={tx.tx_id}
            onClick={() => navigate(`/transactions?id=${tx.tx_id}`)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 18px',
              borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.03)' : 'none',
              background: 'transparent', border: 'none',
              textAlign: 'left', cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.12s',
              borderLeft: `3px solid ${tx.semaphore === 'red' ? '#ef4444' : '#f59e0b'}`
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: tx.semaphore === 'red' ? '#ef4444' : '#f59e0b',
              boxShadow: `0 0 5px ${tx.semaphore === 'red' ? '#ef4444' : '#f59e0b'}`
            }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {tx.merchant ?? tx.description ?? t('dashboard.transactionFallback')}
              </div>
              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                {tx.transaction_date}
                {tx.requires_review && ` · ${t('solo.personalOrBusiness')}`}
              </div>
            </div>

            <div style={{
              fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600,
              color: tx.amount >= 0 ? '#22c55e' : '#f87171',
              whiteSpace: 'nowrap'
            }}>
              {fmt(tx.amount)}
            </div>
          </button>
        ))}

        {pending.total > items.length && (
          <button
            onClick={() => navigate('/transactions?filter=pending')}
            style={{
              width: '100%', padding: '9px 18px',
              background: 'rgba(255,255,255,0.02)',
              border: 'none', borderTop: '0.5px solid var(--lp-border)',
              fontSize: 11.5, color: '#3b82f6',
              cursor: 'pointer', fontFamily: 'inherit',
              textAlign: 'center'
            }}
          >
            {t('solo.viewAllPending', { count: pending.total })}
          </button>
        )}
      </div>
    </div>
  )
}