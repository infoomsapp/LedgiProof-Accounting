// PATH: src/components/settings/OnlinePaymentsCard.tsx
//
// "Online payments": the workspace connects ITS OWN Stripe account (Stripe
// Connect, Standard) so the "Pay now" button on its invoices pays the
// business directly -- LedgiProof never holds the money. Stripe's own hosted
// onboarding collects the business and bank details; we only keep the
// account id and whether it can take charges yet.
//
// Owner/admin only (the edge function enforces it too). Stripe sends the
// user back here with ?stripe=return (or ?stripe=refresh when the link
// expired), and the status is re-read from Stripe.

import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import {
  getOnlinePaymentsStatus, startOnlinePaymentsOnboarding, type OnlinePaymentsStatus
} from '../../services/stripe.service'
import Icon from '../ui/Icon'

export default function OnlinePaymentsCard() {
  const { membership } = useAuthStore()
  const orgId   = membership?.org_id ?? ''
  const canEdit = membership?.role === 'owner' || membership?.role === 'admin'

  const [status,  setStatus]  = useState<OnlinePaymentsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!orgId || !canEdit) { setLoading(false); return }
    let alive = true
    getOnlinePaymentsStatus(orgId)
      .then(s => { if (alive) setStatus(s) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [orgId, canEdit])

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      const back = `${window.location.origin}/settings?tab=connections`
      window.location.href = await startOnlinePaymentsOnboarding(orgId, back)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const ready   = !!status?.charges_enabled
  const pending = !!status?.connected && !ready

  return (
    <div className="lp-card" style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px' }}>
      <div style={{ color: 'var(--lp-accent)' }}><Icon name="billing" size={26} strokeWidth={1.5} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>Online payments (Stripe)</span>
          {ready && (
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 100,
              color: 'var(--sem-green)', background: 'var(--sem-green-bg)' }}>Active</span>
          )}
          {pending && (
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 100,
              color: 'var(--sem-amber)', background: 'var(--sem-amber-bg)' }}>Setup not finished</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
          Let clients pay your invoices by card with a "Pay now" button. Payments go straight to your own
          Stripe account and are recorded on the invoice automatically. Stripe's standard processing fees apply.
        </div>

        {!canEdit ? (
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
            Only the workspace owner or an admin can set this up.
          </div>
        ) : loading ? (
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>Checking…</div>
        ) : ready ? (
          <div style={{ fontSize: 12, color: 'var(--lp-text)' }}>
            Your invoices now show "Pay now".{' '}
            <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--lp-accent)' }}>
              Open your Stripe dashboard
            </a>
          </div>
        ) : (
          <button type="button" className="lp-btn lp-btn-primary" disabled={busy} onClick={() => { void connect() }}>
            {busy ? 'Opening Stripe…' : pending ? 'Finish Stripe setup' : 'Connect Stripe'}
          </button>
        )}

        {error && (
          <div role="alert" style={{ fontSize: 12, color: 'var(--sem-red)', marginTop: 8 }}>{error}</div>
        )}
      </div>
    </div>
  )
}
