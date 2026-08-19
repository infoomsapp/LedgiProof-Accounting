// PATH: src/components/clients/ApplyTemplateModal.tsx
//
// Sprint 5 Paso 5.4 — Standalone modal for applying a template to a client.
//
// COMBINES:
//   · TemplatePicker (with preview)
//   · ClientPickerDropdown (when no client pre-selected)
//   · useCloneTemplate mutation
//
// USAGE PATTERNS:
//
//   A) Post-create flow (newly created client gets offered a template):
//      <ApplyTemplateModal
//        open={showTpl}
//        onClose={() => setShowTpl(false)}
//        orgId={orgId}
//        lockedClientId={newClientId}        // ← client already chosen
//        lockedClientName={newClientName}
//        onApplied={(count) => { ... }}
//      />
//
//   B) Admin action (apply to existing client):
//      <ApplyTemplateModal
//        open={showAdmin}
//        onClose={() => setShowAdmin(false)}
//        orgId={orgId}
//        onApplied={(count, clientId) => { ... }}
//      />
//
// The modal handles all loading/error states internally and surfaces
// final result via `onApplied(accountsCreated, clientId)`.

import { useState } from 'react'
import Modal from '../ui/modal'
import Button from '../ui/Button'
import TemplatePicker from './TemplatePicker'
import ClientPickerDropdown from './ClientPickerDropdown'
import { useCloneTemplate } from '../../hooks/useAccountTemplates'

interface Props {
  open:    boolean
  onClose: () => void
  orgId:   string

  /** Pre-selected client (e.g. just-created). Locks the picker. */
  lockedClientId?:   string
  /** Display name for the locked client (avoids extra fetch). */
  lockedClientName?: string

  /** Called after successful clone. */
  onApplied?: (accountsCreated: number, clientId: string) => void

  /** Custom title override. */
  title?: string
}

export default function ApplyTemplateModal({
  open,
  onClose,
  orgId,
  lockedClientId,
  lockedClientName,
  onApplied,
  title
}: Props) {
  const [templateId, setTemplateId] = useState('')
  const [clientId,   setClientId]   = useState(lockedClientId ?? '')
  const [error,      setError]      = useState<string | null>(null)
  const [done,       setDone]       = useState<{ count: number; clientId: string } | null>(null)

  const cloneMut = useCloneTemplate(orgId)
  const isPending = cloneMut.isPending

  const targetClientId = lockedClientId ?? clientId

  function handleClose() {
    if (isPending) return
    setTemplateId('')
    setClientId(lockedClientId ?? '')
    setError(null)
    setDone(null)
    onClose()
  }

  async function handleApply() {
    setError(null)

    if (!templateId) {
      setError('Pick a template first.')
      return
    }
    if (!targetClientId) {
      setError('Pick a target client.')
      return
    }

    try {
      const result = await cloneMut.mutateAsync({ templateId, clientId: targetClientId })
      if (result.accountsCreated === 0) {
        setError('Template clone returned 0 accounts. The template may be empty.')
        return
      }
      setDone({ count: result.accountsCreated, clientId: targetClientId })
      onApplied?.(result.accountsCreated, targetClientId)
    } catch (e: any) {
      setError(e?.message ?? 'Could not apply template')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title ?? 'Apply Template to Client'}
      width={620}
      footer={
        done ? (
          <Button variant="primary" onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose} disabled={isPending}>
              {lockedClientId ? 'Skip' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              loading={isPending}
              onClick={handleApply}
              disabled={!templateId || !targetClientId}
            >
              Apply template
            </Button>
          </>
        )
      }
    >
      {done ? (
        // ── SUCCESS STATE ──────────────────────────────────────────────
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 14, padding: '20px 10px', textAlign: 'center'
        }}>
          <div style={{ fontSize: 36 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)' }}>
            Template applied
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', lineHeight: 1.5 }}>
            Created <strong style={{ color: 'var(--sem-green)' }}>{done.count}</strong>
            {' '}accounts for this client.<br/>
            They are now ready for transaction categorization.
          </div>
        </div>
      ) : (
        // ── PICKER STATE ───────────────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 7, fontSize: 12.5,
              color: 'var(--sem-red)',
              background: 'var(--sem-red-bg)',
              border: '0.5px solid var(--sem-red-border)'
            }}>
              {error}
            </div>
          )}

          {/* Client selector OR locked display */}
          {lockedClientId ? (
            <div>
              <label style={{
                fontSize: 12, color: 'var(--lp-text-muted)',
                fontWeight: 600, display: 'block', marginBottom: 6
              }}>
                Target client
              </label>
              <div style={{
                padding: '8px 10px', borderRadius: 7, fontSize: 12.5,
                background: 'var(--lp-muted-bg)',
                border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text)'
              }}>
                {lockedClientName ?? lockedClientId}
              </div>
            </div>
          ) : (
            <ClientPickerDropdown
              orgId={orgId}
              selectedId={clientId}
              onSelect={(id) => setClientId(id)}
              disabled={isPending}
            />
          )}

          {/* Template picker with preview */}
          <TemplatePicker
            orgId={orgId}
            selectedId={templateId}
            onSelect={setTemplateId}
            showPreview
            disabled={isPending}
            helpText="The selected template will be cloned into this client's Chart of Accounts. You can customize the cloned accounts afterwards."
          />
        </div>
      )}
    </Modal>
  )
}