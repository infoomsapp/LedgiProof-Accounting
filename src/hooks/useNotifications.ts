// PATH: src/hooks/useNotifications.ts
import { useEffect, useState, useCallback } from 'react'
import { db } from '../lib/supabase'

export interface Notification {
  id:             string
  org_id:         string
  user_id:        string
  type:           string
  title:          string
  body:           string
  transaction_id: string | null
  review_id:      string | null
  note_id:        string | null
  document_request_id: string | null
  is_read:        boolean
  read_at:        string | null
  created_at:     string
}

export function useNotifications(userId: string, orgId: string) {
  const [items,   setItems]   = useState<Notification[]>([])
  const [unread,  setUnread]  = useState(0)
  const [loading, setLoading] = useState(true)

  // 🐛 Real bug fixed: this query used to filter by user_id only — a user
  // belonging to multiple orgs (e.g. their own personal org + a firm they
  // own) saw every org's notifications mixed together regardless of which
  // org was currently active, including while in Personal mode where none
  // of that context even applies. orgId is now a required part of the scope.
  const load = useCallback(async () => {
    if (!userId || !orgId) return
    const { data } = await db
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    const rows = (data ?? []) as Notification[]
    setItems(rows)
    setUnread(rows.filter(n => !n.is_read).length)
    setLoading(false)
  }, [userId, orgId])

  // Initial load
  useEffect(() => { load() }, [load])

  // Realtime subscription — server-side filter can only target one column
  // (user_id), so a fresh notification from any of this user's OTHER orgs
  // still arrives here; the org_id check below is what actually keeps it
  // out of the currently-active org's list. orgId is a real dependency (not
  // just userId) so switching orgs doesn't keep filtering against a stale
  // closure value from whenever this effect first ran.
  useEffect(() => {
    if (!userId || !orgId) return
    const sub = db
      .channel(`notifications:${userId}:${orgId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, payload => {
        const n = payload.new as Notification
        if (n.org_id !== orgId) return
        setItems(prev => [n, ...prev])
        setUnread(prev => prev + 1)
      })
      .subscribe()
    return () => { db.removeChannel(sub) }
  }, [userId, orgId])

  const markRead = useCallback(async (id: string) => {
    await db.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
  }, [])

  // Same org-scoping bug as load()/the realtime handler above — this used to
  // mark every org's unread notifications read, not just the active org's,
  // which is worse than the display-only bug: it would silently clear real
  // firm notifications the user never actually saw while in Personal mode.
  const markAllRead = useCallback(async () => {
    if (!userId || !orgId) return
    await db.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('org_id', orgId)
      .eq('is_read', false)
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
  }, [userId, orgId])

  return { items, unread, loading, markRead, markAllRead, reload: load }
}

// ── Write helper — called when Brain flags a transaction ─────────────────────
export async function createNotification(input: {
  orgId:         string
  userId:        string
  type:          Notification['type']
  title:         string
  body:          string
  transactionId?: string
  reviewId?:      string
}) {
  await db.from('notifications').insert({
    org_id:         input.orgId,
    user_id:        input.userId,
    type:           input.type,
    title:          input.title,
    body:           input.body,
    transaction_id: input.transactionId ?? null,
    review_id:      input.reviewId      ?? null,
    is_read:        false
  })
}