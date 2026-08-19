// PATH: src/hooks/useMemberChat.ts
//
// P4 Fase 2.B.2 — React hook for member-to-member chat.
//
// Mirror of useWorkspaceChat but consumes the isolated member chat RPCs.
// Exposes the same shape (inbox, openConversation, sendMessage, archive, etc.)
// so components can switch between client and member chat with minimal code.

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getMemberInbox,
  getMemberMessages,
  sendMemberMessage,
  markMemberMessagesRead,
  archiveMemberConversation,
  restoreMemberConversation,
  type MemberInbox,
  type MemberMessage,
  type MemberConversationSummary
} from '../services/member-chat.service'

const POLL_INTERVAL_MS = 8000

export interface UseMemberChat {
  // Inbox state
  inbox:        MemberInbox | null
  inboxLoading: boolean
  showArchived: boolean
  setShowArchived: (v: boolean) => void
  refreshInbox: () => Promise<void>

  // Active conversation state
  activeConvId: string | null
  openConversation: (convOrId: MemberConversationSummary | string) => void
  closeConversation: () => void

  // Messages state
  messages:        MemberMessage[]
  messagesLoading: boolean

  // Mutations
  sending:     boolean
  send:        (body: string, documentId?: string) => Promise<void>
  archive:     (convId: string) => Promise<void>
  restore:     (convId: string) => Promise<void>
}

export function useMemberChat(
  orgId:    string,
  autoPoll = true
): UseMemberChat {
  const [inbox,         setInbox]         = useState<MemberInbox | null>(null)
  const [inboxLoading,  setInboxLoading]  = useState(false)
  const [showArchived,  setShowArchived]  = useState(false)
  const [activeConvId,  setActiveConvId]  = useState<string | null>(null)
  const [messages,      setMessages]      = useState<MemberMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending,       setSending]       = useState(false)

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)

  // ── Refresh inbox ────────────────────────────────────────────────────────
  const refreshInbox = useCallback(async () => {
    if (!orgId) return
    setInboxLoading(true)
    try {
      const result = await getMemberInbox(orgId, showArchived)
      setInbox(result)
    } catch (e) {
      console.error('[useMemberChat] refreshInbox failed:', e)
    } finally {
      setInboxLoading(false)
    }
  }, [orgId, showArchived])

  // Initial load + on showArchived change
  useEffect(() => {
    refreshInbox()
  }, [refreshInbox])

  // ── Refresh messages ─────────────────────────────────────────────────────
  const refreshMessages = useCallback(async () => {
    if (!activeConvId) {
      setMessages([])
      return
    }
    setMessagesLoading(true)
    try {
      const msgs = await getMemberMessages(activeConvId)
      setMessages(msgs)
      // Mark as read after fetching (fire-and-forget)
      markMemberMessagesRead(activeConvId).catch(err => {
        console.error('[useMemberChat] markRead failed:', err)
      })
    } catch (e) {
      console.error('[useMemberChat] refreshMessages failed:', e)
    } finally {
      setMessagesLoading(false)
    }
  }, [activeConvId])

  // Load messages when active conv changes
  useEffect(() => {
    refreshMessages()
  }, [refreshMessages])

  // ── Polling ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoPoll) return
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)

    pollTimerRef.current = setInterval(() => {
      refreshInbox()
      if (activeConvId) refreshMessages()
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [autoPoll, refreshInbox, refreshMessages, activeConvId])

  // ── Open / close conversation ────────────────────────────────────────────
  const openConversation = useCallback((convOrId: MemberConversationSummary | string) => {
    const id = typeof convOrId === 'string' ? convOrId : convOrId.id
    setActiveConvId(id)
  }, [])

  const closeConversation = useCallback(() => {
    setActiveConvId(null)
    setMessages([])
  }, [])

  // ── Send message ─────────────────────────────────────────────────────────
  const send = useCallback(async (body: string, documentId?: string) => {
    if (!activeConvId) throw new Error('No active conversation')
    if (!body.trim() && !documentId) return
    setSending(true)
    try {
      await sendMemberMessage({
        conversationId: activeConvId,
        ...(body.trim() ? { body: body.trim() } : {}),
        ...(documentId  ? { documentId }         : {})
      })
      // Re-fetch immediately to show the new message
      await refreshMessages()
      await refreshInbox()
    } finally {
      setSending(false)
    }
  }, [activeConvId, refreshMessages, refreshInbox])

  // ── Archive / restore ────────────────────────────────────────────────────
  const archive = useCallback(async (convId: string) => {
    await archiveMemberConversation(convId)
    if (convId === activeConvId) closeConversation()
    await refreshInbox()
  }, [activeConvId, closeConversation, refreshInbox])

  const restore = useCallback(async (convId: string) => {
    await restoreMemberConversation(convId)
    await refreshInbox()
  }, [refreshInbox])

  return {
    inbox,
    inboxLoading,
    showArchived,
    setShowArchived,
    refreshInbox,
    activeConvId,
    openConversation,
    closeConversation,
    messages,
    messagesLoading,
    sending,
    send,
    archive,
    restore
  }
}
