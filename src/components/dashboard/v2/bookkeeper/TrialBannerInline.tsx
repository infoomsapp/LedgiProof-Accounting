// PATH: src/components/dashboard/TrialBannerInline.tsx
// Sticky banner for bookkeepers in Pro trial.
// Auto-hides if not in trial. Shows urgent (orange) when ≤3 days left.
// Reuses the same logic as TrialBanner but styled for inline (top of dashboard).

import { useNavigate } from 'react-router-dom'
import { usePlan } from '../../../../hooks/usePlan.ts'

export default function TrialBannerInline() {
  const navigate = useNavigate()
  const { subscription, trialDaysLeft, trialExpired } = usePlan()

  if (!subscription || subscription.status !== 'trialing') return null

  const urgent = trialDaysLeft !== null && trialDaysLeft <= 3
  const expired = trialExpired

  const bg = expired
    ? 'linear-gradient(90deg, var(--sem-red), var(--sem-red-soft))'
    : urgent
      ? 'linear-gradient(90deg, var(--sem-amber), var(--sem-amber-soft))'
      : 'linear-gradient(90deg, var(--sem-blue), var(--sem-cyan))'

  return (
    <div style={{
      padding: '10px 18px',
      borderRadius: 10,
      background: bg,
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, marginBottom: 18,
      fontSize: 13,
      boxShadow: expired ? '0 2px 12px var(--sem-red-bg-stronger)'
        : urgent ? '0 2px 12px var(--sem-amber-bg-stronger)' : 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 10,
          padding: '2px 8px',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.20)',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          flexShrink: 0
        }}>
          {expired ? '⏰ Trial expired' : urgent ? '⏰ Ending soon' : '🎁 Pro Trial'}
        </span>
        <span style={{ fontWeight: 500 }}>
          {expired
            ? 'Your trial has ended — upgrade to keep your data'
            : trialDaysLeft === 0 ? 'Your trial ends today'
            : trialDaysLeft === 1 ? 'Your trial ends tomorrow'
            : `${trialDaysLeft} days left in your Pro trial`}
        </span>
      </div>

      <button
        onClick={() => navigate('/settings/billing')}
        style={{
          padding: '5px 14px',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.20)',
          border: '0.5px solid rgba(255,255,255,0.35)',
          color: '#fff',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0
        }}
      >
        Upgrade to Pro →
      </button>
    </div>
  )
}