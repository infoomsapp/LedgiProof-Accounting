// PATH: src/components/workspace-chat/WorkspaceNotesTab.tsx
//
// "Notes" tab in the chat header — Nota Contable. A note can optionally
// require a second person's approval (segregation of duties, same idea as
// journal.service.ts's approveManualJournalBatch) and optionally carry a due
// date/time that the workspace-note-reminders pg_cron job turns into a real
// notification once it passes. Schema is already shaped for a future
// standalone sidebar Notes/Tasks page — this tab is just today's surface.

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { useUserRole } from '../../hooks/useUserRole'
import {
  listWorkspaceNotes, createWorkspaceNote, approveWorkspaceNote, completeWorkspaceNote,
  getWorkspaceNoteStatus, NOTE_STATUS_STYLE, type WorkspaceNote
} from '../../services/workspace-notes.service'
import ContextRefPicker from './ContextRefPicker'
import type { ContextRef } from '../../services/workspace-chat.service'
import { formatDate } from '../../lib/dates'
import Icon from '../ui/Icon'

interface Props {
  orgId:    string
  clientId: string
}

export default function WorkspaceNotesTab({ orgId, clientId }: Props) {
  const { profile } = useAuthStore()
  const { workspaceRole } = useUserRole()
  const userId = profile?.id ?? ''
  // Mirrors approve_workspace_note's own authorization check exactly
  // (owner/admin/accountant, any firm type) — deliberately NOT
  // canApproveManualBatch, which is narrower (owner/admin only) and
  // restricted to accountant firms, a different, stricter feature.
  const canApproveNotes = workspaceRole === 'owner' || workspaceRole === 'admin' || workspaceRole === 'accountant'

  const [notes,   setNotes]   = useState<WorkspaceNote[] | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [busyId,  setBusyId]  = useState<string | null>(null)

  const [formOpen,     setFormOpen]     = useState(false)
  const [body,          setBody]          = useState('')
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [dueAt,         setDueAt]         = useState('')
  const [contextRef,    setContextRef]    = useState<ContextRef | null>(null)
  const [pickerOpen,    setPickerOpen]    = useState(false)
  const [saving,        setSaving]        = useState(false)

  const load = useCallback(async () => {
    try {
      const rows = await listWorkspaceNotes(orgId, clientId)
      setNotes(rows)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load notes')
    }
  }, [orgId, clientId])

  useEffect(() => { void load() }, [load])

  async function handleCreate() {
    if (!body.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createWorkspaceNote({
        orgId, clientId, body: body.trim(),
        requiresApproval,
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        ...(contextRef ? { contextRef } : {}),
      })
      setBody('')
      setRequiresApproval(false)
      setDueAt('')
      setContextRef(null)
      setFormOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Could not create note')
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--lp-border)', flexShrink: 0 }}>
        {!formOpen ? (
          <button
            className="lp-btn lp-btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
            onClick={() => setFormOpen(true)}
          >
            + New note
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
            {pickerOpen && (
              <ContextRefPicker
                orgId={orgId}
                clientId={clientId}
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
                width: '100%', resize: 'none', boxSizing: 'border-box',
                padding: '7px 9px', borderRadius: 7, background: 'var(--lp-surface)',
                border: '0.5px solid var(--lp-border)', color: 'var(--lp-text)',
                fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
              <input type="checkbox" checked={requiresApproval} onChange={e => setRequiresApproval(e.target.checked)} />
              Requires a second person's approval
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
              Reminder
              <input
                type="datetime-local"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
                style={{
                  padding: '4px 6px', borderRadius: 6, background: 'var(--lp-surface)',
                  border: '0.5px solid var(--lp-border)', color: 'var(--lp-text)',
                  fontSize: 11.5, fontFamily: 'inherit',
                }}
              />
            </label>
            {contextRef ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                padding: '4px 8px', borderRadius: 6,
                background: 'var(--lp-surface)', border: '0.5px solid var(--lp-accent)',
                fontSize: 11, color: 'var(--lp-accent)', maxWidth: '100%',
              }}>
                <Icon name={contextRef.type === 'transaction' ? 'billing' : contextRef.type === 'account' ? 'accounts' : 'calendar'} size={11} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {contextRef.label}
                </span>
                <button
                  onClick={() => setContextRef(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 13, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}
                >✕</button>
              </div>
            ) : (
              <button
                onClick={() => setPickerOpen(true)}
                style={{
                  alignSelf: 'flex-start', fontSize: 11, color: 'var(--lp-text-muted)',
                  background: 'none', border: '0.5px solid var(--lp-border)', borderRadius: 6,
                  padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <Icon name="link" size={11} /> Link to a transaction
              </button>
            )}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setFormOpen(false); setBody(''); setRequiresApproval(false); setDueAt(''); setContextRef(null); setPickerOpen(false) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--lp-text-muted)', fontFamily: 'inherit', padding: '5px 10px' }}
              >
                Cancel
              </button>
              <button
                className="lp-btn lp-btn-primary"
                style={{ fontSize: 12 }}
                disabled={saving || !body.trim()}
                onClick={handleCreate}
              >
                {saving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--sem-red)' }}>⚠ {error}</div>
        )}

        {notes === null ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
            Loading…
          </div>
        ) : notes.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', opacity: 0.4, marginBottom: 8 }}><Icon name="edit" size={24} /></div>
            <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
              No notes yet for this client.
            </div>
          </div>
        ) : (
          notes.map((n, i) => {
            const status = getWorkspaceNoteStatus(n)
            const style  = NOTE_STATUS_STYLE[status]
            const canApproveThis = status === 'pending_approval' && canApproveNotes && n.created_by !== userId
            const canComplete    = status === 'open' && !n.requires_approval
            return (
              <div
                key={n.id}
                style={{
                  padding: '10px 12px',
                  borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20,
                    fontSize: 10.5, fontWeight: 500, color: style.color,
                    background: style.bg, border: `0.5px solid ${style.border}`,
                  }}>
                    {style.label}
                  </span>
                  {n.due_at && (
                    <span style={{ fontSize: 10, color: 'var(--lp-text-muted)' }}>
                      ⏰ {formatDate(n.due_at)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--lp-text)', lineHeight: 1.4 }}>
                  {n.body}
                </div>
                {n.context_ref && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                    fontSize: 10.5, color: 'var(--lp-accent)',
                  }}>
                    <Icon name={n.context_ref.type === 'transaction' ? 'billing' : n.context_ref.type === 'account' ? 'accounts' : 'calendar'} size={10} />
                    {n.context_ref.label}
                  </div>
                )}
                {(canApproveThis || canComplete) && (
                  <div style={{ marginTop: 6 }}>
                    {canApproveThis && (
                      <button
                        onClick={() => void handleApprove(n.id)}
                        disabled={busyId === n.id}
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 6,
                          background: 'var(--sem-green-bg)', border: '0.5px solid var(--sem-green-border)',
                          color: 'var(--sem-green)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
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
                          color: 'var(--lp-text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                        }}
                      >
                        {busyId === n.id ? '…' : 'Mark done'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
