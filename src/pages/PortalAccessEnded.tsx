// PATH: src/pages/PortalAccessEnded.tsx
//
// Shown to a client-portal user who no longer has any active portal access —
// typically because the firm deactivated their client account (TaxDome shows
// "Your account was deactivated" in the same spot). Without this they fell
// through to the onboarding wizard and were asked to create a workspace.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../lib/supabase'
import { useAuthStore } from '../store/auth.store'
import LogoBrand from '../components/ui/LogoBrand'
import Icon from '../components/ui/Icon'

interface Suspended { org_name: string | null; client_name: string | null }

export default function PortalAccessEnded() {
  const { t } = useTranslation()
  const { signOut } = useAuthStore()
  const [suspended, setSuspended] = useState<Suspended[] | null>(null)

  useEffect(() => {
    db.rpc('get_my_suspended_portal_access')
      .then(({ data }) => setSuspended((data as unknown as Suspended[] | null) ?? []))
  }, [])

  const first = suspended?.[0]

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16,
      background: 'var(--lp-bg)',
    }}>
      <LogoBrand variant="full" />
      <div style={{
        maxWidth: 440, width: '100%', textAlign: 'center', padding: '32px 24px', borderRadius: 14,
        background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--lp-text-muted)', marginBottom: 12 }}>
          <Icon name="lock" size={32} strokeWidth={1.5} />
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--lp-text)', margin: '0 0 8px' }}>
          {t('portalEnded.title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.6, margin: 0 }}>
          {first
            ? t('portalEnded.bodyFirm', { client: first.client_name ?? '', firm: first.org_name ?? '' })
            : t('portalEnded.body')}
        </p>
        <button
          onClick={() => { void signOut() }}
          style={{
            marginTop: 20, padding: '8px 18px', borderRadius: 8, border: '0.5px solid var(--lp-border)',
            background: 'var(--lp-surface-2)', color: 'var(--lp-text)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {t('portalEnded.signOut')}
        </button>
      </div>
    </div>
  )
}
