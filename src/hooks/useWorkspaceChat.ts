// PATH: src/hooks/useWorkspaceChat.ts
// Hook for workspace-level chat: inbox + active conversation messages.
//
// Used by:
//   - BookkeeperDashboard / WorkspaceChatPanel (org perspective, sees all clients)
//   - PymeDashboard (client perspective, sees only its own conversation)

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mergeLatestPage } from '../lib/chat-merge'
import {
  getWorkspaceInbox,
  getWorkspaceMessages,
  sendWorkspaceMessage,
  markWorkspaceMessagesRead,
  markWorkspaceConversationUnread,
  archiveWorkspaceConversation,
  restoreWorkspaceConversation,
  deleteWorkspaceConversation,
  deleteWorkspaceMessage,
  type WorkspaceInboxResponse,
  type WorkspaceMessage,
  type WorkspaceConversation,
  type MessageKind
} from '../services/workspace-chat.service'

const INBOX_REFRESH_MS = 60_000   // polling fallback (Realtime is primary)

// A burst of Realtime events (marking a 20-message thread read fires one
// UPDATE per row) collapses into a single refresh instead of 20 fetches.
const REALTIME_COALESCE_MS = 250
// Gap-recovery triggers (tab visible / browser online / channel resubscribed)
// can fire together; one catch-up per window is enough.
const CATCH_UP_MIN_GAP_MS = 2_000

type LoadMode = 'initial' | 'refresh'

export interface UseWorkspaceChat {
  // Inbox
  inbox:            WorkspaceInboxResponse | null
  inboxLoading:     boolean
  inboxRefreshing:  boolean
  showArchived:     boolean
  setShowArchived:  (next: boolean) => void
  refreshInbox:     () => Promise<void>

  // Active conversation
  activeConvId:     string | null
  activeClientId:   string | null
  openConversation:      (conv: WorkspaceConversation) => void
  startNewConversation:  (newClientId: string) => void
  closeConversation:     () => void

  messages:         WorkspaceMessage[]
  messagesLoading:  boolean
  hasMoreMessages:  boolean
  loadOlder:        () => Promise<void>

  // Load failures, kept apart from `error` (which send/archive/etc. also use)
  // so the UI can tell "could not load" from "nothing here yet" and offer a
  // retry. inboxError only while no inbox has ever loaded; messagesError only
  // while the open thread has nothing to show.
  inboxError:       string | null
  messagesError:    string | null
  retryMessages:    () => Promise<void>

  // Actions
  send:             (body: string, opts?: { clientVisible?: boolean; contextRef?: import('../services/workspace-chat.service').ContextRef; documentId?: string; messageTag?: import('../services/workspace-chat.service').MessageTag }) => Promise<boolean>
  sending:          boolean

  archive:          (convId: string) => Promise<void>
  restore:          (convId: string) => Promise<void>
  markUnread:       (convId: string) => Promise<void>
  deleteConversation: (convId: string) => Promise<void>
  deleteMessage:      (messageId: string) => Promise<void>

  error:            string | null
}

export function useWorkspaceChat(
  orgId:    string | null | undefined,
  clientId: string | null | undefined,    // null for bookkeeper view (sees all); set for pyme view
  enabled = true
): UseWorkspaceChat {
  // ── Inbox ──────────────────────────────────────────────────────────────────
  const [inbox,           setInbox]           = useState<WorkspaceInboxResponse | null>(null)
  const [inboxLoading,    setInboxLoading]    = useState(true)
  const [inboxRefreshing, setInboxRefreshing] = useState(false)
  const [showArchived,    setShowArchived]    = useState(false)

  // ── Active conversation ───────────────────────────────────────────────────
  const [activeConvId,    setActiveConvId]    = useState<string | null>(null)
  const [activeClientId,  setActiveClientId]  = useState<string | null>(null)
  const [messages,        setMessages]        = useState<WorkspaceMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [oldestAt,        setOldestAt]        = useState<string | null>(null)
  const [inboxError,      setInboxError]      = useState<string | null>(null)
  const [messagesError,   setMessagesError]   = useState<string | null>(null)

  // ── Actions state ─────────────────────────────────────────────────────────
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const inboxInFlight  = useRef(false)
  const hasLoadedOnce  = useRef(false)

  // Unique channel name per hook instance — prevents collisions when multiple
  // components (e.g. GlobalChatBubble + WorkspaceChatPanel) use this hook
  // with the same orgId simultaneously. Each mount gets its own channel.
  const instanceId = useRef(Math.random().toString(36).slice(2))

  // Refs to avoid stale closures inside the Realtime callback
  const refreshInboxRef   = useRef<() => Promise<void>>(() => Promise.resolve())
  const loadMessagesRef   = useRef<(id: string, mode?: LoadMode) => Promise<void>>(() => Promise.resolve())
  const activeConvIdRef   = useRef<string | null>(null)
  useEffect(() => { activeConvIdRef.current = activeConvId }, [activeConvId])

  // Latest committed messages, for merging a refresh into what is on screen
  // without a stale closure. loadSeq lets the newest load win when several
  // are in flight.
  const messagesRef = useRef<WorkspaceMessage[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  const loadSeq = useRef(0)
  const needsMarkRead = useRef(false)

  // ── Load inbox ─────────────────────────────────────────────────────────────
  const refreshInbox = useCallback(async () => {
    if (!orgId || !enabled || inboxInFlight.current) return
    inboxInFlight.current = true

    const isFirst = !hasLoadedOnce.current
    if (isFirst) setInboxLoading(true); else setInboxRefreshing(true)
    setError(null)

    try {
      const res = await getWorkspaceInbox(orgId, showArchived, 50)
      if (clientId) {
        // For pyme view: filter to only this client's conversation(s) and
        // recompute aggregate counts from the filtered set (BUG-04)
        const convs = res.conversations.filter(c => c.client_id === clientId)
        setInbox({
          ...res,
          conversations:  convs,
          total:          convs.length,
          unread_total:   convs.reduce((sum, c) => sum + c.my_unread_count, 0),
        })
      } else {
        setInbox(res)
      }
      hasLoadedOnce.current = true
      setInboxError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load inbox')
      // Only surfaced while there is no inbox to show: a failed background
      // refresh keeps the last good list on screen.
      setInboxError(e?.message ?? 'Could not load inbox')
    } finally {
      setInboxLoading(false)
      setInboxRefreshing(false)
      inboxInFlight.current = false
    }
  }, [orgId, enabled, showArchived, clientId])

  useEffect(() => { refreshInboxRef.current = refreshInbox }, [refreshInbox])

  useEffect(() => {
    if (!enabled || !orgId) {
      setInboxLoading(false)
      return
    }
    refreshInbox()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, enabled, showArchived])

  // Supabase Realtime — triggers on any new workspace_message (RLS filters to org)
  //
  // Realtime is a hint, not the source of truth: events are dropped while the
  // tab is hidden, the socket can drop and reconnect, and the browser can be
  // offline. So besides reacting to events, every "we may have missed
  // something" moment (tab visible again, browser back online, channel
  // resubscribed) runs the same catch-up refetch.
  useEffect(() => {
    if (!enabled || !orgId) return

    const refreshActive = () => {
      if (document.visibilityState === 'hidden') return
      refreshInboxRef.current()
      const convId = activeConvIdRef.current
      if (convId) loadMessagesRef.current(convId, 'refresh')
    }

    let coalesceTimer: ReturnType<typeof setTimeout> | null = null
    const onRealtimeEvent = () => {
      if (coalesceTimer) clearTimeout(coalesceTimer)
      coalesceTimer = setTimeout(() => { coalesceTimer = null; refreshActive() }, REALTIME_COALESCE_MS)
    }

    let lastCatchUp = 0
    const catchUp = () => {
      const now = Date.now()
      if (now - lastCatchUp < CATCH_UP_MIN_GAP_MS) return
      lastCatchUp = now
      refreshActive()
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') catchUp() }

    let subscribedBefore = false
    const channel = supabase
      .channel(`workspace-chat-${orgId}-${instanceId.current}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_messages' }, onRealtimeEvent)
      // UPDATE catches the read-receipt flip specifically -- without this,
      // the checkmark only ever updated on the sender's NEXT reload (a new
      // message, reopening the thread), never live the moment the other
      // side actually read it, which is the entire point of a live receipt.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspace_messages' }, onRealtimeEvent)
      // A team-channel message changes the Team badge, which rides on the
      // inbox response. RLS only lets a firm's own members receive these.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_team_messages' }, onRealtimeEvent)
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return
        // The first SUBSCRIBED is the initial connect (data was just loaded);
        // any later one is a reconnect, so events may have been lost.
        if (subscribedBefore) catchUp()
        subscribedBefore = true
      })

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', catchUp)
    return () => {
      if (coalesceTimer) clearTimeout(coalesceTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', catchUp)
      supabase.removeChannel(channel)
    }
  }, [orgId, enabled])

  // Polling fallback (60 s — Realtime handles the fast path)
  useEffect(() => {
    if (!enabled || !orgId) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') refreshInboxRef.current()
    }, INBOX_REFRESH_MS)
    return () => clearInterval(id)
  }, [enabled, orgId])

  // ── Load messages of a conversation ──────────────────────────────────────
  // Keep ref current so the Realtime callback can call it without stale closure
  //
  // 'initial' (opening a thread) replaces the list and shows the loading
  // state. 'refresh' (realtime, catch-up, after a send/delete) MERGES the
  // latest page into what is on screen: older pages the user already loaded
  // stay put, and there is no loading flicker.
  const loadMessages = useCallback(async (convId: string, mode: LoadMode = 'initial') => {
    const seq = ++loadSeq.current
    if (mode === 'initial') {
      setMessagesLoading(true)
      // Opening a thread always marks it read (this also clears a "mark as
      // unread" flag). Remembered in a ref because a refresh that lands
      // while this load is in flight supersedes it and must carry it out.
      needsMarkRead.current = true
    }
    setError(null)
    try {
      const res = await getWorkspaceMessages(convId, 50, null)
      // The user left this thread, or a newer load started while we waited:
      // this response is stale and must not overwrite what is on screen.
      if (activeConvIdRef.current !== convId || seq !== loadSeq.current) return

      const fetched = res.messages
      const merged  = mode === 'refresh'
        ? mergeLatestPage(messagesRef.current, fetched, res.has_more)
        : { messages: fetched, keptOlder: false }

      setMessages(merged.messages)
      // Older pages kept => the existing pagination cursor is still right.
      if (!merged.keptOlder) {
        setHasMoreMessages(res.has_more)
        setOldestAt(res.oldest_at)
      }
      setMessagesError(null)
      setMessagesLoading(false)

      // Mark read once messages are visible. On a refresh, only when there is
      // actually something unread from the other side -- otherwise every
      // realtime event would cost a pointless RPC + inbox reload.
      const iAmStaff = res.role === 'bookkeeper'
      const hasUnread = fetched.some(m => iAmStaff
        ? m.sender_role === 'client' && !m.read_by_bookkeeper
        : m.sender_role === 'bookkeeper' && m.client_visible && !m.read_by_client)
      if (needsMarkRead.current || hasUnread) {
        needsMarkRead.current = false
        await markWorkspaceMessagesRead(convId).catch(() => { /* non-critical */ })
        // Refresh inbox so unread counters update
        refreshInbox()
      }
    } catch (e: any) {
      if (activeConvIdRef.current !== convId) return
      setError(e?.message ?? 'Could not load messages')
      // Only an empty thread turns into an error state; a thread that already
      // has messages keeps showing them.
      if (mode === 'initial' || messagesRef.current.length === 0) {
        setMessagesError(e?.message ?? 'Could not load messages')
      }
    } finally {
      // Only the newest load may clear the loading state.
      if (seq === loadSeq.current) setMessagesLoading(false)
    }
  }, [refreshInbox])

  useEffect(() => { loadMessagesRef.current = loadMessages }, [loadMessages])

  const openConversation = useCallback((conv: WorkspaceConversation) => {
    // Set the ref now, not after the next render: loadMessages checks it to
    // discard responses for a thread that is no longer open.
    activeConvIdRef.current = conv.id
    setActiveConvId(conv.id)
    setActiveClientId(conv.client_id)
    setMessages([])
    setHasMoreMessages(false)
    setOldestAt(null)
    setMessagesError(null)
    loadMessages(conv.id, 'initial')
  }, [loadMessages])

  const retryMessages = useCallback(async () => {
    const convId = activeConvIdRef.current
    if (convId) await loadMessages(convId, 'initial')
  }, [loadMessages])

  // Prepares the composer for a brand-new conversation without an existing convId.
  // The first send() call will create the conversation via the RPC (get-or-create).
  const startNewConversation = useCallback((newClientId: string) => {
    activeConvIdRef.current = null
    setActiveConvId(null)
    setActiveClientId(newClientId)
    setMessages([])
    setHasMoreMessages(false)
    setOldestAt(null)
    setMessagesError(null)
    setError(null)
  }, [])

  const closeConversation = useCallback(() => {
    activeConvIdRef.current = null
    setActiveConvId(null)
    setActiveClientId(null)
    setMessages([])
    setHasMoreMessages(false)
    setOldestAt(null)
    setMessagesError(null)
  }, [])

  // ── Pagination: load older messages ──────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (!activeConvId || !hasMoreMessages || !oldestAt) return
    setMessagesLoading(true)
    try {
      const res = await getWorkspaceMessages(activeConvId, 50, oldestAt)
      if (activeConvIdRef.current !== activeConvId) return
      setMessages(prev => {
        const have = new Set(prev.map(m => m.id))
        return [...res.messages.filter(m => !have.has(m.id)), ...prev]
      })
      setHasMoreMessages(res.has_more)
      setOldestAt(res.oldest_at)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load older messages')
    } finally {
      setMessagesLoading(false)
    }
  }, [activeConvId, hasMoreMessages, oldestAt])

  // ── Send message ──────────────────────────────────────────────────────────
  const send = useCallback(async (
    body: string,
    opts: { clientVisible?: boolean; contextRef?: import('../services/workspace-chat.service').ContextRef; documentId?: string; messageTag?: import('../services/workspace-chat.service').MessageTag } = {}
  ): Promise<boolean> => {
    if (!orgId || sending) return false

    const trimmed = body.trim()
    if (trimmed.length === 0 && !opts.contextRef && !opts.documentId) return false

    // Determine target client_id:
    //   - PYME view: clientId prop is set on the hook
    //   - Bookkeeper view: activeClientId is stored when openConversation() is called
    const targetClientId = clientId ?? activeClientId
    if (!targetClientId) {
      setError('No conversation selected')
      return false
    }

    setSending(true)
    setError(null)
    try {
      const res = await sendWorkspaceMessage({
        orgId,
        clientId: targetClientId,
        ...(trimmed.length > 0               ? { body:          trimmed              } : {}),
        ...(opts.clientVisible !== undefined  ? { clientVisible: opts.clientVisible  } : {}),
        ...(opts.contextRef    !== undefined  ? { contextRef:    opts.contextRef     } : {}),
        ...(opts.documentId    !== undefined  ? { documentId:    opts.documentId     } : {}),
        ...(opts.messageTag    !== undefined  ? { messageTag:    opts.messageTag     } : {})
      })
      await Promise.all([
        refreshInbox(),
        activeConvId ? loadMessages(activeConvId, 'refresh') : Promise.resolve(),
      ])
      if (res.is_new_conversation && !activeConvId) {
        activeConvIdRef.current = res.conversation_id
        setActiveConvId(res.conversation_id)
        setActiveClientId(targetClientId)
        loadMessages(res.conversation_id, 'initial')
      }
      return true
    } catch (e: any) {
      setError(e?.message ?? 'Could not send message')
      return false
    } finally {
      setSending(false)
    }
  }, [orgId, clientId, activeClientId, activeConvId, sending, refreshInbox, loadMessages])

  // ── Archive / restore ─────────────────────────────────────────────────────
  const archive = useCallback(async (convId: string) => {
    try {
      await archiveWorkspaceConversation(convId)
      if (activeConvId === convId) closeConversation()
      await refreshInbox()
    } catch (e: any) {
      setError(e?.message ?? 'Could not archive')
    }
  }, [activeConvId, closeConversation, refreshInbox])

  const restore = useCallback(async (convId: string) => {
    try {
      await restoreWorkspaceConversation(convId)
      await refreshInbox()
    } catch (e: any) {
      setError(e?.message ?? 'Could not restore')
    }
  }, [refreshInbox])

  // Permanent (soft-delete server-side, but gone from every list here) --
  // unlike archive, this doesn't come back. Closes the active conversation
  // first if it's the one being deleted, same as archive does.
  const deleteConversation = useCallback(async (convId: string) => {
    try {
      await deleteWorkspaceConversation(convId)
      if (activeConvId === convId) closeConversation()
      await refreshInbox()
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete')
    }
  }, [activeConvId, closeConversation, refreshInbox])

  // Soft-deletes one message. Reloads from the server rather than patching
  // the local array in place -- get_workspace_messages is what actually
  // masks the body, and re-fetching keeps that single source of truth
  // instead of duplicating its masking logic here.
  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      await deleteWorkspaceMessage(messageId)
      if (activeConvId) await loadMessages(activeConvId, 'refresh')
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete the message')
    }
  }, [activeConvId, loadMessages])

  // "Mark as unread" (⋮ menu) — a follow-up flag, not a literal per-message
  // read-state change (see the RPC's own comment). Closes back to the inbox
  // afterward so the newly-flagged unread badge is actually visible, same
  // as archiving the active conversation already does.
  const markUnread = useCallback(async (convId: string) => {
    try {
      await markWorkspaceConversationUnread(convId)
      if (activeConvId === convId) closeConversation()
      await refreshInbox()
    } catch (e: any) {
      setError(e?.message ?? 'Could not mark unread')
    }
  }, [activeConvId, closeConversation, refreshInbox])

  return {
    inbox,
    inboxLoading,
    inboxRefreshing,
    showArchived,
    setShowArchived,
    refreshInbox,

    activeConvId,
    activeClientId,
    openConversation,
    startNewConversation,
    closeConversation,

    messages,
    messagesLoading,
    hasMoreMessages,
    loadOlder,

    inboxError,
    messagesError,
    retryMessages,

    send,
    sending,

    archive,
    restore,
    markUnread,
    deleteConversation,
    deleteMessage,

    error
  }
}
