// PATH: src/components/chat/chatpanel.tsx
//
import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { useClientContext } from '../../hooks/useClientContext'
import type { Transaction, LpRole } from '../../types/database.types'
import SemaphoreBadge from '../semaphore/SemaphoreBadge'
import ChatMessage, { type ChatMessageData, type MessageChannel } from './chatmessage'
import ChatInput from './chatinput'
import { askAi } from '../../services/ai-assistant.service'
import { isQuotaExceededError } from '../../services/quota.service'
import {
  openOrGetTransactionConversation,
  getTransactionMessages,
  sendTransactionMessage,
  type TransactionMessage,
} from '../../services/chat-tx.service'

interface ChatPanelProps {
  transaction: Transaction
  orgId: string
}

const CHAT_ALLOWED_ROLES: LpRole[] = ['owner', 'admin', 'accountant', 'approver']
const EXTERNAL_SEND_ALLOWED_ROLES: LpRole[] = ['owner', 'admin', 'accountant']

function mapDbMessage(row: TransactionMessage): ChatMessageData {
  const ts = new Date(row.created_at).getTime()

  if (row.message_kind === 'ai' || row.ai_generated) {
    return { id: row.id, role: 'ai', text: row.body ?? '', ts }
  }

  if (row.sender_role === 'system') {
    return { id: row.id, role: 'system', text: row.body ?? '', ts }
  }

  if (row.sender_role === 'client') {
    return {
      id: row.id,
      role: 'in',
      text: row.body ?? '',
      channels: (row.channels as MessageChannel[]) ?? ['chat'],
      ts
    }
  }

  return {
    id: row.id,
    role: 'out',
    text: row.body ?? '',
    channels: (row.channels as MessageChannel[]) ?? ['chat'],
    ts
  }
}

export default function ChatPanel({ transaction: tx, orgId }: ChatPanelProps) {
  const { membership, user, profile } = useAuthStore()
  const { isClient } = useClientContext()

  const actorId = user?.id ?? profile?.id ?? ''
  const workspaceRole: LpRole = membership?.role ?? 'readonly'

  const canOpenChat = isClient || CHAT_ALLOWED_ROLES.includes(workspaceRole)
  const canSendExternal =
    !isClient && EXTERNAL_SEND_ALLOWED_ROLES.includes(workspaceRole)

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<string | undefined>(undefined)

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth'
    })
  }, [messages])

  async function loadMessages(convoId: string) {
    try {
      const res = await getTransactionMessages(convoId, 50)
      setMessages(res.messages.map(mapDbMessage))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load messages')
    }
  }

  async function initChat() {
    try {
      const convoId = await openOrGetTransactionConversation(tx.id)
      setConversationId(convoId)
      await loadMessages(convoId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open conversation')
    }
  }

  async function handleSend(text: string, channels: MessageChannel[]) {
    if (!conversationId) return

    const wantsExternal = channels.some(c => c !== 'chat')

    if (isClient && wantsExternal) {
      setError('Clients are not authorized to send external messages')
      return
    }

    if (wantsExternal && !canSendExternal) {
      setError('Not authorized to send external messages')
      return
    }

    setError(null)

    try {
      await sendTransactionMessage({
        conversationId,
        body: text,
        channels: channels as import('../../services/chat-tx.service').MessageChannel[],
        clientVisible: true,
      })
      setAiSuggestion(undefined)
      await loadMessages(conversationId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
    }
  }

  // ── AI-drafted reply suggestion ────────────────────────────────────────
  // Prefills the ChatInput textarea with a Claude-drafted reply based on the
  // transaction context and recent conversation. The bookkeeper reviews and
  // edits before sending — nothing is auto-posted.
  async function handleAISuggest() {
    if (!conversationId) return

    setAiLoading(true)
    setError(null)

    try {
      const recent = messages
        .slice(-6)
        .map(m => {
          const speaker = m.role === 'in' ? 'Client' : m.role === 'out' ? 'Bookkeeper' : m.role === 'ai' ? 'AI' : 'System'
          return `${speaker}: ${m.text}`
        })
        .join('\n')

      const prompt =
        `You are helping a bookkeeper draft a reply in a client chat about a financial transaction.\n\n` +
        `Transaction: ${tx.description ?? 'N/A'} — amount $${tx.amount}, date ${tx.transaction_date}.\n\n` +
        `Recent conversation:\n${recent || '(no messages yet)'}\n\n` +
        `Draft a short, professional reply (2-4 sentences) the bookkeeper could send next. ` +
        `Reply with ONLY the message text, no preamble or quotes.`

      const res = await askAi({ orgId, prompt })
      setAiSuggestion(res.reply.trim())
    } catch (err) {
      if (isQuotaExceededError(err)) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'AI suggestion failed')
      }
    } finally {
      setAiLoading(false)
    }
  }

  const placeholder = isClient
    ? 'Respond to this transaction'
    : 'Write a message regarding this transaction'

  if (!canOpenChat) return null

  if (!open) {
    return (
      <div style={{ padding: 12 }}>
        <button onClick={() => { setOpen(true); initChat() }}>
          Open chat
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        borderTop: '1px solid #333',
        height: 420,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          padding: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <SemaphoreBadge status={tx.semaphore} size="sm" />
        <button onClick={() => setOpen(false)}>Close</button>
      </div>

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        {messages.map(m => (
          <ChatMessage key={m.id} message={m} />
        ))}
      </div>

      {error && (
        <div style={{ padding: 8, color: 'red' }}>
          {error}
        </div>
      )}

      <div style={{ padding: 10 }}>
        <ChatInput
          onSend={handleSend}
          onAISuggest={handleAISuggest}
          aiLoading={aiLoading}
          aiEnabled={!isClient}
          placeholder={placeholder}
          enabledChannels={isClient ? ['chat'] : ['chat', 'sms', 'email']}
          {...(aiSuggestion !== undefined ? { prefillText: aiSuggestion } : {})}
        />
      </div>
    </div>
  )
}
