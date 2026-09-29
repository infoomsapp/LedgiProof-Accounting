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
import { createWorkspaceOrg } from '../../services/org.service'

interface Props {
  open:       boolean
  onClose:    () => void
  onCreated?: (orgId: string) => void
}

export default function CreateOrgDialog({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation()
  const { profile } = useAuthStore()
  const { loadOrgs } = useOrgStore()
  const [name,     setName]     = useState('')
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleCreate() {
    if (!profile?.id) return
    setError(null)
    setCreating(true)
    try {
      const orgId = await createWorkspaceOrg(name.trim())
      await loadOrgs(profile.id)
      onCreated?.(orgId)
      setName('')
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
      onClose={onClose}
      title={t('workspaces.createTitle')}
      subtitle={t('workspaces.createSubtitle')}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>{t('workspaces.cancel')}</Button>
          <Button variant="primary" loading={creating} disabled={creating || name.trim().length < 2} onClick={handleCreate}>
            {t('workspaces.create')}
          </Button>
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
      {error && (
        <div role="alert" style={{
          marginTop: 12, padding: '8px 12px', background: 'var(--sem-red-bg)',
          border: '0.5px solid var(--sem-red)', borderRadius: 7, color: 'var(--sem-red)', fontSize: 12.5
        }}>{error}</div>
      )}
    </Modal>
  )
}
