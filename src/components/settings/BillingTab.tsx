// PATH: src/components/settings/BillingTab.tsx
// Simple billing tab: shows current plan + trial status + link to /pricing.
// Stripe checkout integration will come in a later sprint.

import { useEffect, useState } from 'react'
import { useOrgStore } from '../../store/org.store'
import { useAuthStore } from '../../store/auth.store'
import { db } from '../../lib/supabase'
import Button from '../ui/Button'
import { useUserRole } from '../../hooks/useUserRole'
import { formatDate } from '../../lib/dates'
import { createSubscriptionCheckoutSession } from '../../services/stripe.service'
import { toSafeMessage } from '../../lib/errors'

// ── Plan matrix (matches pricing page + v23 SQL) ────────────────────────────

interface PlanInfo {
  id:    string
  name:  string
  price: number
  features: string[]
  color: string
}

type PlanId = 'starter' | 'entrepreneur' | 'bookkeeper' | 'accountant'

function isPlanId(v: string): v is PlanId {
  return v === 'starter' || v === 'entrepreneur' || v === 'bookkeeper' || v === 'accountant'
}

const PLANS: Record<PlanId, PlanInfo> = {
  starter: {
    id: 'starter', name: 'Starter', price: 9.99,
    color: 'var(--lp-text-muted)',
    features: [
      'First month free',
      '50 transactions / month',
      '5 AI queries',
      '5 receipts',
      '2 invoices',
      'Bank sync: $1.50/mo per Plaid connection'
    ]
  },
  entrepreneur: {
    id: 'entrepreneur', name: 'Entrepreneur', price: 19.99,
    color: '#22c55e',
    features: [
      '15-day free trial',
      '3 bank connections',
      '500 transactions / month',
      '50 AI queries',
      '30 receipts',
      'Schedule C support'
    ]
  },
  bookkeeper: {
    id: 'bookkeeper', name: 'Bookkeeper', price: 59.99,
    color: '#3b82f6',
    features: [
      '15-day free trial',
      '8 bank connections',
      '2,000 transactions / month',
      '200 AI queries',
      'Multi-client management',
      'Pay-as-you-go available'
    ]
  },
  accountant: {
    id: 'accountant', name: 'Accountant', price: 69.99,
    color: '#a78bfa',
    features: [
      '15-day free trial',
      '50 bank connections',
      '10,000 transactions / month',
      '1,000 AI queries',
      'Multi-client management',
      'Professional-grade controls',
      'Pay-as-you-go available'
    ]
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Subscription {
  plan:               string
  status:             string
  trial_started_at:   string | null
  trial_ends_at:      string | null
  current_period_end: string | null
}

interface Props {
  onMessage?: (msg: { type: 'ok' | 'err'; text: string }) => void
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function BillingTab({ onMessage }: Props) {
  const { activeOrg }    = useOrgStore()
  const { profile }      = useAuthStore()
  const role             = useUserRole()

  const [sub, setSub]                 = useState<Subscription | null>(null)
  const [loading, setLoading]         = useState(true)
  const [showPicker, setShowPicker]   = useState(false)
  const [subscribing, setSubscribing] = useState<PlanId | null>(null)

  async function handleSubscribe(planId: PlanId) {
    if (!activeOrg?.id || subscribing) return
    setSubscribing(planId)
    try {
      const url = await createSubscriptionCheckoutSession(planId, activeOrg.id)
      window.location.href = url
    } catch (e: any) {
      onMessage?.({ type: 'err', text: e?.message ?? 'Failed to start checkout' })
      setSubscribing(null)
    }
  }

  useEffect(() => {
    let alive = true
    async function load() {
      if (!activeOrg?.id) return
      setLoading(true)
      try {
        const { data, error } = await db
          .from('subscriptions')
          .select('plan, status, trial_started_at, trial_ends_at, current_period_end')
          .eq('org_id', activeOrg.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!alive) return
        if (error) {
          onMessage?.({ type: 'err', text: toSafeMessage(error, 'Could not load your subscription') })
        } else {
          setSub(data)
        }
      } catch (e: any) {
        if (alive) onMessage?.({ type: 'err', text: e?.message ?? 'Failed to load subscription' })
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [activeOrg?.id, onMessage])

  if (loading) {
    return (
      <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>
        Loading billing info…
      </div>
    )
  }

  const currentPlan = sub && isPlanId(sub.plan) ? PLANS[sub.plan] : PLANS.starter
  const isTrialing  = sub?.status === 'trialing'
  const trialEndsAt = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null
  const daysLeft    = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  return (
    <div style={{ maxWidth: 540 }}>
      {/* Current plan */}
      <div className="lp-card" style={{
        background: `linear-gradient(135deg, ${currentPlan.color}10, ${currentPlan.color}04)`,
        border: `0.5px solid ${currentPlan.color}40`,
        marginBottom: 14
      }}>
        <div style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4
        }}>
          Current plan
        </div>

        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8
        }}>
          <span style={{
            fontSize: 24, fontWeight: 700, color: currentPlan.color,
            letterSpacing: '-0.02em'
          }}>
            {currentPlan.name}
          </span>
          <span style={{
            fontSize: 14, color: 'var(--lp-text-muted)', fontFamily: 'monospace'
          }}>
            ${currentPlan.price}
            <span style={{ fontSize: 11, color: '#475569' }}>
              {currentPlan.price > 0 ? ' /month' : ''}
            </span>
          </span>
        </div>

        {/* Trial banner */}
        {isTrialing && trialEndsAt && (
          <div style={{
            padding: '8px 12px', borderRadius: 7,
            background: daysLeft <= 3
              ? 'rgba(239,68,68,0.10)'
              : 'rgba(59,130,246,0.08)',
            border: `0.5px solid ${daysLeft <= 3 ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.25)'}`,
            fontSize: 12,
            color: daysLeft <= 3 ? '#fca5a5' : '#93c5fd',
            marginBottom: 12
          }}>
            🎁 <strong>Trial active</strong> · {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining
            {' '}(ends {formatDate(trialEndsAt)})
          </div>
        )}

        {/* Features */}
        <ul style={{
          listStyle: 'none', padding: 0, margin: '0 0 14px',
          display: 'flex', flexDirection: 'column', gap: 6
        }}>
          {currentPlan.features.map(f => (
            <li key={f} style={{
              fontSize: 12, color: 'var(--lp-text-muted)',
              display: 'flex', gap: 8, alignItems: 'center'
            }}>
              <span style={{ color: currentPlan.color }}>✓</span>
              {f}
            </li>
          ))}
        </ul>

        {role.showBillingTab && (
          <Button
            variant="primary"
            onClick={() => setShowPicker(v => !v)}
          >
            {showPicker ? 'Hide plans' : currentPlan.id === 'starter' ? 'Choose a plan →' : 'Change plan →'}
          </Button>
        )}
      </div>

      {/* Plan picker — real Stripe Checkout, no placeholder */}
      {role.showBillingTab && showPicker && (
        <div className="lp-card" style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, color: 'var(--lp-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10
          }}>
            Choose a plan
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.keys(PLANS) as PlanId[]).map(planId => {
              const plan = PLANS[planId]
              const isCurrent = planId === currentPlan.id
              return (
                <div key={planId} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 8,
                  border: `0.5px solid ${isCurrent ? plan.color + '50' : 'var(--lp-border)'}`,
                  background: isCurrent ? `${plan.color}0c` : 'transparent'
                }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: plan.color }}>
                      {plan.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', fontFamily: 'monospace' }}>
                      ${plan.price}{plan.price > 0 ? '/mo' : ''}
                    </div>
                  </div>
                  <Button
                    variant={isCurrent ? 'ghost' : 'primary'}
                    disabled={isCurrent || subscribing !== null}
                    onClick={() => handleSubscribe(planId)}
                  >
                    {isCurrent
                      ? 'Current plan'
                      : subscribing === planId ? 'Redirecting…' : 'Subscribe'}
                  </Button>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 10, lineHeight: 1.5 }}>
            You'll be redirected to Stripe's secure checkout to complete payment.
          </div>
        </div>
      )}

      {/* Subscription details (for owners + super_admin only) */}
      {role.showBillingTab && sub && (
        <div className="lp-card" style={{ marginTop: 14 }}>
          <div style={{
            fontSize: 11, color: 'var(--lp-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10
          }}>
            Subscription details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <DetailRow label="Status" value={
              <span style={{
                fontSize: 11, fontWeight: 600,
                padding: '2px 7px', borderRadius: 100,
                color: sub.status === 'active' ? '#22c55e'
                     : sub.status === 'trialing' ? '#3b82f6'
                     : 'var(--lp-text-muted)',
                background: sub.status === 'active' ? 'rgba(34,197,94,0.10)'
                     : sub.status === 'trialing' ? 'rgba(59,130,246,0.10)'
                     : 'rgba(148,163,184,0.10)',
                textTransform: 'uppercase', letterSpacing: '0.04em'
              }}>
                {sub.status}
              </span>
            } />
            <DetailRow label="Plan" value={
              <span style={{ color: 'var(--lp-text)', fontWeight: 500 }}>
                {currentPlan.name}
              </span>
            } />
            {sub.current_period_end && (
              <DetailRow label="Next renewal" value={
                <span style={{ color: 'var(--lp-text)' }}>
                  {formatDate(sub.current_period_end)}
                </span>
              } />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '4px 0', fontSize: 12
    }}>
      <span style={{ color: 'var(--lp-text-muted)' }}>{label}</span>
      {value}
    </div>
  )
}
