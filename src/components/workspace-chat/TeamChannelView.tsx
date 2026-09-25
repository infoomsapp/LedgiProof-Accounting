// PATH: src/components/workspace-chat/TeamChannelView.tsx
//
// The firm's team channel, inside the same chat panel: same bubbles, same
// composer feel, no client visibility, no tags, no tabs. Only ever rendered
// for members of a firm organization (the panel gates it, the database
// enforces it). Everyone deletes only their OWN messages, owner/admin included.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTeamChannel } from '../../hooks/useTeamChannel'
import { useAuthStore } from '../../store/auth.store'
import type { WorkspaceMessage } from '../../services/workspace-chat.service'
import type { TeamMessage } from '../../services/team-channel.service'
import WorkspaceChatMessage from './WorkspaceChatMessage'

interface Props {
  orgId:   string
  onBack:  () => void
  /** Called once the channel was marked read (refresh the Team badge). */
  onRead?: () => void
  /** Closes the whole floating panel; only passed in bubble mode. */
  onClose?: () => void
}

// The bubble component renders WorkspaceMessage; a team message is the same
// thing minus everything client-facing, so it is dressed up as one.
function asWorkspaceMessage(m: TeamMessage, orgId: string): WorkspaceMessage {
  return {
    id:                 m.id,
    conversation_id:    orgId,
    sender_id:          m.sender_id,
    sender_role:        'bookkeeper',
    body:               m.body,
    document_id:        null,
    channels:           [],
    message_kind:       'in',
    message_tag:        'normal',
    event_type:         null,
    ai_generated:       false,
    client_visible:     true,          // not "internal": there is no client side here
    read_by_bookkeeper: true,
    read_by_client:     false,
    read_at:            null,
    created_at:         m.created_at,
    sender_name:        m.sender_name,
    sender_lp_code:     null,
    context_ref:        null,
    is_deleted:         m.is_deleted
  }
}

function dayLabel(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function TeamChannelView({ orgId, onBack, onRead, onClose }: Props) {
  const currentUserId = useAuthStore(s => s.session?.user?.id) ?? null
  const team = useTeamChannel(orgId, true, onRead)

  const [draft, setDraft] = useState('')
  const composerRef  = useRef<HTMLTextAreaElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const endRef       = useRef<HTMLDivElement | null>(null)

  // Land on the newest message when the channel opens; follow new ones only
  // while the reader is already near the bottom.
  const openedRef = useRef(false)
  useEffect(() => {
    if (team.messages.length === 0) return
    if (!openedRef.current) {
      openedRef.current = true
      endRef.current?.scrollIntoView({ behavior: 'instant' })
      return
    }
    const c = containerRef.current
    if (!c) return
    if (c.scrollHeight - c.scrollTop - c.clientHeight < 120) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [team.messages.length])

  async function handleSend() {
    const text = draft
    if (!text.trim() || team.sending) return
    setDraft('')
    const ok = await team.send(text)
    if (!ok) { setDraft(text); return }   // never lose what was typed
    composerRef.current?.focus()
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }

  const canSend = draft.trim().length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
        borderBottom: '0.5px solid var(--lp-border)', background: 'var(--lp-surface)', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          title="Back"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 15,
            color: 'var(--lp-text-muted)', padding: '2px 6px', borderRadius: 4, fontFamily: 'inherit',
          }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--lp-text)' }}>Team</div>
          <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)' }}>
            Only your firm's team can see this — never clients
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="Close messages"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
              color: 'var(--lp-text-muted)', padding: '2px 6px', fontFamily: 'inherit',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column' }}
      >
        {team.loading && team.messages.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--lp-text-muted)', fontSize: 12, fontStyle: 'italic',
          }}>
            Loading messages…
          </div>
        ) : team.error && team.messages.length === 0 ? (
          <div role="alert" style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>{team.error}</div>
            <button
              onClick={() => { void team.reload() }}
              style={{
                padding: '5px 14px', borderRadius: 100, background: 'var(--chat-attachment-bg)',
                border: '0.5px solid var(--lp-border)', color: 'var(--lp-text)', fontSize: 11.5,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {team.hasMore && (
              <button
                onClick={() => { void team.loadOlder() }}
                style={{
                  alignSelf: 'center', marginBottom: 12, padding: '5px 14px', borderRadius: 100,
                  background: 'var(--chat-attachment-bg)', border: '0.5px solid var(--lp-border)',
                  color: 'var(--lp-text-muted)', fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Load older messages
              </button>
            )}

            {team.messages.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--lp-text-muted)', fontSize: 12.5, fontStyle: 'italic', textAlign: 'center',
              }}>
                No messages yet — start the conversation with your team
              </div>
            ) : (
              team.messages.map((m, i) => {
                const prev    = team.messages[i - 1]
                const showSep = !prev || dayLabel(m.created_at) !== dayLabel(prev.created_at)
                return (
                  <div key={m.id}>
                    {showSep && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 0 6px', userSelect: 'none',
                      }}>
                        <div style={{ flex: 1, height: '0.5px', background: 'var(--lp-border)' }} />
                        <span style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {dayLabel(m.created_at)}
                        </span>
                        <div style={{ flex: 1, height: '0.5px', background: 'var(--lp-border)' }} />
                      </div>
                    )}
                    <WorkspaceChatMessage
                      message={asWorkspaceMessage(m, orgId)}
                      viewerRole="bookkeeper"
                      currentUserId={currentUserId}
                      showReceipt={false}
                      // Own messages only, for everyone -- owner and admin included.
                      canModerate={false}
                      onDelete={id => {
                        if (!window.confirm('Delete this message? It disappears for your whole team.')) return
                        void team.deleteMine(id)
                      }}
                    />
                  </div>
                )
              })
            )}
            <div ref={endRef} />
          </>
        )}
      </div>

      {/* Composer */}
      <div style={{
        borderTop: '0.5px solid var(--lp-border)', background: 'var(--lp-surface-2)',
        flexShrink: 0, padding: '10px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <textarea
            ref={composerRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            maxLength={4000}
            placeholder="Message your team…"
            style={{
              flex: 1, resize: 'none', maxHeight: 120, padding: '8px 10px', borderRadius: 10,
              background: 'var(--chat-input-bg)', border: '0.5px solid var(--chat-input-border)',
              color: 'var(--lp-text)', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.45, outline: 'none',
            }}
          />
          <button
            onClick={() => { void handleSend() }}
            disabled={!canSend || team.sending}
            style={{
              padding: '8px 14px', borderRadius: 10, border: 'none',
              background: canSend ? 'var(--lp-accent)' : 'var(--lp-surface)',
              color: canSend ? '#fff' : 'var(--lp-text-muted)',
              fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
              cursor: canSend ? 'pointer' : 'not-allowed', opacity: team.sending ? 0.6 : 1,
            }}
          >
            {team.sending ? '…' : 'Send →'}
          </button>
        </div>
        {team.error && team.messages.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--sem-red)', paddingTop: 6 }}>{team.error}</div>
        )}
      </div>
    </div>
  )
}
