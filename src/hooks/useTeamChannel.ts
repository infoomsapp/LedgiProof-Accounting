// PATH: src/hooks/useTeamChannel.ts
// The firm's team channel: messages, live updates, send, delete-own.
//
// Same recovery rules as useWorkspaceChat: a Realtime event is only a hint, so
// bursts are coalesced and every "we may have missed something" moment (tab
// visible again, browser online, channel resubscribed) refetches the latest
// page and MERGES it into what is on screen (older pages the user loaded stay).
//
// While the channel is open and the tab is visible, anything unread is marked
// read as soon as it is on screen (and the caller is told, so the Team button's
// badge clears).

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mergeLatestPage } from '../lib/chat-merge'
import { toSafeMessage } from '../lib/errors'
import {
  getTeamChannel,
  sendTeamMessage,
  markTeamChannelRead,
  deleteTeamMessage,
  type TeamMessage
} from '../services/team-channel.service'

const COALESCE_MS = 250
const CATCH_UP_MIN_GAP_MS = 2_000

export interface UseTeamChannel {
  messages:     TeamMessage[]
  loading:      boolean
  error:        string | null
  hasMore:      boolean
  sending:      boolean
  reload:       () => Promise<void>
  loadOlder:    () => Promise<void>
  send:         (body: string) => Promise<boolean>
  deleteMine:   (messageId: string) => Promise<void>
}

export function useTeamChannel(
  orgId:   string | null | undefined,
  enabled: boolean,
  /** Called after the channel was marked read, so the Team badge can refresh. */
  onRead?: () => void
): UseTeamChannel {
  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [hasMore,  setHasMore]  = useState(false)
  const [oldestAt, setOldestAt] = useState<string | null>(null)
  const [sending,  setSending]  = useState(false)

  const messagesRef = useRef<TeamMessage[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  const loadSeq   = useRef(0)
  const onReadRef = useRef(onRead)
  useEffect(() => { onReadRef.current = onRead }, [onRead])
  const instanceId = useRef(Math.random().toString(36).slice(2))

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (!orgId || !enabled) return
    const seq = ++loadSeq.current
    if (mode === 'initial') setLoading(true)
    try {
      const res = await getTeamChannel(orgId, 50, null)
      if (seq !== loadSeq.current) return   // a newer load owns the screen

      const merged = mode === 'refresh'
        ? mergeLatestPage(messagesRef.current, res.messages, res.has_more)
        : { messages: res.messages, keptOlder: false }
      setMessages(merged.messages)
      if (!merged.keptOlder) {
        setHasMore(res.has_more)
        setOldestAt(res.oldest_at)
      }
      setError(null)

      if (res.unread_count > 0 && document.visibilityState !== 'hidden') {
        await markTeamChannelRead(orgId).catch(() => { /* non-critical */ })
        onReadRef.current?.()
      }
    } catch (e) {
      if (seq !== loadSeq.current) return
      // A failed refresh keeps what is on screen; only an empty channel shows the error.
      if (mode === 'initial' || messagesRef.current.length === 0) {
        setError(toSafeMessage(e, 'Could not load the team chat'))
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [orgId, enabled])

  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  // First load / org change.
  useEffect(() => {
    if (!enabled || !orgId) return
    setMessages([]); setHasMore(false); setOldestAt(null); setError(null)
    void load('initial')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, enabled])

  // Live updates + gap recovery.
  useEffect(() => {
    if (!enabled || !orgId) return

    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      void loadRef.current('refresh')
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const onEvent = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; refresh() }, COALESCE_MS)
    }

    let lastCatchUp = 0
    const catchUp = () => {
      const now = Date.now()
      if (now - lastCatchUp < CATCH_UP_MIN_GAP_MS) return
      lastCatchUp = now
      refresh()
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') catchUp() }

    let subscribedBefore = false
    const filter = `org_id=eq.${orgId}`
    const channel = supabase
      .channel(`team-chat-${orgId}-${instanceId.current}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_team_messages', filter }, onEvent)
      // UPDATE carries a deletion (the sender emptied their own message).
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspace_team_messages', filter }, onEvent)
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return
        if (subscribedBefore) catchUp()
        subscribedBefore = true
      })

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', catchUp)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', catchUp)
      supabase.removeChannel(channel)
    }
  }, [orgId, enabled])

  const reload = useCallback(async () => { await load('initial') }, [load])

  const loadOlder = useCallback(async () => {
    if (!orgId || !hasMore || !oldestAt) return
    try {
      const res = await getTeamChannel(orgId, 50, oldestAt)
      setMessages(prev => {
        const have = new Set(prev.map(m => m.id))
        return [...res.messages.filter(m => !have.has(m.id)), ...prev]
      })
      setHasMore(res.has_more)
      setOldestAt(res.oldest_at)
    } catch (e) {
      setError(toSafeMessage(e, 'Could not load older messages'))
    }
  }, [orgId, hasMore, oldestAt])

  const send = useCallback(async (body: string): Promise<boolean> => {
    if (!orgId || sending) return false
    const text = body.trim()
    if (!text) return false
    setSending(true)
    setError(null)
    try {
      await sendTeamMessage(orgId, text)
      await load('refresh')
      return true
    } catch (e) {
      setError(toSafeMessage(e, 'Could not send the message'))
      return false
    } finally {
      setSending(false)
    }
  }, [orgId, sending, load])

  const deleteMine = useCallback(async (messageId: string) => {
    try {
      await deleteTeamMessage(messageId)
      await load('refresh')
    } catch (e) {
      setError(toSafeMessage(e, 'Could not delete the message'))
    }
  }, [load])

  return { messages, loading, error, hasMore, sending, reload, loadOlder, send, deleteMine }
}
