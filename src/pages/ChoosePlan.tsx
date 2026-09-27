// PATH: src/pages/ChoosePlan.tsx
//
// Shown instead of the app when the workspace's free trial has ended without
// a paid plan (App.tsx, via get_org_access). LedgiProof has no free plan:
// every plan starts with a trial (Starter 30 days, the rest 15) and then one
// must be chosen -- like QuickBooks and Xero, nothing is deleted meanwhile.
//
// The owner picks a plan and goes to Stripe Checkout; anyone else on the
// team is told to ask the owner. The plan the trial ran on is highlighted.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth.store'
import { createSubscriptionCheckoutSession } from '../services/stripe.service'
import LogoBrand from '../components/ui/LogoBrand'
import SemaphoreMark from '../components/ui/SemaphoreMark'
import type { OrgAccess } from '../hooks/useOrgAccess'

type PlanId = 'starter' | 'entrepreneur' | 'bookkeeper' | 'accountant'

const PLAN_INFO: Record<PlanId, { name: string; price: string }> = {
  starter:      { name: 'Starter',      price: '$9.99' },
  entrepreneur: { name: 'Entrepreneur', price: '$19.99' },
  bookkeeper:   { name: 'Bookkeeper',   price: '$59.99' },
  accountant:   { name: 'Accountant',   price: '$69.99' },
}

interface Props {
  access:    OrgAccess
  orgId:     string
  isFirm:    boolean
  onRecheck: () => void
}

export default function ChoosePlan({ access, orgId, isFirm, onRecheck }: Props) {
  const { t }   = useTranslation()
  const signOut = useAuthStore(s => s.signOut)
  const [opening, setOpening] = useState<PlanId | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const plans: PlanId[] = isFirm ? ['bookkeeper', 'accountant'] : ['starter', 'entrepreneur']

  async function choose(plan: PlanId) {
    if (opening) return
    setOpening(plan)
    setError(null)
    try {
      window.location.href = await createSubscriptionCheckoutSession(plan, orgId)
    } catch {
      setError(t('paywall.error'))
      setOpening(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--lp-bg)', padding: '24px 16px'
    }}>
      <div style={{ width: 520, maxWidth: '100%' }}>
        <div style={{ marginBottom: 20 }}><LogoBrand variant="full" /></div>

        <div style={{
          background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
          borderRadius: 14, padding: '26px 24px'
        }}>
          <div style={{ marginBottom: 12 }}><SemaphoreMark /></div>

          {!access.is_owner ? (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--lp-text)' }}>{t('paywall.memberTitle')}</div>
              <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 6, lineHeight: 1.6 }}>
                {t('paywall.memberBody')}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--lp-text)' }}>{t('paywall.title')}</div>
              <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 6, lineHeight: 1.6 }}>
                {t('paywall.subtitle')}
              </div>

              {error && (
                <div role="alert" style={{
                  marginTop: 14, padding: '10px 12px', borderRadius: 8,
                  background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)',
                  fontSize: 12.5, color: 'var(--sem-red)'
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
                {plans.map(id => {
                  const info = PLAN_INFO[id]
                  const trialPlan = access.plan === id
                  return (
                    <div key={id} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', borderRadius: 12,
                      border: trialPlan ? '1px solid var(--sem-blue)' : '0.5px solid var(--lp-border)',
                      background: trialPlan ? 'var(--sem-blue-bg)' : 'transparent'
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--lp-text)' }}>{info.name}</span>
                          <span style={{ fontSize: 13, color: 'var(--lp-text)' }}>
                            {info.price}<span style={{ color: 'var(--lp-text-muted)' }}>{t('paywall.perMonth')}</span>
                          </span>
                          {trialPlan && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sem-blue)' }}>
                              {t('paywall.trialPlan')}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                          {t(`paywall.plans.${id}`)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { void choose(id) }}
                        disabled={opening !== null}
                        className={trialPlan ? 'lp-btn lp-btn-primary' : 'lp-btn lp-btn-ghost'}
                        style={{ flexShrink: 0, justifyContent: 'center' }}
                      >
                        {opening === id ? t('paywall.redirecting') : t('paywall.choose', { plan: info.name })}
                      </button>
                    </div>
                  )
                })}
              </div>

              <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 12 }}>
                {t('paywall.secure')}
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 14 }}>
          <button type="button" onClick={onRecheck}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-accent)', fontSize: 12.5 }}>
            {t('paywall.alreadyPaid')}
          </button>
          <button type="button" onClick={() => { void signOut() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 12.5 }}>
            {t('paywall.signOut')}
          </button>
        </div>
      </div>
    </div>
  )
}
