// PATH: src/components/pyme/PendingActionsCard.tsx
// "What needs your attention" card for PYME dashboard.
// Compact strip with 3 action items, each navigable.

import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { PymePending } from '../../services/pyme-dashboard.service'

interface Props {
  pending: PymePending
}

export default function PendingActionsCard({ pending }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const hasAny =
    pending.transactions_to_review > 0
    || pending.receipts_requested > 0
    || pending.unread_workspace_messages > 0

  if (!hasAny) {
    return (
      <div style={{
        background: 'var(--lp-surface)',
        border: '0.5px solid rgba(34,197,94,0.25)',
        borderRadius: 12,
        padding: '16px 18px',
        marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        <div style={{ fontSize: 26 }}>✓</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
            {t('pyme.allCaughtUpTitle')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            {t('pyme.allCaughtUpSub')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: '0.5px solid var(--lp-border)',
      borderRadius: 12,
      padding: '14px 18px 6px',
      marginBottom: 16
    }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
        marginBottom: 12
      }}>
        {t('pyme.whatNeedsAttention')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pending.transactions_to_review > 0 && (
          <ActionRow
            icon="🟡"
            text={pending.transactions_to_review === 1
              ? t('pyme.txToReviewOne',   { count: pending.transactions_to_review })
              : t('pyme.txToReviewOther', { count: pending.transactions_to_review })}
            hint={pending.red_count > 0
              ? t('pyme.urgentHint', { count: pending.red_count })
              : t('pyme.businessOrPersonalHint')
            }
            cta={t('pyme.reviewNow')}
            color="#f59e0b"
            onClick={() => navigate('/transactions?filter=pending')}
          />
        )}

        {pending.receipts_requested > 0 && (
          <ActionRow
            icon="🧾"
            text={pending.receipts_requested === 1
              ? t('pyme.receiptsRequestedOne',   { count: pending.receipts_requested })
              : t('pyme.receiptsRequestedOther', { count: pending.receipts_requested })}
            hint={t('pyme.uploadToKeepComplete')}
            cta={t('pyme.upload')}
            color="#3b82f6"
            onClick={() => navigate('/receipts')}
          />
        )}

        {pending.unread_workspace_messages > 0 && (
          <ActionRow
            icon="💬"
            text={pending.unread_workspace_messages === 1
              ? t('pyme.unreadMessagesOne',   { count: pending.unread_workspace_messages })
              : t('pyme.unreadMessagesOther', { count: pending.unread_workspace_messages })}
            hint={t('pyme.fromYourFirm')}
            cta={t('pyme.openChat')}
            color="#06b6d4"
            onClick={() => {
              // Scroll to chat panel
              document.getElementById('pyme-chat-panel')?.scrollIntoView({ behavior: 'smooth' })
            }}
          />
        )}
      </div>
    </div>
  )
}

function ActionRow({
  icon, text, hint, cta, color, onClick
}: {
  icon: string; text: string; hint: string; cta: string; color: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto',
        gap: 12,
        padding: '10px 12px',
        background: 'transparent',
        border: '0.5px solid var(--lp-border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        alignItems: 'center',
        transition: 'background 0.12s, border-color 0.12s',
        marginBottom: 6
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
        e.currentTarget.style.borderLeftColor = color
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--lp-text)', fontWeight: 500 }}>
          {text}
        </div>
        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
          {hint}
        </div>
      </div>

      <span style={{
        fontSize: 11.5, color, fontWeight: 600,
        padding: '4px 10px', borderRadius: 100,
        background: `${color}15`,
        border: `0.5px solid ${color}40`,
        whiteSpace: 'nowrap'
      }}>
        {cta} →
      </span>
    </button>
  )
}