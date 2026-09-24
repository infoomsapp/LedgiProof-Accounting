// PATH: src/components/workspace-chat/WorkspaceChatActions.tsx
//
// P2 — Chat dinámico: action bar above the inbox/conversation list.
//
// Why this component exists:
//   AL's request: "chat más dinámico con barra de mensajería con botones
//   funcionales visibles aunque no haya clientes añadidos."
//
//   The empty state used to just say "No active conversations" with no CTAs.
//   This bar gives users somewhere to GO: start a new chat, search, attach
//   a file. The CTAs are visible 100% of the time — even with zero data.
//
// Layout modes:
//   · 'compact' — icon-only, for WorkspaceInboxWidget in dashboard sidebar
//   · 'full'    — icon + label, for Messages.tsx full-screen page
//
// Single Responsibility:
//   This component ONLY dispatches actions (opens dialogs, toggles filters).
//   It does NOT fetch data, compute state, or render messages. Conversation
//   lifecycle lives in useWorkspaceChat hook.

import { useState } from 'react'
import NewConversationDialog from './NewConversationDialog'
import Icon, { type IconName } from '../ui/Icon'

interface Props {
  orgId:           string
  /** 'compact' = icons only (sidebar widget) · 'full' = icons + labels (page) */
  layout?:         'compact' | 'full'
  /** Toggle "show archived" — receives the new value */
  showArchived?:   boolean
  onToggleArchived?: () => void
  /** Search query for inbox filtering (client-side) */
  searchQuery?:    string
  onSearchChange?: (q: string) => void
  /** Called when a new conversation is created — used to refresh inbox / auto-open */
  onConversationCreated?: (conversationId: string) => void
  /** Optional: dispatched when user clicks "Send file" (handled by parent because
   *  the file-upload modal depends on active conversation context). */
  onSendFile?:     () => void
}

export default function WorkspaceChatActions({
  orgId,
  layout            = 'full',
  showArchived      = false,
  onToggleArchived,
  searchQuery       = '',
  onSearchChange,
  onConversationCreated,
  onSendFile
}: Props) {
  const [newConvOpen, setNewConvOpen] = useState(false)
  const isCompact = layout === 'compact'

  return (
    <>
      <div style={{
        display:        'flex',
        flexDirection:  isCompact ? 'column' : 'row',
        alignItems:     isCompact ? 'stretch' : 'center',
        gap:            isCompact ? 6 : 8,
        padding:        isCompact ? '8px 10px' : '10px 12px',
        borderBottom:   '0.5px solid var(--lp-border)',
        background:     'var(--lp-surface-2)'
      }}>

        {/* Search input — first on full layout, hidden on compact */}
        {!isCompact && onSearchChange && (
          <div style={{ flex: 1, minWidth: 140 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search conversations…"
              className="lp-input"
              style={{ width: '100%', fontSize: 12.5 }}
            />
          </div>
        )}

        {/* Action buttons row — wrapped in flex for compact, inline for full */}
        <div style={{
          display: 'flex',
          gap:     isCompact ? 4 : 6,
          justifyContent: isCompact ? 'space-around' : 'flex-end'
        }}>

          {/* + New conversation — primary CTA, ALWAYS visible */}
          <ActionButton
            icon="plus"
            label="New chat"
            tooltip="Start a new conversation with a client"
            compact={isCompact}
            variant="primary"
            onClick={() => setNewConvOpen(true)}
          />

          {/* 📎 Send file — optional, depends on parent context */}
          {onSendFile && (
            <ActionButton
              icon="attachment"
              label="Send file"
              tooltip="Attach a document to the active conversation"
              compact={isCompact}
              onClick={onSendFile}
            />
          )}

          {/* 🔍 Search toggle — only on compact (full layout has inline search) */}
          {isCompact && onSearchChange && (
            <ActionButton
              icon="search"
              label="Search"
              tooltip="Search conversations"
              compact={isCompact}
              onClick={() => {
                const q = window.prompt('Search conversations…', searchQuery)
                if (q !== null) onSearchChange(q)
              }}
              active={searchQuery.length > 0}
            />
          )}

          {/* 🗄 Archived toggle */}
          {onToggleArchived && (
            <ActionButton
              icon={showArchived ? 'inbox' : 'archive'}
              label={showArchived ? 'Active' : 'Archived'}
              tooltip={showArchived ? 'Show active conversations' : 'Show archived conversations'}
              compact={isCompact}
              onClick={onToggleArchived}
              active={showArchived}
            />
          )}
        </div>
      </div>

      {/* New conversation modal */}
      <NewConversationDialog
        open={newConvOpen}
        onClose={() => setNewConvOpen(false)}
        orgId={orgId}
        onCreated={(convId) => {
          setNewConvOpen(false)
          onConversationCreated?.(convId)
        }}
      />
    </>
  )
}

// ── Action button helper ──────────────────────────────────────────────────────

function ActionButton({
  icon, label, tooltip, compact, variant, active, onClick
}: {
  icon:      IconName
  label:     string
  tooltip:   string
  compact:   boolean
  variant?:  'primary' | 'default'
  active?:   boolean
  onClick:   () => void
}) {
  const isPrimary = variant === 'primary'

  return (
    <button
      onClick={onClick}
      title={tooltip}
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           5,
        padding:       compact ? '5px 7px' : '6px 10px',
        background:    active
          ? 'var(--lp-violet-bg)'
          : isPrimary
            ? 'var(--lp-accent)'
            : 'var(--lp-surface)',
        border:        active
          ? '0.5px solid var(--lp-violet-border)'
          : isPrimary
            ? '0.5px solid var(--lp-accent)'
            : '0.5px solid var(--lp-border)',
        borderRadius:  6,
        color:         active
          ? 'var(--lp-violet)'
          : isPrimary
            ? '#fff'
            : 'var(--lp-text)',
        fontSize:      compact ? 11 : 12,
        fontWeight:    isPrimary ? 600 : 500,
        fontFamily:    'inherit',
        cursor:        'pointer',
        transition:    'background 0.12s, opacity 0.12s',
        whiteSpace:    'nowrap'
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      <Icon name={icon} size={compact ? 12 : 13} />
      {!compact && <span>{label}</span>}
    </button>
  )
}