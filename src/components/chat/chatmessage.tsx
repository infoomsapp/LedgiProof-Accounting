import { memo } from 'react'
import Icon, { type IconName } from '../ui/Icon'

export type MessageRole = 'out' | 'in' | 'system' | 'ai'
export type MessageChannel = 'chat' | 'sms' | 'email'

export interface ChatMessageData {
  id: string
  role: MessageRole
  text: string
  channels?: MessageChannel[]
  ts: number
}

interface ChatMessageProps {
  message: ChatMessageData
}

const CHANNEL_ICON: Record<MessageChannel, IconName> = {
  chat: 'chat',
  sms: 'phone',
  email: 'mail'
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function ChannelChips({ channels }: { channels: MessageChannel[] | undefined }) {
  const extraChannels = channels?.filter(c => c !== 'chat') ?? []
  if (extraChannels.length === 0) return null

  return (
    <>
      {extraChannels.map(ch => (
        <span
          key={ch}
          title={`Sent via ${ch}`}
          style={{
            padding: '1px 5px',
            borderRadius: 100,
            background: 'var(--chat-bubble-other-bg)',
            border: '0.5px solid var(--chat-bubble-other-border)',
            fontSize: 10
          }}
        >
          <Icon name={CHANNEL_ICON[ch]} size={9} />
        </span>
      ))}
    </>
  )
}

function ChatMessage({ message: m }: ChatMessageProps) {
  // ── System / info line ────────────────────────────────────────────────
  if (m.role === 'system') {
    return (
      <div
        style={{
          alignSelf: 'center',
          fontSize: 11,
          color: 'var(--lp-text-muted)',
          background: 'var(--lp-surface-2)',
          border: '0.5px dashed var(--chat-bubble-other-border)',
          borderRadius: 100,
          padding: '3px 12px',
          textAlign: 'center',
          maxWidth: '92%',
          userSelect: 'text'
        }}
      >
        {m.text}
      </div>
    )
  }

  // ── AI suggestion ─────────────────────────────────────────────────────
  if (m.role === 'ai') {
    return (
      <div
        style={{
          maxWidth: '90%',
          alignSelf: 'flex-start',
          display: 'flex',
          flexDirection: 'column',
          gap: 3
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--sem-amber)',
            letterSpacing: '0.04em',
            marginLeft: 4
          }}
        >
          ✦ AI SUGGESTION
        </div>

        <div
          style={{
            padding: '9px 12px',
            borderRadius: 10,
            borderBottomLeftRadius: 3,
            background: 'var(--sem-amber-bg)',
            border: '0.5px solid var(--sem-amber)',
            fontSize: 12.5,
            color: 'var(--sem-amber)',
            lineHeight: 1.6,
            userSelect: 'text'
          }}
        >
          {m.text}
        </div>

        <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', marginLeft: 4 }}>
          {fmtTime(m.ts)}
        </div>
      </div>
    )
  }

  // ── Incoming client message ───────────────────────────────────────────
  if (m.role === 'in') {
    return (
      <div
        style={{
          maxWidth: '88%',
          alignSelf: 'flex-start',
          display: 'flex',
          flexDirection: 'column',
          gap: 3
        }}
      >
        <div
          style={{
            padding: '9px 12px',
            borderRadius: 10,
            borderBottomLeftRadius: 3,
            background: 'var(--chat-bubble-other-bg)',
            border: '0.5px solid var(--chat-bubble-other-border)',
            fontSize: 12.5,
            color: 'var(--chat-bubble-mine-text)',
            lineHeight: 1.6,
            userSelect: 'text'
          }}
        >
          {m.text}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 5,
            fontSize: 10.5,
            color: 'var(--lp-text-muted)'
          }}
        >
          {fmtTime(m.ts)}
        </div>
      </div>
    )
  }

  // ── Outgoing message ──────────────────────────────────────────────────
  return (
    <div
      style={{
        maxWidth: '88%',
        alignSelf: 'flex-end',
        display: 'flex',
        flexDirection: 'column',
        gap: 3
      }}
    >
      <div
        style={{
          padding: '9px 12px',
          borderRadius: 10,
          borderBottomRightRadius: 3,
          background: 'var(--chat-bubble-mine-bg)',
          border: '0.5px solid var(--chat-bubble-mine-border)',
          fontSize: 12.5,
          color: 'var(--chat-bubble-mine-text)',
          lineHeight: 1.6,
          userSelect: 'text'
        }}
      >
        {m.text}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 5,
          fontSize: 10.5,
          color: 'var(--lp-text-muted)'
        }}
      >
        {fmtTime(m.ts)}
        <ChannelChips channels={m.channels} />
      </div>
    </div>
  )
}

export default memo(ChatMessage)
