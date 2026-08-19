// PATH: src/components/workspace-chat/WorkspaceChatMessage.tsx

import { useState }                          from 'react'
import { useNavigate }                       from 'react-router-dom'
import type { WorkspaceMessage, ContextRef } from '../../services/workspace-chat.service'
import { getDocumentSignedUrl }              from '../../services/upload.service'

interface Props {
  message:    WorkspaceMessage
  viewerRole: 'bookkeeper' | 'client'
  firmName?:  string
}

export default function WorkspaceChatMessage({ message, viewerRole, firmName }: Props) {
  const navigate     = useNavigate()
  const isSystem     = message.sender_role === 'system'
  const isInternal   = !message.client_visible && message.sender_role === 'bookkeeper'
  const isBookkeeper = message.sender_role === 'bookkeeper'

  // ── System / event message ────────────────────────────────────────────────
  if (isSystem) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 0', userSelect: 'none',
      }}>
        <div style={{ flex: 1, height: '0.5px', background: 'var(--lp-border)' }} />
        <span style={{ fontSize: 10.5, color: 'var(--chat-system-text)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
          {message.event_type ?? message.body}
        </span>
        <div style={{ flex: 1, height: '0.5px', background: 'var(--lp-border)' }} />
      </div>
    )
  }

  // ── Sender label ──────────────────────────────────────────────────────────
  let senderLabel = message.sender_name ?? 'Unknown'
  if (viewerRole === 'client' && isBookkeeper && firmName) {
    senderLabel = `${message.sender_name ?? 'Team'} (${firmName})`
  }

  const initials = senderLabel
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  const avatarBg    = isBookkeeper ? 'rgba(167,139,250,0.18)' : 'rgba(20,184,166,0.15)'
  const avatarColor = isBookkeeper ? 'var(--lp-accent)'       : '#14b8a6'
  const avatarBorder= isBookkeeper ? 'rgba(167,139,250,0.35)' : 'rgba(20,184,166,0.30)'

  // ── Feed-style message ────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>

      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: avatarBg, color: avatarColor, marginTop: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11.5, fontWeight: 700, userSelect: 'none',
        border: `1.5px solid ${avatarBorder}`,
      }}>
        {initials || '?'}
      </div>

      {/* Body column */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Header row: name · badges · time */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 3, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 12.5, fontWeight: 600,
            color: 'var(--lp-text)', lineHeight: 1,
          }}>
            {senderLabel}
          </span>

          {message.ai_generated && (
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 100,
              background: 'var(--chat-ai-badge-bg)',
              border: '0.5px solid var(--chat-ai-badge-border)',
              color: 'var(--chat-ai-badge-text)',
            }}>
              AI
            </span>
          )}

          {isInternal && (
            <span style={{
              fontSize: 9.5, padding: '1px 7px', borderRadius: 4,
              background: 'rgba(167,139,250,0.1)',
              color: 'var(--chat-sender-label-internal)', fontWeight: 500,
              border: '0.5px dashed var(--chat-bubble-internal-border)',
            }}>
              🔒 Internal
            </span>
          )}

          <span style={{
            fontSize: 10.5, color: 'var(--chat-timestamp)',
            marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {formatTime(message.created_at)}
            {message.sender_role === viewerRole && (
              <span style={{ marginLeft: 4 }} title={readReceiptTitle(message, viewerRole)}>
                {readReceiptIcon(message, viewerRole)}
              </span>
            )}
          </span>
        </div>

        {/* Message body */}
        {message.body && (
          <div style={{
            fontSize: 13, color: isInternal ? 'var(--lp-text-muted)' : 'var(--lp-text)',
            lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            ...(isInternal ? {
              borderLeft: '2px solid var(--chat-bubble-internal-border)',
              paddingLeft: 8, marginLeft: 1,
            } : {})
          }}>
            {renderBodyWithMentions(message.body)}
          </div>
        )}

        {/* Document attachment */}
        {message.document_id && (
          <AttachmentChip documentId={message.document_id} spaced={!!message.body} />
        )}

        {/* Context ref chip */}
        {message.context_ref && (
          <div style={{ marginTop: message.body ? 6 : 0 }}>
            <ContextRefChip ref_={message.context_ref} navigate={navigate} />
          </div>
        )}

      </div>
    </div>
  )
}

// ── Body renderer (highlights @mentions) ─────────────────────────────────────

function renderBodyWithMentions(body: string): React.ReactNode {
  const parts = body.split(/(@\S+)/)
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span key={i} style={{
          color: 'var(--lp-accent)', fontWeight: 600,
          background: 'rgba(167,139,250,0.12)',
          borderRadius: 3, padding: '0 2px',
        }}>
          {part}
        </span>
      )
    }
    return part
  })
}

// ── Context ref chip ─────────────────────────────────────────────────────────

function ContextRefChip({
  ref_, navigate,
}: {
  ref_:     ContextRef
  navigate: ReturnType<typeof useNavigate>
}) {
  const icon = ref_.type === 'transaction' ? '💳' : ref_.type === 'account' ? '📚' : '📅'

  function handleClick() {
    const base = `/clients/${ref_.client_id}`
    const path = ref_.type === 'transaction' ? `${base}/transactions`
               : ref_.type === 'account'     ? `${base}/accounts`
               :                               `${base}/periods`
    navigate(path)
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 6,
        background: 'var(--chat-attachment-bg)',
        border: '0.5px solid var(--lp-accent)',
        color: 'var(--lp-accent)',
        fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'inherit', transition: 'background 0.1s',
        maxWidth: '100%',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.12)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--chat-attachment-bg)' }}
    >
      <span>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ref_.label}
      </span>
      <span style={{ fontSize: 9.5, color: 'var(--lp-text-muted)', flexShrink: 0 }}>↗</span>
    </button>
  )
}

// ── Attachment chip — click to open the document in a new tab ──────────────────
// Fetches a short-lived signed URL on demand (not eagerly on every render) via
// the same getDocumentSignedUrl() the rest of the app already exposes but
// nothing was actually calling yet — chat messages could carry a document_id
// but had no way to open it.

function AttachmentChip({ documentId, spaced }: { documentId: string; spaced: boolean }) {
  const [opening, setOpening] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleOpen() {
    if (opening) return
    setOpening(true)
    setError(null)
    try {
      const signed = await getDocumentSignedUrl(documentId)
      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open file')
    } finally {
      setOpening(false)
    }
  }

  return (
    <div style={{ marginTop: spaced ? 6 : 0 }}>
      <button
        onClick={handleOpen}
        disabled={opening}
        title="Open attachment"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 6,
          background: 'var(--chat-attachment-bg)',
          border: '0.5px solid var(--lp-border)',
          fontSize: 11.5, color: 'var(--chat-attachment-text)',
          fontFamily: 'inherit', cursor: opening ? 'default' : 'pointer',
          opacity: opening ? 0.7 : 1, transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!opening) e.currentTarget.style.background = 'var(--lp-surface-2)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--chat-attachment-bg)' }}
      >
        📎 <span>{opening ? 'Opening…' : 'Attachment'}</span>
        {!opening && <span style={{ fontSize: 9.5, color: 'var(--lp-text-muted)' }}>↗</span>}
      </button>
      {error && (
        <div style={{ fontSize: 10.5, color: 'var(--sem-red)', marginTop: 3 }}>{error}</div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function readReceiptIcon(msg: WorkspaceMessage, viewer: 'bookkeeper' | 'client'): string {
  const other = viewer === 'bookkeeper' ? msg.read_by_client : msg.read_by_bookkeeper
  return other ? '✓✓' : '✓'
}

function readReceiptTitle(msg: WorkspaceMessage, viewer: 'bookkeeper' | 'client'): string {
  const other = viewer === 'bookkeeper' ? msg.read_by_client : msg.read_by_bookkeeper
  return other ? 'Read' : 'Delivered'
}
