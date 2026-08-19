// PATH: src/hooks/useTransactionChat.ts
//
// Hook for the per-transaction chat. Owns:
//   - Opening (or getting) the conversation for a transaction
//   - Loading messages (paginated)
//   - Sending messages via send_transaction_message RPC
//   - Marking the other side's messages as read
//   - Real-time subscription via Supabase Realtime (insert events)
//   - Cleanup on unmount

import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../lib/supabase'
import {
  openOrGetTransactionConversation,
  getTransactionMessages,
  sendTransactionMessage,
  markTransactionMessagesRead,
  type TransactionMessage,
  type MessageChannel,
  type MessageKind
} from '../services/chat-tx.service'

export interface UseTransactionChat {
  /** Conversation UUID once opened, null before */
  conversationId:  string | null
  /** 'bookkeeper' | 'client' as returned by RPC */
  viewerRole:      'bookkeeper' | 'client' | null
  /** Conversation status: 'open' | 'closed' | 'resolved' | ... */
  status:          string | null

  /** Messages (chronological, oldest first) */
  messages:        TransactionMessage[]
  loading:         boolean
  loadingMore:     boolean
  hasMore:         boolean
  error:           string | null

  /** Open / lazily create the conversation */
  open:            () => Promise<void>
  /** Send a new message */
  send:            (body: string, opts?: SendOptions) => Promise<void>
  sending:         boolean
  /** Manually refresh */
  refresh:         () => Promise<void>
  /** Load older messages (pagination) */
  loadOlder:       () => Promise<void>
  /** Mark other-party messages as read */
  markRead:        () => Promise<void>
}

interface SendOptions {
  channels?:       MessageChannel[]
  documentId?:     string
  messageKind?:    MessageKind
  clientVisible?:  boolean
}

const PAGE_SIZE = 50

export function useTransactionChat(transactionId: string): UseTransactionChat {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [viewerRole,     setViewerRole]     = useState<'bookkeeper' | 'client' | null>(null)
  const [status,         setStatus]         = useState<string | null>(null)

  const [messages,       setMessages]       = useState<TransactionMessage[]>([])
  const [loading,        setLoading]        = useState(false)
  const [loadingMore,    setLoadingMore]    = useState(false)
  const [hasMore,        setHasMore]        = useState(false)
  const [oldestAt,       setOldestAt]       = useState<string | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [sending,        setSending]        = useState(false)

  const inFlight = useRef(false)
  const channelRef = useRef<ReturnType<typeof db.channel> | null>(null)

  // ── Open conversation ────────────────────────────────────────────────────
  const open = useCallback(async () => {
    if (!transactionId || inFlight.current) return
    inFlight.current = true
    setLoading(true)
    setError(null)

    try {
      const convId = await openOrGetTransactionConversation(transactionId)
      setConversationId(convId)

      const res = await getTransactionMessages(convId, PAGE_SIZE, null)
      // RPC returns DESC; flip to chronological asc for display
      const chrono = [...res.messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      setMessages(chrono)
      setViewerRole(res.role)
      setStatus(res.status)
      setHasMore(res.has_more)
      setOldestAt(res.oldest_at)

      // Mark read silently after opening
      await markTransactionMessagesRead(convId).catch(() => { /* non-critical */ })
    } catch (e: any) {
      setError(e?.message ?? 'Could not open chat')
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [transactionId])

  // ── Refresh (reload all current messages) ─────────────────────────────────
  const refresh = useCallback(async () => {
    if (!conversationId) return
    try {
      const res = await getTransactionMessages(conversationId, PAGE_SIZE, null)
      const chrono = [...res.messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      setMessages(chrono)
      setStatus(res.status)
      setHasMore(res.has_more)
      setOldestAt(res.oldest_at)
    } catch (e: any) {
      setError(e?.message ?? 'Could not refresh')
    }
  }, [conversationId])

  // ── Load older (pagination) ───────────────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (!conversationId || !hasMore || !oldestAt || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await getTransactionMessages(conversationId, PAGE_SIZE, oldestAt)
      const olderChrono = [...res.messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      setMessages(prev => [...olderChrono, ...prev])
      setHasMore(res.has_more)
      setOldestAt(res.oldest_at)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load older messages')
    } finally {
      setLoadingMore(false)
    }
  }, [conversationId, hasMore, oldestAt, loadingMore])

  // ── Send message ──────────────────────────────────────────────────────────
  const send = useCallback(async (body: string, opts: SendOptions = {}) => {
    if (!conversationId || sending) return
    const trimmed = body.trim()
    if (trimmed.length === 0 && !opts.documentId) return

    setSending(true)
    setError(null)
    try {
      await sendTransactionMessage({
        conversationId,
        channels: opts.channels ?? ['chat'],
        ...(trimmed              ? { body: trimmed }                   : {}),
        ...(opts.documentId      ? { documentId: opts.documentId }     : {}),
        ...(opts.messageKind     ? { messageKind: opts.messageKind }   : {}),
        ...(opts.clientVisible !== undefined ? { clientVisible: opts.clientVisible } : {})
      })
      // Trigger a refresh — the realtime subscription will also pick it up,
      // but doing both makes the UX feel instant even if realtime is delayed.
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? 'Could not send message')
    } finally {
      setSending(false)
    }
  }, [conversationId, sending, refresh])

  // ── Mark read (called on focus / open) ────────────────────────────────────
  const markRead = useCallback(async () => {
    if (!conversationId) return
    try {
      await markTransactionMessagesRead(conversationId)
    } catch {
      /* silent */
    }
  }, [conversationId])

  // ── Realtime subscription ─────────────────────────────────────────────────
  // Subscribes to INSERTs on transaction_messages filtered by conversation_id.
  // When a new message arrives from the OTHER side, append it and mark as read
  // if the panel is currently visible.
  useEffect(() => {
    if (!conversationId) return

    // Clean up any previous subscription
    if (channelRef.current) {
      db.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = db
      .channel(`tx-msg-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'transaction_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        async () => {
          // Re-fetch latest page (cheap; could also dedupe by id).
          // This is the simplest correct approach; optimize later if needed.
          await refresh()
          // If panel is visible, mark as read
          if (document.visibilityState !== 'hidden') {
            markTransactionMessagesRead(conversationId).catch(() => {})
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        db.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [conversationId, refresh])

  // ── Re-mark read when window regains focus ───────────────────────────────
  useEffect(() => {
    if (!conversationId) return
    function onFocus() { markRead() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [conversationId, markRead])

  return {
    conversationId,
    viewerRole,
    status,
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    open,
    send,
    sending,
    refresh,
    loadOlder,
    markRead
  }
}
