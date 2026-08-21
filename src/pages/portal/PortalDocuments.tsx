// PATH: src/pages/portal/PortalDocuments.tsx
//
// Documents exchanged between this client and their bookkeeper/accountant.
// List + upload both go through the same RPCs/RLS already used by staff —
// register_document and the documents table's documents_select_client_portal
// policy already authorize a client_portal_users member for this exact
// client, verified live against the DB before building this page. Nothing
// new needed on the backend.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { ClientPortalMembership } from '../../store/client-portal.store'
import { db } from '../../lib/supabase'
import { uploadDocument, getDocumentSignedUrl, formatBytes, validateFile } from '../../services/upload.service'
import { formatDate } from '../../lib/dates'

interface DocumentRow {
  id:               string
  filename:         string
  mime_type:        string
  size_bytes:       number
  document_kind:    string
  uploaded_by_role: string
  created_at:       string
}

const KIND_ICON: Record<string, string> = {
  attachment: '📎', receipt: '🧾', invoice: '📄',
  statement: '📑', tax_form: '📋', contract: '📜', other: '📁'
}

export default function PortalDocuments() {
  const membership = useOutletContext<ClientPortalMembership>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [docs,      setDocs]      = useState<DocumentRow[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await db
      .from('documents')
      .select('id, filename, mime_type, size_bytes, document_kind, uploaded_by_role, created_at')
      .eq('client_id', membership.clientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (err) { setError(err.message); return }
    setDocs((data ?? []) as DocumentRow[])
  }, [membership.clientId])

  useEffect(() => { void load() }, [load])

  async function handleFileChosen(file: File) {
    const validation = validateFile(file)
    if (!validation.ok) { setError(validation.reason); return }

    setUploading(true); setError(null)
    try {
      await uploadDocument({ file, orgId: membership.orgId, clientId: membership.clientId })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleView(doc: DocumentRow) {
    try {
      const signed = await getDocumentSignedUrl(doc.id)
      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      setError(e?.message ?? 'Could not open document')
    }
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 className="lp-page-title">Documents</h1>
          <p className="lp-page-sub">Shared with {membership.orgName}</p>
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
            {uploading ? 'Uploading…' : '⬆ Upload document'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)', color: 'var(--sem-red)' }}>
          ⚠ {error}
        </div>
      )}

      {docs === null && (
        <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>Loading…</div>
      )}

      {docs !== null && docs.length === 0 && (
        <div className="lp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
            No documents yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
            Upload a receipt, statement, or tax form to share with your bookkeeper.
          </div>
        </div>
      )}

      {docs !== null && docs.length > 0 && (
        <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
          {docs.map((d, i) => (
            <button
              key={d.id}
              onClick={() => void handleView(d)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '14px 16px', background: 'var(--lp-surface)', border: 'none',
                borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)',
                cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{KIND_ICON[d.document_kind] ?? '📁'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--lp-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.filename}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                  {formatBytes(d.size_bytes)} · {formatDate(d.created_at)} · {d.uploaded_by_role === 'client' ? 'You' : 'Bookkeeper'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
