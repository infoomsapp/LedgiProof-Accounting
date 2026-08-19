// PATH: src/components/pyme/PendingActionsCard.tsx
// "What needs your attention" card for PYME dashboard.
// Compact strip with 3 action items, each navigable.

import { useNavigate } from 'react-router-dom'
import type { PymePending } from '../../services/pyme-dashboard.service'

interface Props {
  pending: PymePending
}

export default function PendingActionsCard({ pending }: Props) {
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
            You're all caught up
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            Nothing pending from your firm right now.
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
        📋 What needs your attention
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pending.transactions_to_review > 0 && (
          <ActionRow
            icon="🟡"
            text={`${pending.transactions_to_review} transaction${pending.transactions_to_review === 1 ? '' : 's'} to review`}
            hint={pending.red_count > 0
              ? `${pending.red_count} urgent · "Was this for business or personal?"`
              : 'Was this for business or personal?'
            }
            cta="Review now"
            color="#f59e0b"
            onClick={() => navigate('/transactions?filter=pending')}
          />
        )}

        {pending.receipts_requested > 0 && (
          <ActionRow
            icon="🧾"
            text={`${pending.receipts_requested} receipt${pending.receipts_requested === 1 ? '' : 's'} requested by your firm`}
            hint="Upload to keep your books complete"
            cta="Upload"
            color="#3b82f6"
            onClick={() => navigate('/receipts')}
          />
        )}

        {pending.unread_workspace_messages > 0 && (
          <ActionRow
            icon="💬"
            text={`${pending.unread_workspace_messages} unread message${pending.unread_workspace_messages === 1 ? '' : 's'}`}
            hint="From your firm"
            cta="Open chat"
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