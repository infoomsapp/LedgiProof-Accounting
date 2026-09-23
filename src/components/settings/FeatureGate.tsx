// PATH: src/components/settings/FeatureGate.tsx
//
// Inline "this needs a higher plan" panel for a whole Settings tab (Branding,
// Bills, API access). Distinct from UpgradeModal, which pops up reactively
// when someone hits a usage limit mid-action -- this is a resting state for
// a tab the current plan simply doesn't include, so it renders as part of
// the page instead of interrupting anything.

import { useNavigate } from 'react-router-dom'
import { useFeatureAccess } from '../../hooks/useFeatureAccess'

interface FeatureGateProps {
  featureKey:  string
  title:       string
  description: string
  children:    React.ReactNode
}

export default function FeatureGate({ featureKey, title, description, children }: FeatureGateProps) {
  const navigate = useNavigate()
  const { loading, enabled } = useFeatureAccess(featureKey)

  if (loading) return <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>
  if (enabled) return <>{children}</>

  return (
    <div className="lp-card" style={{ textAlign: 'center', padding: '40px 28px' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, margin: '0 auto 16px',
        background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <LockIcon />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', maxWidth: 420, margin: '0 auto 20px', lineHeight: 1.6 }}>
        {description}
      </div>
      <button className="lp-btn lp-btn-primary" onClick={() => navigate('/settings?tab=billing')}>
        View plans
      </button>
    </div>
  )
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
