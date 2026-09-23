// PATH: src/pages/BillingSuccess.tsx
//
// Landing page after a successful Stripe subscription checkout
// (see stripe.service.ts's success_url). Stripe's webhook updates the
// `subscriptions` row asynchronously, so this briefly polls for it to
// land before sending the user back into Settings → Billing — avoids
// dropping them on a screen that still shows their old plan.

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useOrgStore } from '../store/org.store'
import { db } from '../lib/supabase'

const POLL_ATTEMPTS   = 6
const POLL_INTERVAL_MS = 1500

const PLAN_LABEL: Record<string, string> = {
  starter:      'Starter',
  entrepreneur: 'Entrepreneur',
  bookkeeper:   'Bookkeeper',
  accountant:   'Accountant',
}

export default function BillingSuccess() {
  const navigate      = useNavigate()
  const [params]       = useSearchParams()
  const { activeOrg }  = useOrgStore()
  const plan           = params.get('plan') ?? ''
  const planLabel      = PLAN_LABEL[plan] ?? plan

  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    let alive = true
    const orgId = activeOrg?.id
    if (!orgId) {
      // No org context yet (e.g. a hard reload landed here) — just move on,
      // Settings/Billing will show whatever the real current state is.
      const t = setTimeout(() => navigate('/settings?tab=billing', { replace: true }), 1200)
      return () => clearTimeout(t)
    }

    async function poll(orgId: string) {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        if (!alive) return
        const { data } = await db
          .from('subscriptions')
          .select('plan, status')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!alive) return
        if (data?.status === 'active' && (!plan || data.plan === plan)) {
          setConfirmed(true)
          break
        }
        await new Promise(res => setTimeout(res, POLL_INTERVAL_MS))
      }
      if (!alive) return
      // Whether or not it confirmed within the window, send the user back —
      // Stripe itself already charged them successfully to reach this page,
      // Settings/Billing will reflect the real state whenever the webhook lands.
      navigate('/settings?tab=billing', { replace: true })
    }

    poll(orgId)
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', textAlign: 'center', padding: 24
    }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>{confirmed ? '✅' : '⏳'}</div>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--lp-text)', margin: '0 0 8px' }}>
        {confirmed ? 'Payment successful' : 'Confirming your payment…'}
      </h1>
      <p style={{ fontSize: 13.5, color: 'var(--lp-text-muted)', maxWidth: 360, margin: 0 }}>
        {confirmed
          ? `Your ${planLabel} plan is now active. Taking you back to Billing…`
          : `We're activating your${planLabel ? ` ${planLabel}` : ''} plan — this usually takes a few seconds.`}
      </p>
    </div>
  )
}
