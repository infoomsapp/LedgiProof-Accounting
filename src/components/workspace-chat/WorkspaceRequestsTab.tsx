// PATH: src/components/workspace-chat/WorkspaceRequestsTab.tsx
//
// "Requests" tab — Solicitudes. Staff asks a client for a specific document
// (pending), the client fulfills it by uploading (uploaded), staff reviews
// it (approved/rejected). Shared between the staff and client (isPyme) sides
// of the same WorkspaceChatPanel — both client-facing surfaces (self-service
// PYME and external client_portal_users contacts) hit this one component,
// since get_workspace_inbox's role field only ever returns
// 'bookkeeper' | 'client'.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listDocumentRequests, createDocumentRequest, fulfillDocumentRequest, reviewDocumentRequest,
  type DocumentRequest
} from '../../services/document-requests.service'
import { uploadDocument, validateFile } from '../../services/upload.service'
import { formatDate } from '../../lib/dates'
import Icon from '../ui/Icon'

interface Props {
  orgId:      string
  clientId:   string
  viewerRole: 'bookkeeper' | 'client'
}

const STATUS_STYLE: Record<DocumentRequest['status'], { label: string; color: string; bg: string; border: string }> = {
  pending:  { label: 'Pending',  color: 'var(--lp-text-muted)', bg: 'var(--lp-surface-2)', border: 'var(--lp-border)' },
  uploaded: { label: 'Uploaded — needs review', color: 'var(--sem-amber)', bg: 'var(--sem-amber-bg)', border: 'var(--sem-amber-border)' },
  approved: { label: '✓ Approved', color: 'var(--sem-green)', bg: 'var(--sem-green-bg)', border: 'var(--sem-green-border)' },
  rejected: { label: '✗ Rejected', color: 'var(--sem-red)', bg: 'var(--sem-red-bg)', border: 'var(--sem-red-border)' },
}

export default function WorkspaceRequestsTab({ orgId, clientId, viewerRole }: Props) {
  const isStaff = viewerRole === 'bookkeeper'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<string | null>(null)

  const [requests, setRequests] = useState<DocumentRequest[] | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [busyId,   setBusyId]   = useState<string | null>(null)

  const [formOpen,     setFormOpen]     = useState(false)
  const [title,        setTitle]        = useState('')
  const [description,  setDescription]  = useState('')
  const [dueAt,        setDueAt]        = useState('')
  const [isSensitive,  setIsSensitive]  = useState(false)
  const [saving,       setSaving]       = useState(false)

  const load = useCallback(async () => {
    try {
      const rows = await listDocumentRequests(orgId, clientId)
      setRequests(rows)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load requests')
    }
  }, [orgId, clientId])

  useEffect(() => { void load() }, [load])

  async function handleCreate() {
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createDocumentRequest({
        orgId, clientId, title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        isSensitive,
      })
      setTitle(''); setDescription(''); setDueAt(''); setIsSensitive(false)
      setFormOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Could not create request')
    } finally {
      setSaving(false)
    }
  }

  function startFulfill(requestId: string) {
    uploadTargetRef.current = requestId
    fileInputRef.current?.click()
  }

  async function handleFileChosen(file: File) {
    const requestId = uploadTargetRef.current
    if (!requestId) return
    const v = validateFile(file)
    if (!v.ok) { setError(v.reason); return }
    setBusyId(requestId)
    setError(null)
    try {
      const result = await uploadDocument({ file, orgId, clientId, documentKind: 'attachment' })
      await fulfillDocumentRequest(requestId, result.documentId)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed')
    } finally {
      setBusyId(null)
      uploadTargetRef.current = null
    }
  }

  async function handleReview(requestId: string, approve: boolean) {
    setBusyId(requestId)
    setError(null)
    try {
      await reviewDocumentRequest(requestId, approve)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Could not review request')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileChosen(f); e.target.value = '' }}
      />

      {isStaff && (
        <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--lp-border)', flexShrink: 0 }}>
          {!formOpen ? (
            <button
              className="lp-btn lp-btn-primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
              onClick={() => setFormOpen(true)}
            >
              + New request
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What do you need? (e.g. Q3 bank statement)"
                style={{
                  padding: '7px 9px', borderRadius: 7, background: 'var(--lp-surface)',
                  border: '0.5px solid var(--lp-border)', color: 'var(--lp-text)',
                  fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Details (optional)…"
                rows={2}
                style={{
                  width: '100%', resize: 'none', boxSizing: 'border-box',
                  padding: '7px 9px', borderRadius: 7, background: 'var(--lp-surface)',
                  border: '0.5px solid var(--lp-border)', color: 'var(--lp-text)',
                  fontSize: 12, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                Due
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                <input type="checkbox" checked={isSensitive} onChange={e => setIsSensitive(e.target.checked)} />
                <Icon name="shield" size={11} /> Sensitive — warn the client to handle with care
              </label>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setFormOpen(false); setTitle(''); setDescription(''); setDueAt(''); setIsSensitive(false) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--lp-text-muted)', fontFamily: 'inherit', padding: '5px 10px' }}
                >
                  Cancel
                </button>
                <button
                  className="lp-btn lp-btn-primary"
                  style={{ fontSize: 12 }}
                  disabled={saving || !title.trim()}
                  onClick={handleCreate}
                >
                  {saving ? 'Saving…' : 'Send request'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--sem-red)' }}>⚠ {error}</div>
        )}

        {requests === null ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
            Loading…
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', opacity: 0.4, marginBottom: 8 }}><Icon name="clipboardList" size={24} /></div>
            <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
              {isStaff ? 'No requests sent yet.' : 'Nothing requested from you right now.'}
            </div>
          </div>
        ) : (
          requests.map((r, i) => {
            const style = STATUS_STYLE[r.status]
            return (
              <div
                key={r.id}
                style={{ padding: '10px 12px', borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20,
                    fontSize: 10.5, fontWeight: 500, color: style.color,
                    background: style.bg, border: `0.5px solid ${style.border}`,
                  }}>
                    {style.label}
                  </span>
                  {r.due_at && (
                    <span style={{ fontSize: 10, color: 'var(--lp-text-muted)' }}>
                      ⏰ {formatDate(r.due_at)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--lp-text)' }}>
                  {r.title}
                </div>
                {r.description && (
                  <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                    {r.description}
                  </div>
                )}
                {r.is_sensitive && r.status === 'pending' && (
                  <div style={{
                    marginTop: 6, padding: '6px 8px', borderRadius: 6, fontSize: 10.5,
                    background: 'var(--sem-amber-bg)', border: '0.5px solid var(--sem-amber-border)', color: 'var(--sem-amber)',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="shield" size={11} /> Handle with care — avoid sending full SSN or card numbers; redact if possible.</span>
                  </div>
                )}

                {!isStaff && r.status === 'pending' && (
                  <button
                    onClick={() => startFulfill(r.id)}
                    disabled={busyId === r.id}
                    style={{
                      marginTop: 6, fontSize: 11, padding: '4px 10px', borderRadius: 6,
                      background: 'var(--lp-accent)', border: 'none',
                      color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                    }}
                  >
                    {busyId === r.id ? 'Uploading…' : '⬆ Upload document'}
                  </button>
                )}

                {isStaff && r.status === 'uploaded' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button
                      onClick={() => void handleReview(r.id, true)}
                      disabled={busyId === r.id}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6,
                        background: 'var(--sem-green-bg)', border: '0.5px solid var(--sem-green-border)',
                        color: 'var(--sem-green)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void handleReview(r.id, false)}
                      disabled={busyId === r.id}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 6,
                        background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)',
                        color: 'var(--sem-red)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                      }}
                    >
                      Reject
                    </button>
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
