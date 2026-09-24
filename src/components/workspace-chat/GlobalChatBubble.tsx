// PATH: src/components/workspace-chat/GlobalChatBubble.tsx
//
// Floating chat bubble — persists across all pages inside AppShell.
// Renders as a 52×52 circle, draggable anywhere on screen and free-standing
// (not fixed to a corner) — same drag-then-snap-to-nearest-edge feel as
// Messenger's chat heads, minus the system-level overlay that feature needs
// on Android (this bubble only ever floats within the web app itself).
// Opens a floating WorkspaceChatPanel panel when clicked.
//
// Semaphore color rules (derived from inbox conversation summary):
//   grey   — no unread messages
//   blue   — unread messages all from the bookkeeper side (internal)
//   amber  — 1–2 clients have sent unread messages
//   red    — 3+ clients have sent unread messages (busy inbox)

import { useRef, useEffect, useState, useCallback } from 'react'
import { useWorkspaceChat }    from '../../hooks/useWorkspaceChat'
import { useChatBubbleStore }  from '../../store/chat-bubble.store'
import WorkspaceChatPanel      from './WorkspaceChatPanel'
import ChatBrandIcon           from './ChatBrandIcon'
import type { WorkspaceConversation } from '../../services/workspace-chat.service'

interface Props {
  orgId:     string
  clientId?: string   // set for PYME bubble (client portal); omit for bookkeeper
}

const BUBBLE_SIZE   = 52
const EDGE_MARGIN   = 20
const POS_STORAGE_KEY = 'lp_chat_bubble_pos' // {xFrac, yFrac} of usable width/height

function defaultPos() {
  return {
    left: window.innerWidth  - BUBBLE_SIZE - EDGE_MARGIN,
    top:  window.innerHeight - BUBBLE_SIZE - EDGE_MARGIN,
  }
}

function loadPos(): { left: number; top: number } {
  if (typeof window === 'undefined') return { left: 0, top: 0 }
  try {
    const raw = window.localStorage.getItem(POS_STORAGE_KEY)
    if (!raw) return defaultPos()
    const { xFrac, yFrac } = JSON.parse(raw) as { xFrac: number; yFrac: number }
    const maxX = window.innerWidth  - BUBBLE_SIZE
    const maxY = window.innerHeight - BUBBLE_SIZE
    return {
      left: Math.min(Math.max(xFrac * maxX, 0), maxX),
      top:  Math.min(Math.max(yFrac * maxY, 0), maxY),
    }
  } catch {
    return defaultPos()
  }
}

function savePos(left: number, top: number) {
  try {
    const maxX = window.innerWidth  - BUBBLE_SIZE
    const maxY = window.innerHeight - BUBBLE_SIZE
    window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify({
      xFrac: maxX > 0 ? left / maxX : 0,
      yFrac: maxY > 0 ? top  / maxY : 0,
    }))
  } catch {
    // A lost position just falls back to the default corner next load.
  }
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
  const { open, focusClientId, focusTab, openChat, closeChat } = useChatBubbleStore()

  const chat      = useWorkspaceChat(orgId, clientId ?? null, true)
  const convs     = chat.inbox?.conversations ?? []
  const unread    = chat.inbox?.unread_total  ?? 0
  const semaphore = getSemaphoreColor(convs)

  // ── Draggable position ────────────────────────────────────────────────────
  const [pos, setPos]           = useState<{ left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ dx: 0, dy: 0 })
  const movedRef    = useRef(false) // distinguishes a drag from a plain click

  useEffect(() => {
    setPos(loadPos())
    function onResize() {
      setPos(p => {
        if (!p) return p
        const maxX = window.innerWidth  - BUBBLE_SIZE
        const maxY = window.innerHeight - BUBBLE_SIZE
        return { left: Math.min(p.left, maxX), top: Math.min(p.top, maxY) }
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onBubblePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (open || !pos) return
    e.currentTarget.setPointerCapture(e.pointerId)
    movedRef.current = false
    dragOffset.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top }
    setDragging(true)
  }, [open, pos])

  const onBubblePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return
    movedRef.current = true
    const maxX = window.innerWidth  - BUBBLE_SIZE
    const maxY = window.innerHeight - BUBBLE_SIZE
    setPos({
      left: Math.min(Math.max(e.clientX - dragOffset.current.dx, 0), maxX),
      top:  Math.min(Math.max(e.clientY - dragOffset.current.dy, 0), maxY),
    })
  }, [dragging])

  const onBubblePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return
    setDragging(false)
    setPos(p => {
      if (!p) return p
      const maxX = window.innerWidth - BUBBLE_SIZE
      // Snap to the nearest horizontal edge, same rule Messenger's chat
      // heads use — vertical position stays wherever it was released.
      const center = p.left + BUBBLE_SIZE / 2
      const snappedLeft = center < window.innerWidth / 2 ? EDGE_MARGIN : maxX - EDGE_MARGIN
      const next = { left: Math.min(Math.max(snappedLeft, 0), maxX), top: p.top }
      savePos(next.left, next.top)
      return next
    })
    // A drag that never moved is just a click — let the button's onClick fire.
    if (movedRef.current) e.preventDefault()
  }, [dragging])

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

  // Not positioned yet (first paint, before the mount effect reads the
  // saved/default position) — render nothing rather than flash at 0,0.
  if (!pos) return null

  // The panel opens anchored to whichever side the bubble is currently
  // sitting on, so it never appears disconnected from a bubble that's been
  // dragged away from the default bottom-right corner.
  const onRightHalf = pos.left + BUBBLE_SIZE / 2 > window.innerWidth / 2
  const panelWidth   = 440
  const panelHeight  = 580
  const panelLeft = Math.min(
    Math.max(onRightHalf ? pos.left + BUBBLE_SIZE - panelWidth : pos.left, 12),
    window.innerWidth - panelWidth - 12
  )
  const panelTop = Math.max(pos.top - panelHeight - 14, 12)

  return (
    <>
      {/* Shared pulse animation for unread indicators (bubble badge, inbox
          rows) — same values as SemaphoreSpinner.tsx's lp-sem-pulse, kept
          local since this component (unlike SemaphoreSpinner) isn't always
          mounted alongside it. */}
      <style>{`
        .lp-chat-pulse {
          animation: lp-chat-pulse-kf 1.2s ease-in-out infinite;
          will-change: transform, opacity;
        }
        @keyframes lp-chat-pulse-kf {
          0%, 100% { opacity: 0.55; transform: scale(0.92); }
          50%      { opacity: 1.00; transform: scale(1.12); }
        }
      `}</style>

      {/* ── Floating panel ─────────────────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position:     'fixed',
            left:         panelLeft,
            top:          panelTop,
            width:        panelWidth,
            height:       panelHeight,
            zIndex:       9997,
            borderRadius: 16,
            overflow:     'hidden',
            boxShadow:    '0 20px 60px rgba(0,0,0,0.22), 0 0 0 0.5px var(--lp-border)',
            display:      'flex',
            flexDirection:'column',
            background:   'var(--lp-surface)',
          }}
        >
          {/* Header now lives entirely in WorkspaceChatPanel (inbox header
              when no conversation is open, 2-line client header once one
              is) — this outer panel no longer renders its own "Messages"
              bar, so there's one header instead of two stacked ones. */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <WorkspaceChatPanel
              orgId={orgId}
              bubbleMode
              onClose={closeChat}
              {...(clientId      ? { clientId }      : {})}
              {...(focusClientId && !clientId ? { focusClientId } : {})}
              {...(focusTab      && !clientId ? { focusTab }      : {})}
            />
          </div>
        </div>
      )}

      {/* ── Bubble button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => {
          // A drag that actually moved the bubble shouldn't also toggle the
          // panel — pointerup already snapped it; this click is a side effect
          // of the same gesture, not a separate tap.
          if (movedRef.current) { movedRef.current = false; return }
          open ? closeChat() : openChat()
        }}
        onPointerDown={onBubblePointerDown}
        onPointerMove={onBubblePointerMove}
        onPointerUp={onBubblePointerUp}
        title={open ? 'Close messages' : (semaphore.label)}
        style={{
          position:     'fixed',
          left:         pos.left,
          top:          pos.top,
          width:        52,
          height:       52,
          borderRadius: '50%',
          zIndex:       9998,
          border:       `2.5px solid ${open ? 'var(--lp-accent)' : semaphore.ring}`,
          background:   open ? 'var(--lp-accent)' : 'transparent',
          boxShadow:    open
            ? '0 4px 20px rgba(0,0,0,0.20)'
            : `0 4px 16px rgba(0,0,0,0.14), 0 0 0 4px ${semaphore.glow}`,
          cursor:       dragging ? 'grabbing' : 'grab',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          transition:   dragging ? 'none' : 'left 0.22s ease, top 0.22s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
          flexShrink:   0,
          touchAction:  'none',
        }}
        onMouseEnter={e => {
          if (!open) e.currentTarget.style.transform = 'scale(1.08)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        {/* Closed: the chat feature's own brand mark, sized to leave the
            semaphore ring visible around it. Open: a plain close glyph on
            the accent-filled button — a brand mark would read oddly as a
            "close" affordance. */}
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <ChatBrandIcon size={40} />
        )}

        {/* Unread badge — pulses to draw the eye, same animation used on
            unread inbox rows */}
        {unread > 0 && !open && (
          <span className="lp-chat-pulse" style={{
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
