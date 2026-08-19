// PATH: src/components/workspace-chat/GlobalChatBubble.tsx
//
// Floating chat bubble — persists across all pages inside AppShell.
// Renders as a 52×52 circle fixed at bottom-right.
// Opens a floating WorkspaceChatPanel panel when clicked.
//
// Semaphore color rules (derived from inbox conversation summary):
//   grey   — no unread messages
//   blue   — unread messages all from the bookkeeper side (internal)
//   amber  — 1–2 clients have sent unread messages
//   red    — 3+ clients have sent unread messages (busy inbox)

import { useRef, useEffect } from 'react'
import { useWorkspaceChat }    from '../../hooks/useWorkspaceChat'
import { useChatBubbleStore }  from '../../store/chat-bubble.store'
import WorkspaceChatPanel      from './WorkspaceChatPanel'
import type { WorkspaceConversation } from '../../services/workspace-chat.service'

interface Props {
  orgId:     string
  clientId?: string   // set for PYME bubble (client portal); omit for bookkeeper
}

function getSemaphoreColor(conversations: WorkspaceConversation[]): {
  ring:   string
  glow:   string
  label:  string
} {
  const clientUnread = conversations.filter(
    c => c.my_unread_count > 0 && c.last_message_sender_role === 'client'
  )
  if (clientUnread.length === 0) {
    const anyUnread = conversations.some(c => c.my_unread_count > 0)
    if (!anyUnread) return { ring: 'var(--lp-border)',       glow: 'transparent',                  label: 'No unread messages' }
    return             { ring: 'var(--sem-blue)',            glow: 'rgba(59,130,246,0.25)',          label: 'Internal notes pending' }
  }
  if (clientUnread.length >= 3)
    return             { ring: 'var(--sem-red)',             glow: 'rgba(239,68,68,0.30)',           label: `${clientUnread.length} clients waiting` }
  return               { ring: 'var(--sem-amber)',           glow: 'rgba(245,158,11,0.28)',          label: `${clientUnread.length} client${clientUnread.length > 1 ? 's' : ''} waiting` }
}

export default function GlobalChatBubble({ orgId, clientId }: Props) {
  const panelRef                    = useRef<HTMLDivElement>(null)
  const { open, focusClientId, openChat, closeChat } = useChatBubbleStore()

  const chat      = useWorkspaceChat(orgId, clientId ?? null, true)
  const convs     = chat.inbox?.conversations ?? []
  const unread    = chat.inbox?.unread_total  ?? 0
  const semaphore = getSemaphoreColor(convs)

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closeChat()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, closeChat])

  // Close with Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeChat() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeChat])

  return (
    <>
      {/* ── Floating panel ─────────────────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position:     'fixed',
            bottom:       86,
            right:        20,
            width:        440,
            height:       580,
            zIndex:       9997,
            borderRadius: 16,
            overflow:     'hidden',
            boxShadow:    '0 20px 60px rgba(0,0,0,0.22), 0 0 0 0.5px var(--lp-border)',
            display:      'flex',
            flexDirection:'column',
            background:   'var(--lp-surface)',
          }}
        >
          {/* Panel header */}
          <div style={{
            padding:      '10px 14px',
            borderBottom: '0.5px solid var(--lp-border)',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'space-between',
            flexShrink:   0,
            background:   'var(--lp-surface)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Semaphore indicator dot */}
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: semaphore.ring,
                flexShrink: 0,
                boxShadow: `0 0 5px ${semaphore.glow}`,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
                Messages
              </span>
              {unread > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 100,
                  background: semaphore.ring, color: '#fff'
                }}>
                  {unread}
                </span>
              )}
            </div>
            <button
              onClick={() => closeChat()}
              title="Close chat"
              style={{
                background: 'none', border: 'none',
                color: 'var(--lp-text-muted)', cursor: 'pointer',
                fontSize: 16, lineHeight: 1, padding: '2px 4px',
                fontFamily: 'inherit',
              }}
            >
              ✕
            </button>
          </div>

          {/* Chat panel fills remaining space — bubbleMode uses stacked inbox→conversation */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <WorkspaceChatPanel
              orgId={orgId}
              bubbleMode
              {...(clientId      ? { clientId }      : {})}
              {...(focusClientId && !clientId ? { focusClientId } : {})}
            />
          </div>
        </div>
      )}

      {/* ── Bubble button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => open ? closeChat() : openChat()}
        title={open ? 'Close messages' : (semaphore.label)}
        style={{
          position:     'fixed',
          bottom:       20,
          right:        20,
          width:        52,
          height:       52,
          borderRadius: '50%',
          zIndex:       9998,
          border:       `2.5px solid ${open ? 'var(--lp-accent)' : semaphore.ring}`,
          background:   open ? 'var(--lp-accent)' : 'var(--lp-surface)',
          boxShadow:    open
            ? '0 4px 20px rgba(0,0,0,0.20)'
            : `0 4px 16px rgba(0,0,0,0.14), 0 0 0 4px ${semaphore.glow}`,
          cursor:       'pointer',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          transition:   'all 0.18s ease',
          flexShrink:   0,
        }}
        onMouseEnter={e => {
          if (!open) e.currentTarget.style.transform = 'scale(1.08)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        {/* Chat icon */}
        <svg
          width="22" height="22" viewBox="0 0 24 24"
          fill="none" stroke={open ? '#fff' : 'var(--lp-text-muted)'}
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>

        {/* Unread badge */}
        {unread > 0 && !open && (
          <span style={{
            position:     'absolute',
            top:          -3,
            right:        -3,
            minWidth:     18,
            height:       18,
            borderRadius: 100,
            background:   semaphore.ring,
            color:        '#fff',
            fontSize:     10,
            fontWeight:   800,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            padding:      '0 4px',
            border:       '2px solid var(--lp-surface)',
            boxSizing:    'border-box',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </>
  )
}
