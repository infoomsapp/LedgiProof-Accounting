// PATH: src/components/workspace-chat/ClientFilesTab.tsx
//
// "Archivos" tab in the chat header — documents shared with this client,
// without leaving the conversation. Same list+upload pattern as
// PortalDocuments.tsx (Sprint 1, client-portal side) — reused here for
// staff, scoped by org_id+client_id via the same already-secure
// documents table / register_document RPC / storage bucket RLS.

import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../../lib/supabase'
import { uploadDocument, getDocumentSignedUrl, formatBytes, validateFile } from '../../services/upload.service'
import { formatDate } from '../../lib/dates'
import { toSafeMessage } from '../../lib/errors'
import Icon, { type IconName } from '../ui/Icon'
import DocumentViewerModal, { openDocumentSignedUrl, type ViewingDocument } from '../ui/DocumentViewerModal'

interface Props {
  orgId:    string
  clientId: string
}

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
  statement: 'reports', tax_form: 'taxInfo', contract: 'contract', other: 'folder'
}

export default function ClientFilesTab({ orgId, clientId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [docs,      setDocs]      = useState<DocumentRow[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [viewing,   setViewing]   = useState<ViewingDocument | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await db
      .from('documents')
      .select('id, filename, mime_type, size_bytes, document_kind, uploaded_by_role, created_at')
      .eq('org_id', orgId).eq('client_id', clientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (err) { setError(toSafeMessage(err, 'Could not load files')); return }
    setDocs((data ?? []) as DocumentRow[])
  }, [orgId, clientId])

  useEffect(() => { void load() }, [load])

  async function handleFileChosen(file: File) {
    const validation = validateFile(file)
    if (!validation.ok) { setError(validation.reason); return }
    setUploading(true); setError(null)
    try {
      await uploadDocument({ file, orgId, clientId })
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
      openDocumentSignedUrl(signed, setViewing)
    } catch (e: any) {
      setError(toSafeMessage(e, 'Could not open document'))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--lp-border)', flexShrink: 0 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileChosen(f) }}
        />
        <button
          className="lp-btn lp-btn-primary"
          style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : '⬆ Upload document'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--sem-red)' }}>⚠ {error}</div>
        )}

        {docs === null ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
            Loading…
          </div>
        ) : docs.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', opacity: 0.4, marginBottom: 8 }}><Icon name="folder" size={24} /></div>
            <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
              No documents shared yet.
            </div>
          </div>
        ) : (
          docs.map((d, i) => (
            <button
              key={d.id}
              onClick={() => void handleView(d)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '10px 12px', background: 'transparent', border: 'none',
                borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)',
                cursor: 'pointer', fontFamily: 'inherit'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-row-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ flexShrink: 0, display: 'flex', color: 'var(--lp-text-muted)' }}><Icon name={KIND_ICON[d.document_kind] ?? 'folder'} size={15} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--lp-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.filename}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', marginTop: 1 }}>
                  {formatBytes(d.size_bytes)} · {formatDate(d.created_at)} · {d.uploaded_by_role === 'client' ? 'Client' : 'You'}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      <DocumentViewerModal doc={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
