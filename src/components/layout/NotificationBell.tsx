// PATH: src/components/layout/NotificationBell.tsx
// Bell icon in the top-right of AppShell.
// Shows unread count badge. Opens a dropdown with notification list.
// Clicking a notification marks it read and optionally navigates.

import { useState, useRef, useEffect } from 'react'
import { useNavigate }         from 'react-router-dom'
import { useAuthStore }        from '../../store/auth.store'
import { useChatBubbleStore }  from '../../store/chat-bubble.store'
import { useNotifications }    from '../../hooks/useNotifications'
import type { Notification }   from '../../hooks/useNotifications'
import { db } from '../../lib/supabase'

const TYPE_ICON: Record<string, string> = {
  review_requested:            '💬',
  document_requested:          '📎',
  document_accepted:           '✅',
  document_rejected:           '❌',
  review_confirmed:            '✓',
  transaction_escalated:       '🔴',
  bank_disconnected:           '🏦',
  new_message:                 '✉️',
  note_pending_approval:       '📝',
  note_approved:               '✅',
  note_reminder:               '⏰',
  document_request_fulfilled:  '📤',
  sensitive_data_flagged:      '🛡️'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NotificationBell() {
  const { profile, membership } = useAuthStore()
  const userId = profile?.id  ?? ''
  const orgId  = membership?.org_id ?? ''
  const navigate = useNavigate()

  const { items, unread, loading, markRead, markAllRead } =
    useNotifications(userId, orgId)
  const openChat = useChatBubbleStore(s => s.openChat)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function handleClick(n: Notification) {
    await markRead(n.id)
    if (n.transaction_id) {
      navigate('/transactions')
      // Dispatch event so TransactionList can pre-select it
      window.dispatchEvent(new CustomEvent('lp:open-tx', { detail: n.transaction_id }))
    } else if (n.note_id) {
      const { data } = await db.from('workspace_notes').select('client_id').eq('id', n.note_id).single()
      openChat((data as { client_id: string } | null)?.client_id, 'notes')
    } else if (n.document_request_id) {
      const { data } = await db.from('document_requests').select('client_id').eq('id', n.document_request_id).single()
      openChat((data as { client_id: string } | null)?.client_id, 'requests')
    } else if (n.type === 'new_message') {
      // No client_id stored on plain-message notifications — opens straight
      // to the inbox rather than deep-linking to the specific conversation.
      openChat()
    }
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', background: 'none', border: 'none',
          cursor: 'pointer', padding: '6px 8px', borderRadius: 8,
          color: open ? 'var(--lp-text)' : 'var(--lp-text-muted)',
          transition: 'color 0.1s'
        }}
        title="Notifications"
      >
        {/* Bell SVG */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>

        {/* Unread badge */}
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            minWidth: 14, height: 14, borderRadius: 7,
            background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          width: 320, maxHeight: 420, overflowY: 'auto',
          background: '#1c2235',
          border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          zIndex: 300
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.07)'
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
              Notifications
              {unread > 0 && (
                <span style={{ marginLeft: 7, fontSize: 11, color: '#64748b' }}>
                  {unread} unread
                </span>
              )}
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11.5, color: '#3b82f6', fontFamily: 'inherit'
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#475569' }}>
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔔</div>
              <div style={{ fontSize: 13, color: '#475569' }}>No notifications yet</div>
            </div>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  width: '100%', background: n.is_read ? 'none' : 'rgba(59,130,246,0.05)',
                  border: 'none', borderBottom: '0.5px solid rgba(255,255,255,0.05)',
                  padding: '11px 14px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = n.is_read
                  ? 'none' : 'rgba(59,130,246,0.05)'}
              >
                {/* Icon */}
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                  {TYPE_ICON[n.type] ?? '🔔'}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: n.is_read ? 400 : 500,
                    color: n.is_read ? '#64748b' : 'var(--lp-text)',
                    marginBottom: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                    {n.body}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#334155', marginTop: 4 }}>
                    {timeAgo(n.created_at)}
                  </div>
                </div>

                {/* Unread dot */}
                {!n.is_read && (
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#3b82f6', flexShrink: 0, marginTop: 5
                  }} />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}