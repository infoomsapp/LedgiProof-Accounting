import { useState, useRef, useEffect, type KeyboardEvent, type CSSProperties } from 'react'
import type { MessageChannel } from './chatmessage'

interface ChatInputProps {
  onSend: (text: string, channels: MessageChannel[]) => void
  onAISuggest: () => void
  aiLoading?: boolean
  aiEnabled?: boolean
  placeholder?: string
  prefillText?: string
  disabled?: boolean
  enabledChannels?: MessageChannel[]
}

const CHANNEL_LABELS: Record<MessageChannel, string> = {
  chat: '💬 Chat',
  sms: '📱 SMS',
  email: '✉️ Email'
}

const SPINNER_STYLE: CSSProperties = {
  display: 'inline-block',
  width: 9,
  height: 9,
  border: '1.5px solid currentColor',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'lp-chatinput-spin 0.6s linear infinite'
}

export default function ChatInput({
  onSend,
  onAISuggest,
  aiLoading = false,
  aiEnabled = true,
  placeholder = 'Write a message… (Enter to send)',
  prefillText,
  disabled = false,
  enabledChannels = ['chat']
}: ChatInputProps) {
  const normalizedEnabledChannels = enabledChannels.includes('chat')
    ? enabledChannels
    : ['chat', ...enabledChannels]

  const [text, setText] = useState('')
  const [channels, setChannels] = useState<Set<MessageChannel>>(new Set(['chat']))
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (prefillText) {
      setText(prefillText)
      textareaRef.current?.focus()
    }
  }, [prefillText])

  useEffect(() => {
    setChannels(prev => {
      const next = new Set<MessageChannel>(['chat'])
      for (const ch of prev) {
        if (normalizedEnabledChannels.includes(ch)) next.add(ch)
      }
      return next
    })
  }, [normalizedEnabledChannels.join('|')])

  function channelIsEnabled(ch: MessageChannel) {
    return normalizedEnabledChannels.includes(ch)
  }

  function toggleChannel(ch: MessageChannel) {
    if (ch === 'chat') return
    if (!channelIsEnabled(ch) || disabled) return

    setChannels(prev => {
      const next = new Set(prev)
      next.has(ch) ? next.delete(ch) : next.add(ch)
      return next
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return

    const safeChannels = Array.from(channels).filter(ch => channelIsEnabled(ch))
    if (!safeChannels.includes('chat')) safeChannels.unshift('chat')

    onSend(trimmed, safeChannels)
    setText('')
  }

  const canSend = text.trim().length > 0 && !disabled

  const channelLabel = (() => {
    const extras = Array.from(channels).filter(c => c !== 'chat')
    if (extras.length === 0) return 'Send'
    if (extras.length === 1) return `Send + ${extras[0] === 'sms' ? 'SMS' : 'Email'}`
    return 'Send + SMS + Email'
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Channel toggles + AI button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {(['chat', 'sms', 'email'] as MessageChannel[]).map(ch => {
          const active = channels.has(ch)
          const enabled = channelIsEnabled(ch)
          const fixed = ch === 'chat'

          return (
            <button
              key={ch}
              type="button"
              onClick={() => toggleChannel(ch)}
              disabled={fixed || !enabled || disabled}
              title={
                fixed
                  ? 'Internal transaction chat is always enabled'
                  : !enabled
                    ? `${CHANNEL_LABELS[ch]} is not available for this client`
                    : undefined
              }
              style={{
                fontSize: 11,
                padding: '3px 9px',
                borderRadius: 100,
                cursor: fixed ? 'default' : enabled && !disabled ? 'pointer' : 'not-allowed',
                border: active
                  ? '0.5px solid var(--chat-bubble-mine-border)'
                  : '0.5px solid var(--lp-border)',
                background: active
                  ? 'var(--chat-bubble-mine-bg)'
                  : 'transparent',
                color: active ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
                transition: 'all 0.12s',
                fontFamily: 'inherit',
                opacity: enabled ? 1 : 0.4
              }}
            >
              {CHANNEL_LABELS[ch]}
            </button>
          )
        })}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={onAISuggest}
          disabled={aiLoading || disabled || !aiEnabled}
          title={!aiEnabled ? 'AI suggestion is not enabled for this environment' : undefined}
          style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 100,
            cursor: aiLoading || disabled || !aiEnabled ? 'not-allowed' : 'pointer',
            border: '0.5px solid var(--sem-amber)',
            background: 'var(--sem-amber-bg)',
            color: 'var(--sem-amber)',
            opacity: aiLoading || !aiEnabled ? 0.5 : 1,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'opacity 0.15s'
          }}
        >
          {aiLoading ? (
            <>
              <span style={SPINNER_STYLE} aria-hidden="true" />
              Thinking…
            </>
          ) : (
            <>✦ AI suggest</>
          )}
        </button>
      </div>

      {/* Textarea + send button */}
      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'var(--chat-input-bg)',
            border: '0.5px solid var(--lp-border)',
            borderRadius: 8,
            color: 'var(--lp-text)',
            fontSize: 12.5,
            padding: '8px 10px',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.55,
            transition: 'border-color 0.15s',
            opacity: disabled ? 0.4 : 1
          }}
          onFocus={e => {
            e.target.style.borderColor = 'var(--chat-input-border-focus)'
          }}
          onBlur={e => {
            e.target.style.borderColor = 'var(--lp-border)'
          }}
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: canSend ? 'var(--lp-accent)' : 'var(--lp-surface-2)',
            border: 'none',
            color: canSend ? '#fff' : 'var(--lp-text-muted)',
            fontSize: 12.5,
            fontWeight: 500,
            cursor: canSend ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
            fontFamily: 'inherit'
          }}
        >
          {channelLabel} →
        </button>
      </div>

      <style>{`
        @keyframes lp-chatinput-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}