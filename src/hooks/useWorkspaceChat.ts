// PATH: src/hooks/useWorkspaceChat.ts
// Hook for workspace-level chat: inbox + active conversation messages.
//
// Used by:
//   - BookkeeperDashboard / WorkspaceChatPanel (org perspective, sees all clients)
//   - PymeDashboard (client perspective, sees only its own conversation)

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getWorkspaceInbox,
  getWorkspaceMessages,
  sendWorkspaceMessage,
  markWorkspaceMessagesRead,
  archiveWorkspaceConversation,
  restoreWorkspaceConversation,
  type WorkspaceInboxResponse,
  type WorkspaceMessage,
  type WorkspaceConversation,
  type MessageKind
} from '../services/workspace-chat.service'

const INBOX_REFRESH_MS = 60_000   // polling fallback (Realtime is primary)

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

  // Actions
  send:             (body: string, opts?: { clientVisible?: boolean; contextRef?: import('../services/workspace-chat.service').ContextRef; documentId?: string }) => Promise<boolean>
  sending:          boolean

  archive:          (convId: string) => Promise<void>
  restore:          (convId: string) => Promise<void>

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
  const loadMessagesRef   = useRef<(id: string) => Promise<void>>(() => Promise.resolve())
  const activeConvIdRef   = useRef<string | null>(null)
  useEffect(() => { activeConvIdRef.current = activeConvId }, [activeConvId])

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
    } catch (e: any) {
      setError(e?.message ?? 'Could not load inbox')
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
  useEffect(() => {
    if (!enabled || !orgId) return
    const channel = supabase
      .channel(`workspace-chat-${orgId}-${instanceId.current}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_messages' }, () => {
        if (document.visibilityState !== 'hidden') {
          refreshInboxRef.current()
          const convId = activeConvIdRef.current
          if (convId) loadMessagesRef.current(convId)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
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
  const loadMessages = useCallback(async (convId: string) => {
    setMessagesLoading(true)
    setError(null)
    try {
      const res = await getWorkspaceMessages(convId, 50, null)
      setMessages(res.messages)
      setHasMoreMessages(res.has_more)
      setOldestAt(res.oldest_at)
      // Mark read once messages are visible
      await markWorkspaceMessagesRead(convId).catch(() => { /* non-critical */ })
      // Refresh inbox so unread counters update
      refreshInbox()
    } catch (e: any) {
      setError(e?.message ?? 'Could not load messages')
    } finally {
      setMessagesLoading(false)
    }
  }, [refreshInbox])

  useEffect(() => { loadMessagesRef.current = loadMessages }, [loadMessages])

  const openConversation = useCallback((conv: WorkspaceConversation) => {
    setActiveConvId(conv.id)
    setActiveClientId(conv.client_id)
    setMessages([])
    setHasMoreMessages(false)
    setOldestAt(null)
    loadMessages(conv.id)
  }, [loadMessages])

  // Prepares the composer for a brand-new conversation without an existing convId.
  // The first send() call will create the conversation via the RPC (get-or-create).
  const startNewConversation = useCallback((newClientId: string) => {
    setActiveConvId(null)
    setActiveClientId(newClientId)
    setMessages([])
    setHasMoreMessages(false)
    setOldestAt(null)
    setError(null)
  }, [])

  const closeConversation = useCallback(() => {
    setActiveConvId(null)
    setActiveClientId(null)
    setMessages([])
    setHasMoreMessages(false)
    setOldestAt(null)
  }, [])

  // ── Pagination: load older messages ──────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (!activeConvId || !hasMoreMessages || !oldestAt) return
    setMessagesLoading(true)
    try {
      const res = await getWorkspaceMessages(activeConvId, 50, oldestAt)
      setMessages(prev => [...res.messages, ...prev])
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
    opts: { clientVisible?: boolean; contextRef?: import('../services/workspace-chat.service').ContextRef; documentId?: string } = {}
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
        ...(opts.documentId    !== undefined  ? { documentId:    opts.documentId     } : {})
      })
      await Promise.all([
        refreshInbox(),
        activeConvId ? loadMessages(activeConvId) : Promise.resolve(),
      ])
      if (res.is_new_conversation && !activeConvId) {
        setActiveConvId(res.conversation_id)
        setActiveClientId(targetClientId)
        loadMessages(res.conversation_id)
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

    send,
    sending,

    archive,
    restore,

    error
  }
}
