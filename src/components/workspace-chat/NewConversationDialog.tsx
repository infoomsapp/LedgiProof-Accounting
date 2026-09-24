// PATH: src/components/workspace-chat/NewConversationDialog.tsx
//
// Modal to start a new workspace conversation with a client.
//
// Why this component exists (P2 - Chat dinámico):
//   · Previously, you could only chat with clients you'd already had a thread with.
//   · This dialog lets bookkeepers pick ANY of their clients and send the first message.
//   · If they have no clients yet, it shows a clear path forward instead of dead-end.
//
// Reuses:
//   · Existing Modal + Button + .lp-input classes
//   · getClients() service (already used in Clients.tsx)
//   · sendWorkspaceMessage RPC (creates conversation if first message)

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../ui/modal'
import Button from '../ui/Button'
import { getClients } from '../../services/invoice.service'
import { sendWorkspaceMessage } from '../../services/workspace-chat.service'
import type { Client } from '../../types/database.types'
import Icon from '../ui/Icon'

interface Props {
  open:        boolean
  onClose:     () => void
  orgId:       string
  /** Called with the new conversation id once message is sent */
  onCreated?:  (conversationId: string) => void
}

export default function NewConversationDialog({
  open,
  onClose,
  orgId,
  onCreated
}: Props) {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [draft, setDraft] = useState('')
  const [internalOnly, setInternalOnly] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !orgId) return
    setLoading(true)
    setError(null)
    getClients(orgId)
      .then(setClients)
      .catch(e => setError(e?.message ?? 'Could not load clients'))
      .finally(() => setLoading(false))
  }, [open, orgId])

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedClientId('')
      setDraft('')
      setInternalOnly(false)
      setError(null)
    }
  }, [open])

  async function handleSend() {
    if (!selectedClientId) {
      setError('Select a client first')
      return
    }
    if (!draft.trim()) {
      setError('Message cannot be empty')
      return
    }

    setSending(true)
    setError(null)

    try {
      const result = await sendWorkspaceMessage({
        orgId,
        clientId:      selectedClientId,
        body:          draft.trim(),
        messageKind:   'out',
        clientVisible: !internalOnly
      })
      onCreated?.(result.conversation_id)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  const hasClients = clients.length > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a conversation"
      subtitle="Send a message to one of your clients"
      width={480}
      footer={hasClients ? (
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button
            variant="primary"
            loading={sending}
            disabled={!selectedClientId || !draft.trim()}
            onClick={handleSend}
          >
            Send message
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={() => { onClose(); navigate('/clients') }}>
          Go to Clients
        </Button>
      )}
    >
      {loading ? (
        <div style={{
          padding: 40, textAlign: 'center',
          fontSize: 12.5, color: 'var(--lp-text-muted)'
        }}>
          Loading your clients…
        </div>
      ) : !hasClients ? (
        /* Empty state: no clients yet */
        <div style={{
          padding: '24px 16px',
          textAlign: 'center',
          background: 'var(--lp-surface-2)',
          borderRadius: 10,
          border: '0.5px solid var(--lp-border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, opacity: 0.5 }}><Icon name="users" size={32} /></div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'var(--lp-text)',
            marginBottom: 6
          }}>
            You don't have any clients yet
          </div>
          <div style={{
            fontSize: 12.5, color: 'var(--lp-text-muted)',
            lineHeight: 1.55, marginBottom: 4
          }}>
            Create your first client from the <strong>Clients</strong> page,
            then come back here to start a conversation.
          </div>
        </div>
      ) : (
        /* Form: select client + write message */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 7, fontSize: 12.5,
              color: 'var(--sem-red)',
              background: 'var(--sem-red-bg)',
              border: '0.5px solid var(--sem-red)'
            }}>
              {error}
            </div>
          )}

          <div>
            <label style={{
              fontSize: 12, color: 'var(--lp-text-muted)',
              display: 'block', marginBottom: 5
            }}>
              Client
            </label>
            <select
              className="lp-input"
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
              disabled={sending}
            >
              <option value="">— Select a client —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.display_name ?? c.company_name ?? '(unnamed)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              fontSize: 12, color: 'var(--lp-text-muted)',
              display: 'block', marginBottom: 5
            }}>
              Message
            </label>
            <textarea
              className="lp-input"
              rows={4}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Hi! Just checking in about…"
              disabled={sending}
              style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
            />
          </div>

          {/* Internal note toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: 'var(--lp-text-muted)',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={internalOnly}
              onChange={e => setInternalOnly(e.target.checked)}
              disabled={sending}
              style={{ cursor: 'pointer' }}
            />
            <Icon name="lock" size={11} /> Internal note — not visible to client (team-only)
          </label>
        </div>
      )}
    </Modal>
  )
}