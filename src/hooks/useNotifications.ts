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
  is_read:        boolean
  read_at:        string | null
  created_at:     string
}

export function useNotifications(userId: string, orgId: string) {
  const [items,   setItems]   = useState<Notification[]>([])
  const [unread,  setUnread]  = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    const { data } = await db
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    const rows = (data ?? []) as Notification[]
    setItems(rows)
    setUnread(rows.filter(n => !n.is_read).length)
    setLoading(false)
  }, [userId])

  // Initial load
  useEffect(() => { load() }, [load])

  // Realtime subscription
  useEffect(() => {
    if (!userId) return
    const sub = db
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, payload => {
        const n = payload.new as Notification
        setItems(prev => [n, ...prev])
        setUnread(prev => prev + 1)
      })
      .subscribe()
    return () => { db.removeChannel(sub) }
  }, [userId])

  const markRead = useCallback(async (id: string) => {
    await db.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
  }, [])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    await db.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false)
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
  }, [userId])

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