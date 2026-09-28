// PATH: src/components/settings/BillingTab.tsx
// Billing tab: the workspace's plan and trial (get_workspace_plan), what it
// includes (plan_features) and Stripe checkout to change it.

import { useEffect, useState } from 'react'
import { useOrgStore } from '../../store/org.store'
import { useAuthStore } from '../../store/auth.store'
import Button from '../ui/Button'
import { useUserRole } from '../../hooks/useUserRole'
import { formatDate } from '../../lib/dates'
import { createSubscriptionCheckoutSession } from '../../services/stripe.service'
import { getWorkspacePlan, type Subscription } from '../../services/subscription.service'
import {
  PAID_PLANS, PLAN_CATALOG, planHighlights, trialLabel, getFeatureMatrix,
  type PaidPlan, type FeatureMatrix
} from '../../lib/plans'

// ── Plans: names/prices from src/lib/plans.ts, what each includes from
// plan_features (the numbers the server enforces). Only colors live here.

interface PlanInfo {
  id:       PlanId
  name:     string
  price:    number
  features: string[]
  color:    string
}

type PlanId = PaidPlan

function isPlanId(v: string): v is PlanId {
  return (PAID_PLANS as string[]).includes(v)
}

const PLAN_COLOR: Record<PlanId, string> = {
  starter:      'var(--lp-text-muted)',
  entrepreneur: '#22c55e',
  bookkeeper:   '#3b82f6',
  accountant:   '#a78bfa',
}

function buildPlans(matrix: FeatureMatrix): Record<PlanId, PlanInfo> {
  return Object.fromEntries(PAID_PLANS.map(id => {
    const trial = trialLabel(id)
    return [id, {
      id,
      name:     PLAN_CATALOG[id].name,
      price:    PLAN_CATALOG[id].price ?? 0,
      color:    PLAN_COLOR[id],
      features: [...(trial ? [trial] : []), ...planHighlights(matrix[id])],
    }]
  })) as Record<PlanId, PlanInfo>
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
  const [matrix, setMatrix]           = useState<FeatureMatrix>({})
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
        // The workspace owner's subscription -- the same one the server
        // enforces -- and what each plan includes.
        const [wp, m] = await Promise.all([getWorkspacePlan(activeOrg.id), getFeatureMatrix()])
        if (!alive) return
        setSub(wp.subscription)
        setMatrix(m)
      } catch (e: any) {
        if (alive) onMessage?.({ type: 'err', text: e?.message ?? 'Could not load your subscription' })
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

  const PLANS       = buildPlans(matrix)
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
