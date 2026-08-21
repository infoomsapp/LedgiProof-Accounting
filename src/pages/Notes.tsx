// PATH: src/pages/Notes.tsx
//
// Firm-wide Notes/Tasks page — Nota Contable across every client, not just
// whichever one's chat happens to be open. The object and its approval/
// reminder plumbing were already built in Fase 2 (workspace_notes table +
// the workspace-note-reminders pg_cron job); this page is a pure read/UI
// addition on top of that — no migration needed. RLS's staff branch has no
// client_id restriction, so listAllWorkspaceNotesForOrg already returns
// every client's notes for the org, no new RPC required.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScope } from '../hooks/useScope'
import { useAuthStore } from '../store/auth.store'
import { useUserRole } from '../hooks/useUserRole'
import { useChatBubbleStore } from '../store/chat-bubble.store'
import {
  listAllWorkspaceNotesForOrg, createWorkspaceNote, approveWorkspaceNote, completeWorkspaceNote,
  getWorkspaceNoteStatus, NOTE_STATUS_STYLE, type WorkspaceNoteWithClient, type WorkspaceNoteStatus
} from '../services/workspace-notes.service'
import { getClients } from '../services/invoice.service'
import ContextRefPicker from '../components/workspace-chat/ContextRefPicker'
import type { ContextRef } from '../services/workspace-chat.service'
import type { Client } from '../types/database.types'
import Modal from '../components/ui/modal'
import { formatDate } from '../lib/dates'

type FilterTab = 'all' | WorkspaceNoteStatus

const FILTERS: { key: FilterTab; label: string }[] = [
  { key: 'all',              label: 'All' },
  { key: 'open',             label: 'Open' },
  { key: 'pending_approval', label: 'Pending approval' },
  { key: 'approved',         label: 'Approved' },
  { key: 'done',             label: 'Done' },
]

function clientName(c: { display_name: string | null; company_name: string | null } | null): string {
  return c?.display_name ?? c?.company_name ?? '(unnamed client)'
}

export default function Notes() {
  const scope = useScope()
  const orgId = scope.orgId
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const { workspaceRole } = useUserRole()
  const openChat = useChatBubbleStore(s => s.openChat)
  const userId = profile?.id ?? ''
  // Mirrors approve_workspace_note's own authorization check exactly
  // (owner/admin/accountant, any firm type) — same gate as WorkspaceNotesTab.
  const canApproveNotes = workspaceRole === 'owner' || workspaceRole === 'admin' || workspaceRole === 'accountant'

  const [notes,  setNotes]  = useState<WorkspaceNoteWithClient[] | null>(null)
  const [error,  setError]  = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orgId) return
    try {
      const rows = await listAllWorkspaceNotesForOrg(orgId)
      setNotes(rows)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load notes')
    }
  }, [orgId])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    if (!notes) return null
    if (filter === 'all') return notes
    return notes.filter(n => getWorkspaceNoteStatus(n) === filter)
  }, [notes, filter])

  async function handleApprove(noteId: string) {
    setBusyId(noteId)
    setError(null)
    try {
      await approveWorkspaceNote(noteId)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Could not approve note')
    } finally {
      setBusyId(null)
    }
  }

  async function handleComplete(noteId: string) {
    setBusyId(noteId)
    setError(null)
    try {
      await completeWorkspaceNote(noteId)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Could not complete note')
    } finally {
      setBusyId(null)
    }
  }

  // ── New note modal ──────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [clientList,     setClientList]     = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientSearch,   setClientSearch]   = useState('')
  const [pickedClient,   setPickedClient]   = useState<Client | null>(null)
  const [body,             setBody]             = useState('')
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [dueAt,            setDueAt]            = useState('')
  const [contextRef,       setContextRef]       = useState<ContextRef | null>(null)
  const [pickerOpen,       setPickerOpen]       = useState(false)
  const [saving,           setSaving]           = useState(false)

  function openModal() {
    setModalOpen(true)
    setPickedClient(null)
    setClientSearch('')
    setBody('')
    setRequiresApproval(false)
    setDueAt('')
    setContextRef(null)
    setClientsLoading(true)
    getClients(orgId).then(setClientList).catch(() => setClientList([])).finally(() => setClientsLoading(false))
  }

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clientList
    return clientList.filter(c =>
      (c.display_name ?? '').toLowerCase().includes(q) ||
      (c.company_name ?? '').toLowerCase().includes(q)
    )
  }, [clientList, clientSearch])

  async function handleCreate() {
    if (!pickedClient || !body.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createWorkspaceNote({
        orgId, clientId: pickedClient.id, body: body.trim(),
        requiresApproval,
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        ...(contextRef ? { contextRef } : {}),
      })
      setModalOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Could not create note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: '20px 32px', borderBottom: '0.5px solid var(--lp-border)', background: 'var(--lp-surface)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <h1 className="lp-page-title" style={{ margin: 0 }}>Notes</h1>
          <p className="lp-page-sub" style={{ margin: '4px 0 0 0' }}>
            Accounting notes and reminders across every client.
          </p>
        </div>
        <button
          onClick={openModal}
          style={{
            padding: '7px 14px', borderRadius: 8, background: 'var(--lp-accent)',
            border: '0.5px solid var(--lp-accent)', color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          + New note
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 32px', maxWidth: 1100, width: '100%', boxSizing: 'border-box' }}>
        {error && (
          <div className="lp-banner error" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 12.5 }}>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, cursor: 'pointer', background: 'none', border: '0.5px solid var(--lp-border)', color: 'var(--lp-text-muted)', fontFamily: 'inherit', marginLeft: 'auto' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 12px', borderRadius: 100, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                fontWeight: filter === f.key ? 600 : 400,
                color: filter === f.key ? '#fff' : 'var(--lp-text-muted)',
                background: filter === f.key ? 'var(--lp-accent)' : 'var(--lp-surface-2)',
                border: `0.5px solid ${filter === f.key ? 'var(--lp-accent)' : 'var(--lp-border)'}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered === null ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--lp-text-muted)', fontSize: 13 }}>
            Loading notes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="lp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
              {filter === 'all' ? 'No notes yet' : 'Nothing in this filter'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
              {filter === 'all' ? 'Create a note from here, or from any client’s chat.' : 'Try a different filter.'}
            </div>
          </div>
        ) : (
          <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
            {filtered.map((n, i) => {
              const status = getWorkspaceNoteStatus(n)
              const style  = NOTE_STATUS_STYLE[status]
              const canApproveThis = status === 'pending_approval' && canApproveNotes && n.created_by !== userId
              const canComplete    = status === 'open' && !n.requires_approval
              return (
                <div
                  key={n.id}
                  style={{ padding: '14px 16px', borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => navigate(`/clients/${n.client_id}`)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            fontSize: 12.5, fontWeight: 600, color: 'var(--lp-accent)', fontFamily: 'inherit',
                          }}
                        >
                          {clientName(n.clients)}
                        </button>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20,
                          fontSize: 10.5, fontWeight: 500, color: style.color, background: style.bg,
                          border: `0.5px solid ${style.border}`,
                        }}>
                          {style.label}
                        </span>
                        {n.due_at && (
                          <span style={{ fontSize: 10.5, color: 'var(--lp-text-muted)' }}>
                            ⏰ {formatDate(n.due_at)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--lp-text)', lineHeight: 1.4 }}>
                        {n.body}
                      </div>
                      {n.context_ref && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10.5, color: 'var(--lp-accent)' }}>
                          <span>{n.context_ref.type === 'transaction' ? '💳' : n.context_ref.type === 'account' ? '📚' : '📅'}</span>
                          {n.context_ref.label}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <button
                        onClick={() => openChat(n.client_id, 'notes')}
                        title="Open in chat"
                        style={{
                          background: 'none', border: '0.5px solid var(--lp-border)', borderRadius: 6,
                          padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--lp-text-muted)', fontFamily: 'inherit',
                        }}
                      >
                        💬
                      </button>
                      {canApproveThis && (
                        <button
                          onClick={() => void handleApprove(n.id)}
                          disabled={busyId === n.id}
                          style={{
                            fontSize: 11, padding: '4px 10px', borderRadius: 6,
                            background: 'var(--sem-green-bg)', border: '0.5px solid var(--sem-green-border)',
                            color: 'var(--sem-green)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap',
                          }}
                        >
                          {busyId === n.id ? '…' : 'Approve'}
                        </button>
                      )}
                      {canComplete && (
                        <button
                          onClick={() => void handleComplete(n.id)}
                          disabled={busyId === n.id}
                          style={{
                            fontSize: 11, padding: '4px 10px', borderRadius: 6,
                            background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)',
                            color: 'var(--lp-text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap',
                          }}
                        >
                          {busyId === n.id ? '…' : 'Mark done'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New note modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New note" width={480}>
        {!pickedClient ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              placeholder="Search clients…"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8,
                background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '0.5px solid var(--lp-border)', borderRadius: 8 }}>
              {clientsLoading ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--lp-text-muted)' }}>Loading…</div>
              ) : filteredClients.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--lp-text-muted)' }}>No clients found</div>
              ) : (
                filteredClients.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => setPickedClient(c)}
                    style={{
                      width: '100%', display: 'block', textAlign: 'left', padding: '9px 12px',
                      border: 'none', borderTop: i > 0 ? '0.5px solid var(--lp-border)' : 'none',
                      background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--lp-text)',
                    }}
                  >
                    {clientName(c)}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--lp-text-muted)' }}>
              For <strong style={{ color: 'var(--lp-text)' }}>{clientName(pickedClient)}</strong>
              <button
                onClick={() => setPickedClient(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-accent)', fontSize: 11.5, fontFamily: 'inherit' }}
              >
                Change
              </button>
            </div>

            {pickerOpen && (
              <ContextRefPicker
                orgId={orgId}
                clientId={pickedClient.id}
                onSelect={ref => { setContextRef(ref); setPickerOpen(false) }}
                onClose={() => setPickerOpen(false)}
              />
            )}

            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Note body…"
              rows={3}
              style={{
                width: '100%', resize: 'none', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8,
                background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)', color: 'var(--lp-text)',
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--lp-text-muted)' }}>
              <input type="checkbox" checked={requiresApproval} onChange={e => setRequiresApproval(e.target.checked)} />
              Requires a second person's approval
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--lp-text-muted)' }}>
              Reminder
              <input
                type="datetime-local"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
                style={{
                  padding: '5px 7px', borderRadius: 6, background: 'var(--lp-surface-2)',
                  border: '0.5px solid var(--lp-border)', color: 'var(--lp-text)', fontSize: 12, fontFamily: 'inherit',
                }}
              />
            </label>
            {contextRef ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                padding: '4px 8px', borderRadius: 6, background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-accent)',
                fontSize: 11, color: 'var(--lp-accent)', maxWidth: '100%',
              }}>
                <span>{contextRef.type === 'transaction' ? '💳' : contextRef.type === 'account' ? '📚' : '📅'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{contextRef.label}</span>
                <button onClick={() => setContextRef(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 13, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}>✕</button>
              </div>
            ) : (
              <button
                onClick={() => setPickerOpen(true)}
                style={{
                  alignSelf: 'flex-start', fontSize: 11, color: 'var(--lp-text-muted)', background: 'none',
                  border: '0.5px solid var(--lp-border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                🔗 Link to a transaction
              </button>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--lp-text-muted)', fontFamily: 'inherit', padding: '7px 12px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !body.trim()}
                style={{
                  padding: '7px 16px', borderRadius: 8, background: 'var(--lp-accent)', border: 'none',
                  color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  opacity: (saving || !body.trim()) ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
