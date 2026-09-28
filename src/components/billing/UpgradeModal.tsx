// PATH: src/components/billing/UpgradeModal.tsx
// Shown when a user hits a hard limit (out of receipts, invoices, etc.)
// or tries to use a feature not available on their plan.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SubscriptionPlan } from '../../types/database.types'
import { FEATURE_LABELS, PLAN_CATALOG, PLAN_UPGRADE_PATH, priceLabel } from '../../lib/plans'

interface UpgradeModalProps {
  open:        boolean
  onClose:     () => void
  feature?:    string         // feature_key (e.g. 'receipts_per_mo')
  currentPlan: SubscriptionPlan
  reason?:     'limit_exhausted' | 'feature_disabled' | 'trial_expired'
  used?:       number
  limit?:      number
}

// Names, prices and the upgrade path come from src/lib/plans.ts; the
// feature labels are the real plan_features keys.
function featureLabel(feature?: string): string {
  const l = feature ? FEATURE_LABELS[feature] : undefined
  return l ? l.many.replace(/ \/ month$/, '') : 'this feature'
}

export default function UpgradeModal({
  open,
  onClose,
  feature,
  currentPlan,
  reason = 'limit_exhausted',
  used,
  limit
}: UpgradeModalProps) {
  const navigate = useNavigate()

  // ESC to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const nextPlan      = PLAN_UPGRADE_PATH[currentPlan]
  const label         = featureLabel(feature)

  let title:    string
  let subtitle: string

  switch (reason) {
    case 'feature_disabled':
      title    = `${capitalize(label)} is not available on ${PLAN_CATALOG[currentPlan].name}`
      subtitle = `Upgrade to unlock ${label} and more.`
      break
    case 'trial_expired':
      title    = 'Your trial has ended'
      subtitle = 'Choose a plan to keep your workspace and data.'
      break
    default:
      title    = `You've hit your ${label} limit`
      subtitle = (used != null && limit != null)
        ? `You've used ${used} of ${limit} ${label}.`
        : `Upgrade to get more.`
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 14,
          width: 'min(440px, 100%)',
          padding: 28,
          boxShadow: '0 20px 50px rgba(15,23,42,0.3)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      >
        {/* Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 18, fontSize: 24, color: '#fff'
        }}>
          ⚡
        </div>

        <div style={{
          fontSize: 19, fontWeight: 700, color: '#0f172a',
          letterSpacing: '-0.01em', marginBottom: 8
        }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: '#475569', marginBottom: 22, lineHeight: 1.6 }}>
          {subtitle}
        </div>

        {/* Plan upgrade card */}
        {nextPlan && (
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 11,
            padding: '14px 16px',
            marginBottom: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--lp-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                Recommended upgrade
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                {PLAN_CATALOG[nextPlan].name} plan
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>
                {priceLabel(nextPlan)}
                <span style={{ fontSize: 13, color: 'var(--lp-text-muted)', fontWeight: 400 }}>
                  /mo
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onClose(); navigate('/settings/billing') }}
            style={{
              flex: 1, padding: '11px 14px',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff', border: 'none', borderRadius: 9,
              fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', boxShadow: '0 1px 3px rgba(59,130,246,0.3)'
            }}
          >
            View plans →
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '11px 16px',
              background: 'transparent',
              color: '#475569', border: '1px solid #cbd5e1', borderRadius: 9,
              fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}