// PATH: src/components/layout/CreateOrgDialog.tsx
//
// "Create organization" from the workspace switcher -- only offered when the
// plan allows another workspace (get_workspace_allowance). The server checks
// the plan again (create_workspace_org, LQ009) and gives the new organization
// its own standard chart of accounts.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/modal'
import Button from '../ui/Button'
import { useAuthStore } from '../../store/auth.store'
import { useOrgStore }  from '../../store/org.store'
import { createWorkspaceOrg, syncCompanyAddon, type WorkspaceAllowance } from '../../services/org.service'
import { PLAN_CATALOG, extraCompanyPrice } from '../../lib/plans'
import { formatCurrency } from '../../lib/currency'
import type { SubscriptionPlan } from '../../types/database.types'

interface Props {
  open:       boolean
  onClose:    () => void
  onCreated?: (orgId: string) => void
  /** What the plan allows (from the switcher); decides whether this one is billed. */
  allowance?: WorkspaceAllowance | null
}

export default function CreateOrgDialog({ open, onClose, onCreated, allowance }: Props) {
  const { t } = useTranslation()
  const { profile } = useAuthStore()
  const { loadOrgs } = useOrgStore()
  const [name,     setName]     = useState('')
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  // The company was created but the subscription couldn't be updated: said
  // on screen, not only in the console.
  const [billingNote, setBillingNote] = useState<string | null>(null)

  // Option B: past the companies included in the plan, each extra one is
  // billed at a share of the plan -- said up front, and accepted explicitly
  // (the server refuses it otherwise, LQ011).
  const isExtra   = !!allowance?.next_is_extra
  const plan      = (allowance?.plan ?? 'starter') as SubscriptionPlan
  const planName  = PLAN_CATALOG[plan]?.name ?? plan
  const price     = isExtra ? extraCompanyPrice(plan, allowance?.extra_pct ?? 0) : null

  function close() {
    setBillingNote(null)
    setName('')
    setAccepted(false)
    onClose()
  }

  async function handleCreate() {
    if (!profile?.id) return
    setError(null)
    setCreating(true)
    try {
      const orgId = await createWorkspaceOrg(name.trim(), isExtra && accepted)
      let note: string | null = null
      if (isExtra) {
        // The company exists either way; if billing couldn't be updated, say it.
        const sync = await syncCompanyAddon()
        if (!sync.synced) note = t('workspaces.billingNotUpdated', { reason: sync.reason ?? '' })
      }
      await loadOrgs(profile.id)
      onCreated?.(orgId)
      if (note) {
        setBillingNote(note)
        return
      }
      setName('')
      setAccepted(false)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('workspaces.createTitle')}
      subtitle={t('workspaces.createSubtitle')}
      width={440}
      footer={
        <>
          {billingNote ? (
            <Button variant="primary" onClick={close}>{t('workspaces.done')}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={creating}>{t('workspaces.cancel')}</Button>
              <Button variant="primary" loading={creating} disabled={creating || name.trim().length < 2 || (isExtra && !accepted)} onClick={handleCreate}>
                {t('workspaces.create')}
              </Button>
            </>
          )}
        </>
      }
    >
      <label style={{
        display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--lp-text-muted)', marginBottom: 6
      }}>
        {t('workspaces.name')}
      </label>
      <input
        type="text"
        className="lp-input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t('workspaces.namePlaceholder')}
        autoFocus
        style={{ width: '100%' }}
      />
      <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 6, lineHeight: 1.5 }}>
        {t('workspaces.createHint')}
      </div>
      {isExtra && (
        <label style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: '10px 12px',
          background: 'var(--sem-blue-bg)', border: '0.5px solid var(--sem-blue-border)', borderRadius: 8,
          fontSize: 12.5, color: 'var(--lp-text)', lineHeight: 1.5, cursor: 'pointer'
        }}>
          <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            {price != null
              ? t('workspaces.extraConsent', { price: formatCurrency(price), plan: planName, pct: allowance?.extra_pct })
              : t('workspaces.extraConsentNoPrice', { plan: planName, pct: allowance?.extra_pct })}
          </span>
        </label>
      )}
      {billingNote && (
        <div role="status" style={{
          marginTop: 12, padding: '8px 12px', background: 'var(--sem-amber-bg)',
          border: '0.5px solid var(--sem-amber-border)', borderRadius: 7, color: 'var(--lp-text)', fontSize: 12.5
        }}>{billingNote}</div>
      )}
      {error && (
        <div role="alert" style={{
          marginTop: 12, padding: '8px 12px', background: 'var(--sem-red-bg)',
          border: '0.5px solid var(--sem-red)', borderRadius: 7, color: 'var(--sem-red)', fontSize: 12.5
        }}>{error}</div>
      )}
    </Modal>
  )
}
