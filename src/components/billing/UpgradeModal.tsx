// PATH: src/components/billing/UpgradeModal.tsx
// Shown when a user hits a hard limit (out of receipts, invoices, etc.)
// or tries to use a feature not available on their plan.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SubscriptionPlan } from '../../types/database.types'

interface UpgradeModalProps {
  open:        boolean
  onClose:     () => void
  feature?:    string         // feature_key (e.g. 'receipts_per_mo')
  currentPlan: SubscriptionPlan
  reason?:     'limit_exhausted' | 'feature_disabled' | 'trial_expired'
  used?:       number
  limit?:      number
}

const PLAN_UPGRADE_PATH: Record<SubscriptionPlan, SubscriptionPlan | null> = {
  starter:      'entrepreneur',
  entrepreneur: 'bookkeeper',
  bookkeeper:   'accountant',
  accountant:   'enterprise',
  enterprise:   null
}

const PLAN_PRICE: Record<SubscriptionPlan, string> = {
  starter:      '$9.99',
  entrepreneur: '$19.99',
  bookkeeper:   '$59.99',
  accountant:   '$69.99',
  enterprise:   'Custom'
}

const FEATURE_LABEL: Record<string, string> = {
  bank_connections:    'bank connections',
  transactions_per_mo: 'transactions',
  receipts_per_mo:     'receipt uploads',
  mileage_per_mo:      'mileage entries',
  invoices_per_mo:     'invoices',
  clients:             'clients',
  team_members:        'team members',
  ai_queries_per_mo:   'AI queries',
  storage_mb:          'storage',
  schedule_c_export:   'Schedule C export',
  quarterly_tax:       'quarterly tax estimator',
  reconciliation:      'reconciliation',
  client_portal:       'client portal',
  hash_chain_audit:    'hash chain audit',
  bill_pay:            'bill pay',
  accountant_access:   'accountant access'
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
  const featureLabel  = (feature && FEATURE_LABEL[feature]) ?? 'this feature'

  let title:    string
  let subtitle: string

  switch (reason) {
    case 'feature_disabled':
      title    = `${capitalize(featureLabel)} is not available on ${currentPlan}`
      subtitle = `Upgrade to unlock ${featureLabel} and more.`
      break
    case 'trial_expired':
      title    = 'Your trial has ended'
      subtitle = 'Choose a plan to keep your workspace and data.'
      break
    default:
      title    = `You've hit your ${featureLabel} limit`
      subtitle = (used != null && limit != null)
        ? `You've used ${used} of ${limit} ${featureLabel} this month.`
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
                {capitalize(nextPlan)} plan
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>
                {PLAN_PRICE[nextPlan]}
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