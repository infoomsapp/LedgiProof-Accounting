// PATH: src/components/workspace-chat/WorkspaceChatMessage.tsx
//
// Bubble layout, mirroring the mobile app's _MessageBubble (chat_thread_
// screen.dart) exactly: mine on the right, theirs on the left, and a tagged
// message painted in its tag's color on BOTH sides — the point is that the
// reason stands out, not who sent it. Same three semaphore colors as
// message_tag_style.dart (amber/green/red), same hierarchy (sender name
// above the bubble, tag badge inside it, timestamp below).

import { useState }                          from 'react'
import { useNavigate }                       from 'react-router-dom'
import type { WorkspaceMessage, ContextRef, MessageTag } from '../../services/workspace-chat.service'
import { getDocumentSignedUrl }              from '../../services/upload.service'
import Icon                                  from '../ui/Icon'
import DocumentViewerModal, { openDocumentSignedUrl, type ViewingDocument } from '../ui/DocumentViewerModal'
import { TAG_COLORS, TAG_LABELS, TAG_ICONS } from './messageTagStyle'

interface Props {
  message:        WorkspaceMessage
  viewerRole:     'bookkeeper' | 'client'
  firmName?:      string
  currentUserId?: string | null
  /** Staff can delete any message in their org's conversations, matching
   *  the conversation-level delete's own owner/admin split. */
  canModerate?:   boolean
  onDelete?:      (messageId: string) => void
}

export default function WorkspaceChatMessage({
  message, viewerRole, firmName, currentUserId = null, canModerate = false, onDelete
}: Props) {
  const navigate     = useNavigate()
  const [hovered, setHovered] = useState(false)
  const isSystem     = message.sender_role === 'system'
  const isInternal   = !message.client_visible && message.sender_role === 'bookkeeper'
  const isBookkeeper = message.sender_role === 'bookkeeper'
  const isMine       = !!currentUserId && message.sender_id === currentUserId
  const tag: MessageTag = message.message_tag ?? 'normal'
  const tagged       = tag !== 'normal'

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

  const tc = TAG_COLORS[tag]

  // Untagged keeps the ordinary mine/theirs contrast (the app's own bubble
  // tokens, already built for this and simply never wired up before); a
  // tagged message overrides that with its tag's colors on both sides.
  const bubbleBg     = tagged ? tc.bg     : isInternal ? 'var(--chat-bubble-internal-bg)'     : isMine ? 'var(--chat-bubble-mine-bg)'     : 'var(--chat-bubble-other-bg)'
  const bubbleBorder = tagged ? tc.border : isInternal ? 'var(--chat-bubble-internal-border)' : isMine ? 'var(--chat-bubble-mine-border)' : 'var(--chat-bubble-other-border)'
  const bubbleText   = tagged ? 'var(--lp-text)' : isInternal ? 'var(--chat-bubble-internal-text)' : isMine ? 'var(--chat-bubble-mine-text)' : 'var(--chat-bubble-other-text)'

  const canDeleteThis = !!onDelete && !message.is_deleted && (isMine || canModerate)

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isMine ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isMine && (
        <div style={{
          fontSize: 11, color: 'var(--chat-sender-label)', marginBottom: 3,
          marginLeft: 4, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontWeight: 600 }}>{senderLabel}</span>
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
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '78%' }}>
        {isMine && canDeleteThis && (
          <DeleteButton visible={hovered} onClick={() => onDelete!(message.id)} />
        )}

        <div style={{
          padding: '9px 13px', borderRadius: 12,
          background: bubbleBg,
          border: `${tagged ? 1.2 : 1}px solid ${bubbleBorder}`,
          minWidth: 0,
        }}>
          {isInternal && !tagged && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 9.5, fontWeight: 600, color: 'var(--chat-sender-label-internal)',
              marginBottom: 4,
            }}>
              <Icon name="lock" size={9} /> Internal
            </div>
          )}

          {tagged && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6,
            }}>
              <Icon name={TAG_ICONS[tag]} size={13} />
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                color: tc.ink, textTransform: 'uppercase',
              }}>
                {TAG_LABELS[tag]}
              </span>
            </div>
          )}

          {message.is_deleted ? (
            <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--lp-text-muted)' }}>
              This message was deleted
            </div>
          ) : (
            <>
              {message.document_id && (
                <AttachmentChip documentId={message.document_id} spaced={false} />
              )}

              {(message.body ?? '').trim().length > 0 && (
                <div style={{
                  fontSize: 13.5, color: bubbleText, lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  marginTop: message.document_id ? 7 : 0,
                }}>
                  {renderBodyWithMentions(message.body!)}
                </div>
              )}

              {message.context_ref && (
                <div style={{ marginTop: message.body ? 6 : 0 }}>
                  <ContextRefChip ref_={message.context_ref} navigate={navigate} />
                </div>
              )}
            </>
          )}
        </div>

        {!isMine && canDeleteThis && (
          <DeleteButton visible={hovered} onClick={() => onDelete!(message.id)} />
        )}
      </div>

      <div style={{
        fontSize: 10.5, color: 'var(--chat-timestamp)', marginTop: 3,
        marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0,
      }}>
        {formatTime(message.created_at)}
        {message.sender_role === viewerRole && !message.is_deleted && (
          <span style={{ marginLeft: 4 }} title={readReceiptTitle(message, viewerRole)}>
            {readReceiptIcon(message, viewerRole)}
          </span>
        )}
      </div>
    </div>
  )
}

function DeleteButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Delete message"
      style={{
        opacity: visible ? 1 : 0, transition: 'opacity 0.12s',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--lp-text-muted)', padding: 4, flexShrink: 0,
        display: 'flex', alignItems: 'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--sem-red)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--lp-text-muted)' }}
    >
      <Icon name="trash" size={13} />
    </button>
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
  const iconName = ref_.type === 'transaction' ? 'billing' : ref_.type === 'account' ? 'accounts' : 'calendar'

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
      <Icon name={iconName} size={12} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ref_.label}
      </span>
      <span style={{ fontSize: 9.5, color: 'var(--lp-text-muted)', flexShrink: 0 }}>↗</span>
    </button>
  )
}

// ── Attachment chip — click to open the document in a new tab ──────────────────
// Fetches a short-lived signed URL on demand (not eagerly on every render) via
// the same getDocumentSignedUrl() the rest of the app already exposes.

function AttachmentChip({ documentId, spaced }: { documentId: string; spaced: boolean }) {
  const [opening, setOpening] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [viewing, setViewing] = useState<ViewingDocument | null>(null)

  async function handleOpen() {
    if (opening) return
    setOpening(true)
    setError(null)
    try {
      const signed = await getDocumentSignedUrl(documentId)
      openDocumentSignedUrl(signed, setViewing)
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
        <Icon name="attachment" size={12} /> <span>{opening ? 'Opening…' : 'Attachment'}</span>
        {!opening && <span style={{ fontSize: 9.5, color: 'var(--lp-text-muted)' }}>↗</span>}
      </button>
      {error && (
        <div style={{ fontSize: 10.5, color: 'var(--sem-red)', marginTop: 3 }}>{error}</div>
      )}
      <DocumentViewerModal doc={viewing} onClose={() => setViewing(null)} />
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
