// PATH: src/components/layout/CreatePersonalOrgDialog.tsx
//
// P5.C — Dialog shown when a bookkeeper switches to 'Personal' mode but
// doesn't yet have a personal workspace.
//
// Flow:
//   1. User clicks 👤 Personal in OrgSelector toggle
//   2. OrgSelector detects: no org with is_personal=TRUE among user's orgs
//   3. Opens this dialog (instead of failing silently or auto-creating)
//   4. User confirms (optionally edits suggested name)
//   5. We call createPersonalOrgForBookkeeper RPC → reload orgs → switch to it
//
// Why a dialog instead of auto-create:
//   AL's constitution: "estancia personal vs trabajo separada" implies the
//   user should be CONSCIOUSLY entering personal mode. A confirm dialog
//   prevents accidental creation when the toggle is mis-clicked.

import { useState } from 'react'
import Modal from '../ui/modal'
import Button from '../ui/Button'
import { useAuthStore } from '../../store/auth.store'
import { useOrgStore }  from '../../store/org.store'
import { createPersonalOrgForBookkeeper } from '../../services/org.service'

interface Props {
  open:    boolean
  onClose: () => void
  /** Called with the new org_id after successful creation */
  onCreated?: (orgId: string) => void
}

export default function CreatePersonalOrgDialog({ open, onClose, onCreated }: Props) {
  const { profile } = useAuthStore()
  const { loadOrgs } = useOrgStore()

  // Suggested name = "<email-prefix> (Personal)"
  const defaultName = profile?.email
    ? `${profile.email.split('@')[0]} (Personal)`
    : 'My Personal Workspace'

  const [name,    setName]    = useState(defaultName)
  const [creating, setCreating] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleCreate() {
    if (!profile?.id) return
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('Please provide a name (at least 2 characters)')
      return
    }
    setError(null)
    setCreating(true)
    try {
      const newOrgId = await createPersonalOrgForBookkeeper(trimmed)
      // Refresh org store so the new workspace appears in OrgSelector
      await loadOrgs(profile.id)
      onCreated?.(newOrgId)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Could not create personal workspace')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create your personal workspace"
      subtitle="Separate your own books from your client work"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={creating}
            disabled={creating || name.trim().length < 2}
            onClick={handleCreate}
          >
            Create workspace
          </Button>
        </>
      }
    >
      {/* Explanation block */}
      <div style={{
        padding:      '12px 14px',
        background:   'var(--chat-bubble-internal-bg)',
        border:       '0.5px solid var(--chat-bubble-internal-border)',
        borderRadius: 8,
        fontSize:     12.5,
        lineHeight:   1.55,
        color:        'var(--lp-text)',
        marginBottom: 18
      }}>
        <div style={{ fontWeight: 600, color: 'var(--lp-violet)', marginBottom: 4 }}>
          👤 What is Personal mode?
        </div>
        <div style={{ color: 'var(--lp-text-muted)' }}>
          Your personal workspace is where you track <strong>your own books</strong> —
          income, expenses, bank connections, taxes — kept fully separate from
          your firm's client work. You can switch between Personal and Firm
          anytime from the workspace switcher.
        </div>
      </div>

      {/* Name input */}
      <div style={{ marginBottom: 14 }}>
        <label style={{
          display:        'block',
          fontSize:       10.5,
          fontWeight:     700,
          textTransform:  'uppercase',
          letterSpacing:  '0.06em',
          color:          'var(--lp-text-muted)',
          marginBottom:   6
        }}>
          Workspace name
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="My Personal Workspace"
          className="lp-input"
          autoFocus
          style={{ width: '100%' }}
        />
        <div style={{
          fontSize:  11,
          color:     'var(--lp-text-muted)',
          marginTop: 5
        }}>
          You can rename this later in workspace settings.
        </div>
      </div>

      {error && (
        <div style={{
          padding:      '8px 12px',
          background:   'var(--sem-red-bg)',
          border:       '0.5px solid var(--sem-red)',
          borderRadius: 7,
          color:        'var(--sem-red)',
          fontSize:     12
        }}>
          ⚠ {error}
        </div>
      )}
    </Modal>
  )
}