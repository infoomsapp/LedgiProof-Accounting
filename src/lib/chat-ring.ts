// PATH: src/lib/chat-ring.ts
//
// Color of the floating chat bubble's ring. The ring follows the TAG of what
// is waiting, the same semaphore colors the message bubbles use: a plain
// message is blue, "Outstanding" amber, "Invoice" green, "Needs a reply" red.
// The most important tag among all unread conversations wins. (It used to
// count clients instead, which painted every ordinary unread message amber.)
// Identical for a firm and for a portal client: my_unread_tag is computed
// server-side for whoever is viewing. Mirrors the mobile app's
// chat_bubble_overlay.dart.

import type { MessageTag } from '../services/workspace-chat.service'

export interface RingConversation {
  my_unread_count: number
  my_unread_tag?:  MessageTag | null
}

export interface Ring {
  ring:  string
  glow:  string
  label: string
}

const RING_PRIORITY: MessageTag[] = ['urgent', 'pending', 'invoice', 'normal']

const RING_BY_TAG: Record<MessageTag, Ring> = {
  urgent:  { ring: 'var(--sem-red)',   glow: 'rgba(239,68,68,0.30)',  label: 'Needs a reply' },
  pending: { ring: 'var(--sem-amber)', glow: 'rgba(245,158,11,0.28)', label: 'Outstanding' },
  invoice: { ring: 'var(--sem-green)', glow: 'rgba(34,197,94,0.28)',  label: 'Invoice' },
  normal:  { ring: 'var(--sem-blue)',  glow: 'rgba(59,130,246,0.25)', label: 'New message' },
}

export function getRing(conversations: readonly RingConversation[]): Ring {
  const waiting = conversations.filter(c => c.my_unread_count > 0)
  if (waiting.length === 0) {
    return { ring: 'var(--lp-border)', glow: 'transparent', label: 'No unread messages' }
  }
  // A conversation can be flagged unread without an unread message (Mark as
  // unread), so a missing tag counts as a plain message.
  const tags = waiting.map(c => c.my_unread_tag ?? 'normal')
  const top  = RING_PRIORITY.find(t => tags.includes(t)) ?? 'normal'
  const n    = tags.filter(t => t === top).length
  const base = RING_BY_TAG[top]
  return { ...base, label: `${base.label} · ${n} conversation${n > 1 ? 's' : ''}` }
}
