// PATH: src/components/workspace-chat/WorkspaceChatPanel.tsx

import { useRef, useState, useEffect, useMemo, useCallback, type KeyboardEvent } from 'react'
import { useWorkspaceChat }   from '../../hooks/useWorkspaceChat'
import WorkspaceChatMessage   from './WorkspaceChatMessage'
import ContextRefPicker       from './ContextRefPicker'
import MentionPicker, { getMentionQuery, insertMention } from './MentionPicker'
import { validateFile, uploadDocument } from '../../services/upload.service'
import { getClients } from '../../services/invoice.service'
import type { Client } from '../../types/database.types'
import type { WorkspaceConversation, WorkspaceInboxResponse, ContextRef } from '../../services/workspace-chat.service'
import { formatDateShort } from '../../lib/dates'

interface Props {
  orgId:     string
  clientId?: string
  firmName?: string
  compact?:  boolean
  searchQuery?: string
  onActiveConversationChange?: (convId: string | null, clientId: string | null) => void
  focusClientId?: string | null
  /** Stacked inbox→conversation layout for the floating bubble */
  bubbleMode?: boolean
}

export default function WorkspaceChatPanel({
  orgId, clientId, firmName, compact = false, searchQuery = '',
  onActiveConversationChange, focusClientId, bubbleMode = false
}: Props) {
  const chat = useWorkspaceChat(orgId, clientId, true)

  const [draft,          setDraft]          = useState('')
  const [internalOnly,   setInternalOnly]   = useState(false)
  const [contextRef,     setContextRef]     = useState<ContextRef | null>(null)
  const [pickerOpen,     setPickerOpen]     = useState(false)
  const [mentionQuery,   setMentionQuery]   = useState<string | null>(null)
  const [pendingFile,    setPendingFile]    = useState<{ name: string; documentId: string } | null>(null)
  const [uploading,      setUploading]      = useState(false)
  const [uploadError,    setUploadError]    = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  // ── New-conversation inline picker state ──────────────────────────────────
  const [newConvMode,      setNewConvMode]      = useState(false)
  const [newConvClient,    setNewConvClient]    = useState<{ id: string; name: string } | null>(null)
  const [clientList,       setClientList]       = useState<Client[]>([])
  const [clientsLoading,   setClientsLoading]   = useState(false)
  const [clientSearch,     setClientSearch]     = useState('')

  const composerRef          = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef         = useRef<HTMLInputElement | null>(null)
  const messagesEndRef       = useRef<HTMLDivElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const clientSearchRef      = useRef<HTMLInputElement | null>(null)
  // Counts nested dragenter/dragleave pairs across the drop zone's children —
  // a plain boolean flickers the overlay on/off as the pointer crosses child
  // element boundaries during a drag.
  const dragCounterRef       = useRef(0)

  const viewerRole = chat.inbox?.role ?? 'bookkeeper'
  const isPyme     = viewerRole === 'client'

  // ── Load clients when entering new-conv mode ──────────────────────────────
  const enterNewConvMode = useCallback(async () => {
    setNewConvMode(true)
    setNewConvClient(null)
    setClientSearch('')
    setClientsLoading(true)
    try {
      const list = await getClients(orgId)
      setClientList(list)
    } catch {
      setClientList([])
    } finally {
      setClientsLoading(false)
      requestAnimationFrame(() => clientSearchRef.current?.focus())
    }
  }, [orgId])

  const exitNewConvMode = useCallback(() => {
    setNewConvMode(false)
    setNewConvClient(null)
    setClientSearch('')
    setClientList([])
  }, [])

  // When a client is chosen from the picker
  const handleClientPick = useCallback((client: Client) => {
    const name = client.display_name ?? client.company_name ?? '(unnamed)'
    // If there's already a conversation with this client, open it directly
    const existingConv = chat.inbox?.conversations.find(c => c.client_id === client.id)
    if (existingConv) {
      chat.openConversation(existingConv)
      exitNewConvMode()
      return
    }
    // Otherwise prepare a brand-new conversation. NOTE: this closes the
    // picker UI directly (newConvMode/clientSearch/clientList) rather than
    // calling exitNewConvMode() — that helper also clears newConvClient,
    // which would immediately erase the client we just picked in the same
    // batched update (real bug: picking a client with no prior conversation
    // silently dropped back to the empty inbox instead of opening a
    // composer for them).
    setNewConvClient({ id: client.id, name })
    chat.startNewConversation(client.id)
    setNewConvMode(false)
    setClientSearch('')
    setClientList([])
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [chat])

  // Filtered client list
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clientList
    return clientList.filter(c =>
      (c.display_name ?? '').toLowerCase().includes(q) ||
      (c.company_name ?? '').toLowerCase().includes(q)
    )
  }, [clientList, clientSearch])

  // ── Filtered inbox ────────────────────────────────────────────────────────
  const filteredInbox = useMemo(() => {
    if (!chat.inbox || !searchQuery.trim()) return chat.inbox
    const q = searchQuery.trim().toLowerCase()
    return {
      ...chat.inbox,
      conversations: chat.inbox.conversations.filter(c => {
        const name    = (c.client_name ?? '').toLowerCase()
        const preview = (c.last_message_preview ?? '').toLowerCase()
        return name.includes(q) || preview.includes(q)
      })
    }
  }, [chat.inbox, searchQuery])

  // ── Auto-open: pyme / compact single-client ───────────────────────────────
  useEffect(() => {
    const onlyConv = chat.inbox?.conversations.length === 1 ? chat.inbox.conversations[0] : undefined
    const shouldAutoOpen = (isPyme || (compact && !!clientId)) &&
      !chat.activeConvId && onlyConv && !chat.inboxLoading
    if (shouldAutoOpen) chat.openConversation(onlyConv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPyme, compact, clientId, chat.inbox, chat.inboxLoading])

  // ── Auto-open focusClientId conversation ──────────────────────────────────
  useEffect(() => {
    if (!focusClientId || !chat.inbox || chat.inboxLoading || chat.activeConvId) return
    const conv = chat.inbox.conversations.find(c => c.client_id === focusClientId)
    if (conv) chat.openConversation(conv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusClientId, chat.inbox, chat.inboxLoading])

  // ── Bubble up active conversation ─────────────────────────────────────────
  const activeConv: WorkspaceConversation | undefined =
    chat.inbox?.conversations.find(c => c.id === chat.activeConvId)

  useEffect(() => {
    if (!onActiveConversationChange) return
    onActiveConversationChange(chat.activeConvId, activeConv?.client_id ?? null)
  }, [chat.activeConvId, activeConv?.client_id, onActiveConversationChange])

  // Clear newConvClient once the conversation appears in the inbox
  useEffect(() => {
    if (newConvClient && chat.activeConvId && activeConv) {
      setNewConvClient(null)
    }
  }, [newConvClient, chat.activeConvId, activeConv])

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [chat.activeConvId])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container || chat.messages.length === 0) return
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120
    if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages.length])

  // ── Composer helpers ──────────────────────────────────────────────────────
  const pickerClientId = clientId
    ?? chat.inbox?.conversations.find(c => c.id === chat.activeConvId)?.client_id
    ?? newConvClient?.id
    ?? null

  function onDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val    = e.target.value
    const cursor = e.target.selectionStart ?? val.length
    setDraft(val)
    if (!isPyme) {
      const q = getMentionQuery(val, cursor)
      setMentionQuery(q)
    }
  }

  function handleMentionSelect(name: string) {
    const cursor  = composerRef.current?.selectionStart ?? draft.length
    const { text, cursor: newCursor } = insertMention(draft, cursor, name)
    setDraft(text)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      if (composerRef.current) {
        composerRef.current.selectionStart = newCursor
        composerRef.current.selectionEnd   = newCursor
        composerRef.current.focus()
      }
    })
  }

  // Shared by the 📎 attach button (file input change) and drag-and-drop —
  // both hand this a raw File and get the same validate → upload → stage
  // flow, so the message that goes out is identical either way.
  async function processFile(file: File) {
    const v = validateFile(file)
    if (!v.ok) { setUploadError(v.reason); return }

    // For a brand-new conversation (picked a client but haven't sent the
    // first message yet), the conversation row doesn't exist server-side
    // yet, so it's absent from chat.inbox.conversations and the lookup
    // below resolves to undefined — the upload would then fall back to a
    // clientless "org" storage path, which the storage bucket's own RLS
    // policy can't validate (real bug: "invalid input syntax for type
    // uuid: 'org'" whenever a file was attached before the first message
    // in a new conversation). newConvClient.id is the fix — it's known the
    // moment a client is picked, before the conversation exists anywhere.
    const targetClientId = clientId
      ?? chat.inbox?.conversations.find(c => c.id === chat.activeConvId)?.client_id
      ?? newConvClient?.id

    setUploading(true)
    setUploadError(null)
    setUploadProgress(0)
    try {
      const result = await uploadDocument({
        file, orgId,
        ...(targetClientId ? { clientId: targetClientId } : {}),
        documentKind: 'attachment',
        onProgress: pct => setUploadProgress(Math.round(pct * 100))
      })
      setPendingFile({ name: file.name, documentId: result.documentId })
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await processFile(file)
  }

  // ── Drag-and-drop: drop a file anywhere on the open conversation to attach
  // it, same as clicking 📎 — the fast path for "client needs to send a
  // document right now" without opening a separate upload flow. Only active
  // once a conversation (or a pending new one) is open, matching the
  // composer's own hasTarget gate below.
  function handleDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragCounterRef.current += 1
    setIsDraggingOver(true)
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setIsDraggingOver(false)
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDraggingOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || uploading) return
    await processFile(file)
  }

  async function handleSend() {
    const body = draft.trim()
    if ((!body && !contextRef && !pendingFile) || chat.sending) return

    const savedDraft    = draft
    const savedRef      = contextRef
    const savedFile     = pendingFile
    const wasInternal   = internalOnly

    setDraft('')
    setMentionQuery(null)
    setContextRef(null)
    setPendingFile(null)
    setPickerOpen(false)

    const ok = await chat.send(body, {
      clientVisible: !wasInternal,
      ...(savedRef  !== null ? { contextRef: savedRef }             : {}),
      ...(savedFile !== null ? { documentId: savedFile.documentId } : {}),
    })

    if (!ok) {
      setDraft(savedDraft)
      setContextRef(savedRef)
      setPendingFile(savedFile)
      setInternalOnly(wasInternal)
      return
    }

    setInternalOnly(false)
    composerRef.current?.focus()
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null) {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return }
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // Composer is available when there's an active conv OR a pending new-conv client
  const hasTarget = !!chat.activeConvId || !!newConvClient
  const canSend   = draft.trim().length > 0 || !!contextRef || !!pendingFile

  // ── Shared sub-elements ───────────────────────────────────────────────────

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.pdf"
      style={{ display: 'none' }}
      onChange={handleFileChange}
    />
  )

  const messagesArea = (
    <div
      ref={messagesContainerRef}
      style={{
        flex: 1, overflowY: 'auto', padding: '14px 16px',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {!hasTarget ? (
        <EmptyConversation isPyme={isPyme} />
      ) : !chat.activeConvId && newConvClient ? (
        // New conversation: no messages yet
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, opacity: 0.4 }}>✉️</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
            New conversation with {newConvClient.name}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
            Write your first message below and press Send.
          </div>
        </div>
      ) : chat.messagesLoading && chat.messages.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--lp-text-muted)', fontSize: 12, fontStyle: 'italic'
        }}>
          Loading messages…
        </div>
      ) : (
        <>
          {chat.hasMoreMessages && (
            <button
              onClick={chat.loadOlder}
              disabled={chat.messagesLoading}
              style={{
                alignSelf: 'center', marginBottom: 12,
                padding: '5px 14px', borderRadius: 100,
                background: 'var(--chat-attachment-bg)',
                border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text-muted)', fontSize: 11, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              {chat.messagesLoading ? 'Loading…' : 'Load older messages'}
            </button>
          )}

          {chat.messages.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--lp-text-muted)', fontSize: 12.5, fontStyle: 'italic'
            }}>
              No messages yet — say hello
            </div>
          ) : (
            chat.messages.map((m, i) => {
              const prev = chat.messages[i - 1]
              const showSep = !prev || getDateLabel(m.created_at) !== getDateLabel(prev.created_at)
              return (
                <div key={m.id}>
                  {showSep && <DateSeparator label={getDateLabel(m.created_at)} />}
                  <WorkspaceChatMessage
                    message={m}
                    viewerRole={viewerRole}
                    {...(firmName !== undefined ? { firmName } : {})}
                  />
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  )

  const composerArea = (hasTarget || isPyme || (compact && !!clientId)) ? (
    <div style={{
      borderTop: '0.5px solid var(--lp-border)',
      background: 'var(--lp-surface-2)',
      flexShrink: 0,
      position: 'relative',
    }}>
      {hiddenFileInput}

      {/* Context ref picker */}
      {pickerOpen && pickerClientId && (
        <ContextRefPicker
          orgId={orgId}
          clientId={pickerClientId}
          onSelect={ref => { setContextRef(ref); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Mention picker */}
      {mentionQuery !== null && !isPyme && (
        <MentionPicker
          orgId={orgId}
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => setMentionQuery(null)}
        />
      )}

      {/* Chips row: pending file + context ref */}
      {(pendingFile || uploading || contextRef) && (
        <div style={{ padding: '8px 12px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(pendingFile || uploading) && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', borderRadius: 6,
              background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
              fontSize: 11, color: 'var(--lp-text-muted)', maxWidth: '100%',
            }}>
              <span>📎</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {uploading ? `Uploading… ${uploadProgress}%` : pendingFile?.name}
              </span>
              {!uploading && (
                <button
                  onClick={() => setPendingFile(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 13, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}
                >✕</button>
              )}
            </div>
          )}
          {contextRef && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', borderRadius: 6,
              background: 'var(--lp-surface)', border: '0.5px solid var(--lp-accent)',
              fontSize: 11, color: 'var(--lp-accent)', maxWidth: '100%',
            }}>
              <span>{contextRef.type === 'transaction' ? '💳' : contextRef.type === 'account' ? '📚' : '📅'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {contextRef.label}
              </span>
              <button
                onClick={() => setContextRef(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 13, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}
              >✕</button>
            </div>
          )}
        </div>
      )}

      {/* Textarea */}
      <div style={{ padding: '8px 12px 4px' }}>
        <textarea
          ref={composerRef}
          value={draft}
          onChange={onDraftChange}
          onKeyDown={onComposerKey}
          placeholder={
            isPyme
              ? 'Send a message to your firm…'
              : internalOnly
                ? 'Internal note for the team…'
                : contextRef
                  ? 'Add a message (optional)…'
                  : 'Write a message…'
          }
          rows={2}
          style={{
            width: '100%', resize: 'none', boxSizing: 'border-box',
            padding: '8px 11px', borderRadius: 8,
            background: 'var(--lp-surface)',
            border: '0.5px solid var(--lp-border)',
            color: 'var(--lp-text)', fontSize: 13,
            fontFamily: 'inherit', minHeight: 60, maxHeight: 140,
            outline: 'none', lineHeight: 1.5,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--lp-accent)' }}
          onBlur={e  => { e.currentTarget.style.borderColor = 'var(--lp-border)'  }}
        />
      </div>

      {/* Action bar */}
      <div style={{
        padding: '0 12px 10px',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Attach a file (PDF, image)"
          style={{
            ...toolBtn,
            color: pendingFile ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
            background: pendingFile ? 'rgba(167,139,250,0.1)' : 'transparent',
            border: pendingFile ? '0.5px solid var(--lp-accent)' : '0.5px solid transparent',
            opacity: uploading ? 0.5 : 1,
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          🗂
        </button>

        {!isPyme && pickerClientId && (
          <button
            onClick={() => { setPickerOpen(v => !v); setMentionQuery(null) }}
            title="Link to a transaction, account, or period"
            style={{
              ...toolBtn,
              color: pickerOpen ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
              background: pickerOpen ? 'rgba(167,139,250,0.1)' : 'transparent',
              border: pickerOpen ? '0.5px solid var(--lp-accent)' : '0.5px solid transparent',
            }}
          >
            📎
          </button>
        )}

        {!isPyme && (
          <button
            onClick={() => setInternalOnly(v => !v)}
            title={internalOnly ? 'Switch to client-visible' : 'Switch to internal note'}
            style={{
              ...toolBtn,
              fontSize: 11, padding: '4px 8px', borderRadius: 6,
              color:      internalOnly ? 'var(--chat-sender-label-internal)' : 'var(--lp-text-muted)',
              background: internalOnly ? 'rgba(167,139,250,0.10)' : 'transparent',
              border:     internalOnly ? '0.5px dashed var(--chat-bubble-internal-border)' : '0.5px solid transparent',
              fontWeight: internalOnly ? 600 : 400,
            }}
          >
            {internalOnly ? '🔒 Internal' : '🔒'}
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={handleSend}
          disabled={chat.sending || uploading || !canSend}
          style={{
            padding: '7px 18px', borderRadius: 8,
            background: canSend
              ? 'linear-gradient(135deg, var(--lp-accent), var(--est-converted))'
              : 'var(--lp-border)',
            border: 'none',
            color: canSend ? '#fff' : 'var(--lp-text-muted)',
            fontSize: 12.5, fontWeight: 600,
            cursor: canSend ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
            transition: 'background 0.15s, opacity 0.15s',
            opacity: (chat.sending || uploading) ? 0.6 : 1,
          }}
        >
          {chat.sending ? '…' : 'Send →'}
        </button>
      </div>

      {(chat.error || uploadError) && (
        <div style={{ fontSize: 11, color: 'var(--sem-red)', padding: '0 12px 8px' }}>
          {chat.error || uploadError}
        </div>
      )}
    </div>
  ) : null

  // ── Conversation header label ──────────────────────────────────────────────
  const convHeaderLabel = isPyme
    ? (firmName ?? 'Your firm')
    : newConvClient
      ? `New · ${newConvClient.name}`
      : (activeConv?.client_name ?? 'Select a conversation')

  // ── bubbleMode: stacked (inbox → conversation) ────────────────────────────
  if (bubbleMode && !isPyme) {
    if (!chat.activeConvId && !newConvClient) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <Inbox
            flat
            inbox={filteredInbox}
            loading={chat.inboxLoading}
            activeConvId={chat.activeConvId}
            showArchived={chat.showArchived}
            onSelect={chat.openConversation}
            onToggleArchived={() => chat.setShowArchived(!chat.showArchived)}
            onArchive={chat.archive}
            onRestore={chat.restore}
            onNewConversation={enterNewConvMode}
            newConvMode={newConvMode}
            clientSearch={clientSearch}
            onClientSearchChange={setClientSearch}
            clientSearchRef={clientSearchRef}
            filteredClients={filteredClients}
            clientsLoading={clientsLoading}
            onClientPick={handleClientPick}
            onCancelNew={exitNewConvMode}
          />
        </div>
      )
    }

    return (
      <div
        style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={{
          padding: '8px 14px',
          borderBottom: '0.5px solid var(--lp-border)',
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0, background: 'var(--lp-surface)',
        }}>
          <button
            onClick={() => {
              chat.closeConversation()
              setDraft('')
              setContextRef(null)
              setPendingFile(null)
              setNewConvClient(null)
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--lp-text-muted)', fontSize: 13, padding: '2px 4px',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
              borderRadius: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--lp-text)'; e.currentTarget.style.background = 'var(--lp-surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--lp-text-muted)'; e.currentTarget.style.background = 'none' }}
          >
            ← Back
          </button>
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--lp-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {convHeaderLabel}
          </span>
          {activeConv && (
            <button
              onClick={() => activeConv.is_archived ? chat.restore(activeConv.id) : chat.archive(activeConv.id)}
              style={btnSm}
            >
              {activeConv.is_archived ? 'Restore' : 'Archive'}
            </button>
          )}
        </div>

        {messagesArea}
        {composerArea}
        {isDraggingOver && <DropOverlay />}
      </div>
    )
  }

  // ── Standard mode: grid (inbox sidebar + conversation card) ───────────────
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: compact || isPyme ? '1fr' : '260px 1fr',
      gap: 10,
      height: '100%',
      minHeight: 400,
    }}>
      {/* Inbox column */}
      {!(compact || isPyme) && (
        <Inbox
          inbox={filteredInbox}
          loading={chat.inboxLoading}
          activeConvId={chat.activeConvId}
          showArchived={chat.showArchived}
          onSelect={chat.openConversation}
          onToggleArchived={() => chat.setShowArchived(!chat.showArchived)}
          onArchive={chat.archive}
          onRestore={chat.restore}
          onNewConversation={enterNewConvMode}
          newConvMode={newConvMode}
          clientSearch={clientSearch}
          onClientSearchChange={setClientSearch}
          clientSearchRef={clientSearchRef}
          filteredClients={filteredClients}
          clientsLoading={clientsLoading}
          onClientPick={handleClientPick}
          onCancelNew={exitNewConvMode}
        />
      )}

      {/* Conversation card */}
      <div
        style={{
          display: 'flex', flexDirection: 'column',
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border)',
          borderRadius: 12,
          overflow: 'hidden',
          minHeight: 0,
          position: 'relative',
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div style={{
          padding: '11px 16px',
          borderBottom: '0.5px solid var(--lp-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: 'var(--lp-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {convHeaderLabel}
            </div>
            {activeConv?.is_archived && (
              <div style={{ fontSize: 10.5, color: 'var(--chat-sender-label-internal)', marginTop: 2 }}>
                Archived · sending will restore it
              </div>
            )}
          </div>
          {activeConv && !isPyme && (
            <button
              onClick={() => activeConv.is_archived ? chat.restore(activeConv.id) : chat.archive(activeConv.id)}
              style={btnSm}
            >
              {activeConv.is_archived ? 'Restore' : 'Archive'}
            </button>
          )}
        </div>

        {messagesArea}
        {composerArea}
        {isDraggingOver && <DropOverlay />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DROP OVERLAY — shown while dragging a file over an open conversation
// ─────────────────────────────────────────────────────────────────────────────

function DropOverlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--lp-overlay-backdrop)',
      backdropFilter: 'blur(1px)',
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: '20px 28px', borderRadius: 12,
        background: 'var(--lp-surface)',
        border: '1.5px dashed var(--lp-accent)',
      }}>
        <span style={{ fontSize: 26 }}>📄</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
          Drop to send
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INBOX
// ─────────────────────────────────────────────────────────────────────────────

function Inbox({
  inbox, loading, activeConvId, showArchived,
  onSelect, onToggleArchived, onArchive, onRestore,
  flat = false,
  onNewConversation, newConvMode,
  clientSearch, onClientSearchChange, clientSearchRef,
  filteredClients, clientsLoading, onClientPick, onCancelNew,
}: {
  inbox:            WorkspaceInboxResponse | null
  loading:          boolean
  activeConvId:     string | null
  showArchived:     boolean
  onSelect:         (c: WorkspaceConversation) => void
  onToggleArchived: () => void
  onArchive:        (id: string) => Promise<void>
  onRestore:        (id: string) => Promise<void>
  flat?:            boolean
  onNewConversation: () => void
  newConvMode:      boolean
  clientSearch:     string
  onClientSearchChange: (q: string) => void
  clientSearchRef:  React.MutableRefObject<HTMLInputElement | null>
  filteredClients:  import('../../types/database.types').Client[]
  clientsLoading:   boolean
  onClientPick:     (c: import('../../types/database.types').Client) => void
  onCancelNew:      () => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      ...(flat ? { flex: 1 } : {
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        borderRadius: 12,
      }),
      overflow: 'hidden',
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '0.5px solid var(--lp-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
        ...(flat ? { background: 'var(--lp-surface)' } : {}),
      }}>
        <div style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
        }}>
          {newConvMode ? '🔍 New conversation' : showArchived ? '🗂 Archived' : '💬 Inbox'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!newConvMode && (
            <button
              onClick={onToggleArchived}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5, color: 'var(--lp-accent)', fontFamily: 'inherit' }}
            >
              {showArchived ? 'Active →' : 'Archived →'}
            </button>
          )}
          {newConvMode ? (
            <button
              onClick={onCancelNew}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5, color: 'var(--lp-text-muted)', fontFamily: 'inherit' }}
            >
              ✕ Cancel
            </button>
          ) : (
            <button
              onClick={onNewConversation}
              title="Start a new conversation"
              style={{
                background: 'var(--lp-accent)', border: 'none', borderRadius: 5,
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', padding: '1px 7px', lineHeight: 1.6,
                fontFamily: 'inherit',
              }}
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* New conversation: inline client picker */}
      {newConvMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Search input */}
          <div style={{ padding: '8px 10px', borderBottom: '0.5px solid var(--lp-border)', flexShrink: 0 }}>
            <input
              ref={clientSearchRef}
              type="text"
              value={clientSearch}
              onChange={e => onClientSearchChange(e.target.value)}
              placeholder="Search clients…"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 10px', borderRadius: 7,
                background: 'var(--lp-surface)',
                border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text)', fontSize: 12.5,
                fontFamily: 'inherit', outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--lp-accent)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--lp-border)'  }}
            />
          </div>

          {/* Client list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {clientsLoading ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 11.5, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
                Loading clients…
              </div>
            ) : filteredClients.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                {clientSearch ? 'No clients match your search' : 'No clients found'}
              </div>
            ) : (
              filteredClients.map((c, i) => {
                const name = c.display_name ?? c.company_name ?? '(unnamed)'
                return (
                  <button
                    key={c.id}
                    onClick={() => onClientPick(c)}
                    style={{
                      width: '100%', display: 'block', textAlign: 'left',
                      padding: '10px 14px',
                      border: 'none',
                      borderTop: i > 0 ? '0.5px solid var(--chat-row-divider)' : 'none',
                      background: 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-row-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: 'var(--lp-surface-2)',
                        border: '0.5px solid var(--lp-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color: 'var(--lp-text-muted)',
                        flexShrink: 0,
                      }}>
                        {getInitials(name)}
                      </div>
                      <span style={{ fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 500 }}>
                        {name}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : (
        /* Normal conversation list */
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
              Loading…
            </div>
          ) : (inbox?.conversations ?? []).length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
              {showArchived ? 'No archived conversations' : 'No conversations yet — click + to start one'}
            </div>
          ) : (
            ((inbox?.conversations ?? []) as WorkspaceConversation[]).map((c, i) => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                style={{
                  width: '100%', display: 'block', textAlign: 'left',
                  padding: '10px 14px',
                  border: 'none',
                  borderTop: i > 0 ? '0.5px solid var(--chat-row-divider)' : 'none',
                  borderLeft: activeConvId === c.id ? '3px solid var(--lp-accent)' : '3px solid transparent',
                  background: activeConvId === c.id ? 'var(--chat-bubble-mine-bg)' : 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (activeConvId !== c.id) e.currentTarget.style.background = 'var(--chat-row-hover)' }}
                onMouseLeave={e => { if (activeConvId !== c.id) e.currentTarget.style.background = 'transparent' }}
              >
                {/* Name + unread badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{
                    fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                  }}>
                    {c.client_name}
                  </span>
                  {c.my_unread_count > 0 && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 100,
                      background: 'var(--sem-red)', color: '#fff', fontWeight: 700, flexShrink: 0, marginLeft: 6,
                    }}>
                      {c.my_unread_count}
                    </span>
                  )}
                </div>

                {/* Preview */}
                {c.last_message_preview && (
                  <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.last_message_sender_role !== 'client'
                      ? <span>You: {c.last_message_preview}</span>
                      : c.last_message_preview}
                  </div>
                )}

                {/* Time + archived badge */}
                <div style={{ fontSize: 9.5, color: 'var(--lp-text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{c.last_message_at ? formatRel(c.last_message_at) : 'No messages'}</span>
                  {c.is_archived && <span style={{ color: 'var(--chat-sender-label-internal)' }}>Archived</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyConversation({ isPyme }: { isPyme: boolean }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 24,
    }}>
      <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.5 }}>💬</div>
      <div style={{ fontSize: 13, color: 'var(--lp-text)', fontWeight: 500, marginBottom: 4 }}>
        {isPyme ? 'No conversation yet' : 'Select a conversation'}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
        {isPyme
          ? 'Your firm has not started a chat with you yet.'
          : 'Pick a client from the inbox or click + to start one.'}
      </div>
    </div>
  )
}

// ── Date separator ────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0 6px', userSelect: 'none',
    }}>
      <div style={{ flex: 1, height: '0.5px', background: 'var(--lp-border)' }} />
      <span style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '0.5px', background: 'var(--lp-border)' }} />
    </div>
  )
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

function getDateLabel(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  if (min < 1)  return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return formatDateShort(iso, { withYear: false })
}

// ── Shared button styles ──────────────────────────────────────────────────────

const btnSm: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6,
  background: 'var(--chat-attachment-bg)',
  border: '0.5px solid var(--lp-border)',
  color: 'var(--lp-text-muted)', fontSize: 11, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const toolBtn: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 6,
  fontSize: 15, lineHeight: 1,
  fontFamily: 'inherit', cursor: 'pointer',
  transition: 'background 0.12s, color 0.12s',
  flexShrink: 0,
}
