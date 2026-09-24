// PATH: src/pages/ClientDocuments.tsx
//
// Firm-side documents for one client — the accountant's own view of the
// exact same documents table PortalDocuments.tsx (client_portal_users) and
// documents_select_client_portal already let the client see: staff upload a
// statement/tax form for the client, or view what the client uploaded
// through their own portal. Same table, same register_document RPC, no new
// backend needed — this page was the missing half (the firm side had no
// route into it at all before this).
//
// Lives at /clients/:clientId/documents, a card on ClientWorkspaceOverview.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useScope } from '../hooks/useScope'
import { db } from '../lib/supabase'
import { uploadDocument, getDocumentSignedUrl, formatBytes, validateFile, softDeleteDocument } from '../services/upload.service'
import { formatDate } from '../lib/dates'
import { toSafeMessage } from '../lib/errors'
import Icon, { type IconName } from '../components/ui/Icon'
import DocumentViewerModal, { openDocumentSignedUrl, type ViewingDocument } from '../components/ui/DocumentViewerModal'

interface DocumentRow {
  id:               string
  filename:         string
  mime_type:        string
  size_bytes:       number
  document_kind:    string
  uploaded_by_role: string
  created_at:       string
}

const KIND_ICON: Record<string, IconName> = {
  attachment: 'attachment', receipt: 'receipt', invoice: 'invoices',
  statement: 'invoices', tax_form: 'taxInfo', contract: 'contract', other: 'folder',
}

export default function ClientDocuments() {
  const scope = useScope()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [docs,      setDocs]      = useState<DocumentRow[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [viewing,   setViewing]   = useState<ViewingDocument | null>(null)

  const clientId = scope.clientId
  const orgId    = scope.orgId

  const load = useCallback(async () => {
    if (!clientId) return
    const { data, error: err } = await db
      .from('documents')
      .select('id, filename, mime_type, size_bytes, document_kind, uploaded_by_role, created_at')
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (err) { setError(toSafeMessage(err, 'Could not load documents')); return }
    setDocs((data ?? []) as DocumentRow[])
  }, [clientId])

  useEffect(() => { void load() }, [load])

  async function handleFileChosen(file: File) {
    if (!clientId) return
    const validation = validateFile(file)
    if (!validation.ok) { setError(validation.reason); return }

    setUploading(true); setError(null)
    try {
      await uploadDocument({ file, orgId, clientId })
      await load()
    } catch (e: any) {
      setError(toSafeMessage(e, 'Upload failed'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleView(doc: DocumentRow) {
    try {
      const signed = await getDocumentSignedUrl(doc.id)
      openDocumentSignedUrl(signed, setViewing)
    } catch (e: any) {
      setError(toSafeMessage(e, 'Could not open document'))
    }
  }

  async function handleDelete(doc: DocumentRow) {
    if (!window.confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return
    try {
      await softDeleteDocument(doc.id)
      await load()
    } catch (e: any) {
      setError(toSafeMessage(e, 'Could not delete document'))
    }
  }

  if (!scope.isReady || !clientId) {
    return <div style={{ padding: 32, color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>
  }

  return (
    <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 className="lp-page-title">Documents</h1>
          <p className="lp-page-sub">Shared with {scope.client?.display_name ?? 'this client'}</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileChosen(f) }}
          />
          <button
            className="lp-btn lp-btn-primary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : <><Icon name="send" size={12} /> Upload document</>}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)', color: 'var(--sem-red)',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <Icon name="warning" size={13} /> {error}
        </div>
      )}

      {docs === null && (
        <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>Loading…</div>
      )}

      {docs !== null && docs.length === 0 && (
        <div className="lp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, opacity: 0.5 }}>
            <Icon name="folder" size={30} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
            No documents yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
            Upload a statement or tax form, or wait for the client to share one through their portal.
          </div>
        </div>
      )}

      {docs !== null && docs.length > 0 && (
        <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
          {docs.map((d, i) => (
            <div
              key={d.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '13px 16px', background: 'var(--lp-surface)',
                borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)',
              }}
            >
              <span style={{ flexShrink: 0, color: 'var(--lp-text-muted)', display: 'flex' }}>
                <Icon name={KIND_ICON[d.document_kind] ?? 'folder'} size={16} />
              </span>
              <button
                onClick={() => void handleView(d)}
                style={{
                  flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: 500, color: 'var(--lp-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {d.filename}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                  {formatBytes(d.size_bytes)} · {formatDate(d.created_at)} · {d.uploaded_by_role === 'client' ? 'Client' : 'You'}
                </div>
              </button>
              <button
                onClick={() => void handleDelete(d)}
                title="Delete"
                style={{
                  background: 'transparent', border: 'none', color: 'var(--lp-text-muted)',
                  cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--sem-red)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--lp-text-muted)' }}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <DocumentViewerModal doc={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
