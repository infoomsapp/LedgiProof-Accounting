// PATH: src/components/member-chat/MemberChatPanel.tsx
//
// P4 Fase 2.B.2 — Split-view panel for member-to-member chat.
//
// Mirror layout of WorkspaceChatPanel but with simplified semantics:
//   · No "internal-only" toggle (all member messages are internal by definition)
//   · No AI badges
//   · No client portal — both sides are members
//
// Used inside /messages page under the "Team" tab.

import { useEffect, useRef, useState, useMemo } from 'react'
import { useMemberChat } from '../../hooks/useMemberChat'
import { useAuthStore } from '../../store/auth.store'
import type { MemberConversationSummary, MemberMessage } from '../../services/member-chat.service'

interface Props {
  orgId:           string
  /** Pre-select a conversation on mount (from /team chat button) */
  initialConvId?:  string | null
  searchQuery?:    string
}

export default function MemberChatPanel({ orgId, initialConvId, searchQuery = '' }: Props) {
  const { user } = useAuthStore()
  const viewerId = user?.id ?? ''

  const chat = useMemberChat(orgId, true)
  const [draft, setDraft] = useState('')
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const initializedRef = useRef(false)

  // Open the initial conversation once (when navigated from /team)
  useEffect(() => {
    if (initialConvId && !initializedRef.current) {
      initializedRef.current = true
      chat.openConversation(initialConvId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConvId])

  // Filter inbox by search query
  const filteredConversations = useMemo(() => {
    if (!chat.inbox?.conversations) return []
    if (!searchQuery.trim()) return chat.inbox.conversations
    const q = searchQuery.trim().toLowerCase()
    return chat.inbox.conversations.filter(c => {
      const name    = (c.other_user_name ?? '').toLowerCase()
      const email   = (c.other_user_email ?? '').toLowerCase()
      const preview = (c.last_message_preview ?? '').toLowerCase()
      return name.includes(q) || email.includes(q) || preview.includes(q)
    })
  }, [chat.inbox, searchQuery])

  const activeConv = chat.inbox?.conversations.find(c => c.id === chat.activeConvId)

  async function handleSend() {
    const body = draft.trim()
    if (!body || chat.sending) return
    try {
      await chat.send(body)
      setDraft('')
      composerRef.current?.focus()
    } catch (e: any) {
      alert(`Could not send: ${e?.message ?? 'unknown error'}`)
    }
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '280px 1fr',
      gap: 12,
      height: '100%',
      minHeight: 400
    }}>
      {/* ── Inbox column ────────────────────────────────────────────────── */}
      <Inbox
        conversations={filteredConversations}
        loading={chat.inboxLoading}
        activeConvId={chat.activeConvId}
        viewerId={viewerId}
        onSelect={chat.openConversation}
        showArchived={chat.showArchived}
        onToggleArchived={() => chat.setShowArchived(!chat.showArchived)}
        onArchive={chat.archive}
        onRestore={chat.restore}
      />

      {/* ── Thread column ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        borderRadius: 10,
        overflow: 'hidden'
      }}>
        {!activeConv ? (
          <EmptyThread />
        ) : (
          <>
            {/* Thread header */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '0.5px solid var(--lp-border)',
              background: 'var(--lp-surface-2)',
              display: 'flex', alignItems: 'center', gap: 10
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--chat-bubble-internal-bg)',
                border: '0.5px solid var(--chat-bubble-internal-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14
              }}>
                👤
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: 'var(--lp-text)'
                }}>
                  {activeConv.other_user_name ?? activeConv.other_user_email ?? 'Member'}
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--lp-text-muted)',
                  fontFamily: 'monospace'
                }}>
                  {activeConv.other_user_email ?? ''}
                </div>
              </div>
              {activeConv.is_archived ? (
                <button
                  onClick={() => chat.restore(activeConv.id)}
                  style={{
                    background: 'transparent',
                    border: '0.5px solid var(--lp-border)',
                    color: 'var(--lp-accent)',
                    borderRadius: 6,
                    padding: '4px 9px',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={() => chat.archive(activeConv.id)}
                  style={{
                    background: 'transparent',
                    border: '0.5px solid var(--lp-border)',
                    color: 'var(--lp-text-muted)',
                    borderRadius: 6,
                    padding: '4px 9px',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  Archive
                </button>
              )}
            </div>

            {/* Messages list */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              {chat.messagesLoading && chat.messages.length === 0 ? (
                <div style={{
                  textAlign: 'center', color: 'var(--lp-text-muted)',
                  fontSize: 12, padding: 24
                }}>
                  Loading messages…
                </div>
              ) : chat.messages.length === 0 ? (
                <div style={{
                  textAlign: 'center', color: 'var(--lp-text-muted)',
                  fontSize: 12.5, padding: 32
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                  No messages yet. Say hi 👋
                </div>
              ) : (
                chat.messages.map(m => (
                  <MessageBubble key={m.id} message={m} viewerId={viewerId} />
                ))
              )}
            </div>

            {/* Composer */}
            <div style={{
              padding: 12,
              borderTop: '0.5px solid var(--lp-border)',
              background: 'var(--chat-input-bg)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end'
            }}>
              <textarea
                ref={composerRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={`Message ${activeConv.other_user_name ?? 'member'}…`}
                rows={1}
                disabled={chat.sending || activeConv.is_archived}
                style={{
                  flex: 1,
                  resize: 'none',
                  background: 'var(--lp-surface)',
                  border: '0.5px solid var(--chat-input-border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: 'var(--lp-text)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  maxHeight: 120,
                  minHeight: 36
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--chat-input-border-focus)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--chat-input-border)' }}
              />
              <button
                onClick={handleSend}
                disabled={chat.sending || !draft.trim() || activeConv.is_archived}
                style={{
                  background: draft.trim() && !chat.sending ? 'var(--lp-accent)' : 'var(--lp-surface-2)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 14px',
                  color: draft.trim() && !chat.sending ? '#fff' : 'var(--lp-text-muted)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: draft.trim() && !chat.sending ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  height: 36,
                  whiteSpace: 'nowrap'
                }}
              >
                {chat.sending ? '…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Inbox component ─────────────────────────────────────────────────────────

function Inbox({
  conversations, loading, activeConvId, viewerId,
  onSelect, showArchived, onToggleArchived, onArchive, onRestore
}: {
  conversations:    MemberConversationSummary[]
  loading:          boolean
  activeConvId:     string | null
  viewerId:         string
  onSelect:         (c: MemberConversationSummary) => void
  showArchived:     boolean
  onToggleArchived: () => void
  onArchive:        (id: string) => void
  onRestore:        (id: string) => void
}) {
  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: '0.5px solid var(--lp-border)',
      borderRadius: 10,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '0.5px solid var(--lp-border)',
        background: 'var(--lp-surface-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--lp-text-muted)'
        }}>
          Team chats
        </span>
        <button
          onClick={onToggleArchived}
          title={showArchived ? 'Hide archived' : 'Show archived'}
          style={{
            background: 'transparent',
            border: 'none',
            color: showArchived ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
            cursor: 'pointer',
            fontSize: 13,
            padding: 2
          }}
        >
          🗄
        </button>
      </div>

      {/* Conversations list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && conversations.length === 0 ? (
          <div style={{
            padding: 16, textAlign: 'center',
            color: 'var(--lp-text-muted)', fontSize: 11.5
          }}>
            Loading…
          </div>
        ) : conversations.length === 0 ? (
          <div style={{
            padding: 20, textAlign: 'center',
            color: 'var(--lp-text-muted)', fontSize: 11.5
          }}>
            {showArchived
              ? 'No archived conversations'
              : 'No team conversations yet. Start one from the Team page.'}
          </div>
        ) : (
          conversations.map((c, i) => {
            const isActive = c.id === activeConvId
            const isLast   = i === conversations.length - 1
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                style={{
                  width: '100%',
                  background: isActive ? 'var(--chat-bubble-mine-bg)' : 'transparent',
                  border: 'none',
                  borderBottom: isLast ? 'none' : '0.5px solid var(--chat-row-divider)',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  transition: 'background 0.1s',
                  fontFamily: 'inherit'
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.background = 'var(--chat-row-hover)'
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: c.unread_count > 0
                    ? 'var(--chat-bubble-internal-bg)'
                    : 'var(--lp-surface-2)',
                  border: `0.5px solid ${c.unread_count > 0
                    ? 'var(--chat-bubble-internal-border)'
                    : 'var(--lp-border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, flexShrink: 0
                }}>
                  👤
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 6,
                    alignItems: 'baseline'
                  }}>
                    <span style={{
                      fontSize: 12.5,
                      fontWeight: c.unread_count > 0 ? 600 : 500,
                      color: 'var(--lp-text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1
                    }}>
                      {c.other_user_name ?? c.other_user_email ?? 'Member'}
                    </span>
                    {c.unread_count > 0 && (
                      <span style={{
                        background: 'var(--lp-accent)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 100,
                        flexShrink: 0
                      }}>
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--lp-text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 2
                  }}>
                    {c.last_message_preview ?? 'No messages yet'}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message, viewerId }: { message: MemberMessage; viewerId: string }) {
  const isMine = message.sender_id === viewerId
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isMine ? 'flex-end' : 'flex-start',
      maxWidth: '100%'
    }}>
      <div style={{
        maxWidth: '70%',
        padding: '8px 12px',
        background: isMine
          ? 'var(--chat-bubble-mine-bg)'
          : 'var(--chat-bubble-other-bg)',
        border: `0.5px solid ${isMine
          ? 'var(--chat-bubble-mine-border)'
          : 'var(--chat-bubble-other-border)'}`,
        borderRadius: 10,
        color: isMine
          ? 'var(--chat-bubble-mine-text)'
          : 'var(--chat-bubble-other-text)',
        fontSize: 13,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}>
        {message.body ?? '📎 attachment'}
      </div>
      <div style={{
        fontSize: 10,
        color: 'var(--chat-timestamp)',
        marginTop: 2,
        padding: '0 4px'
      }}>
        {!isMine && message.sender_name && (
          <span style={{ color: 'var(--chat-sender-label)' }}>
            {message.sender_name} ·
          </span>
        )}{' '}
        {new Date(message.created_at).toLocaleString(undefined, {
          hour: '2-digit', minute: '2-digit',
          month: 'short', day: 'numeric'
        })}
      </div>
    </div>
  )
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyThread() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      color: 'var(--lp-text-muted)'
    }}>
      <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.4 }}>👥</div>
      <div style={{
        fontSize: 13, fontWeight: 500, color: 'var(--lp-text)', marginBottom: 4
      }}>
        Select a team conversation
      </div>
      <div style={{ fontSize: 11.5, textAlign: 'center', maxWidth: 280 }}>
        Or go to the <strong>Team</strong> page and click 💬 Chat next to a member.
      </div>
    </div>
  )
}