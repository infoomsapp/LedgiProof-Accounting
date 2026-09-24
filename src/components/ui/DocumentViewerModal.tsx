// PATH: src/components/ui/DocumentViewerModal.tsx
//
// In-app viewer for a document's signed URL. Built specifically for receipt/
// invoice PHOTOS: the user's own words were that a PDF punting out to a new
// browser tab is fine, but an image needs to stay visible INSIDE the app for
// security/audit-evidence reasons — matching how QuickBooks/Expensify keep a
// receipt attached and viewable in place rather than requiring it be opened
// or downloaded elsewhere to be checked against a transaction.
//
// Every "view a document" call site in the app (ClientDocuments.tsx,
// PortalDocuments.tsx, ClientFilesTab.tsx, WorkspaceChatMessage.tsx) used to
// window.open() every document's signed URL regardless of type. Only images
// route through this modal now; a PDF still opens in a new tab (explicitly
// fine per the user) via openDocumentSignedUrl() below, which every call
// site should use instead of hand-rolling the image/PDF branch itself.

import { useEffect } from 'react'
import Icon from './Icon'

export interface ViewingDocument {
  url:      string
  mimeType: string
  filename: string
}

/** True when a signed document should open in this in-app modal rather than a new tab. */
export function isInAppViewable(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

interface Props {
  doc:     ViewingDocument | null
  onClose: () => void
}

export default function DocumentViewerModal({ doc, onClose }: Props) {
  useEffect(() => {
    if (!doc) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [doc, onClose])

  if (!doc) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Header bar */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'rgba(18,20,31,0.92)',
        }}
      >
        <div style={{
          fontSize: 13, color: '#fff', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%'
        }}>
          {doc.filename}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Open in a new tab"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, color: '#d1d5db',
              fontSize: 11.5, textDecoration: 'none', padding: '5px 9px',
              borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.2)',
            }}
          >
            <Icon name="link" size={12} /> Open in new tab
          </a>
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: 'transparent', border: 'none', color: '#d1d5db',
              cursor: 'pointer', padding: 6, display: 'flex'
            }}
          >
            <Icon name="xCircle" size={20} />
          </button>
        </div>
      </div>

      {/* Image, click-to-close guarded so clicking the image itself doesn't close it */}
      <img
        src={doc.url}
        alt={doc.filename}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '92vw', maxHeight: '82vh',
          objectFit: 'contain', borderRadius: 6,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  )
}

/**
 * Shared open-a-document helper: images go to the in-app modal (via
 * setViewing), everything else (PDFs, etc.) opens in a new tab — the one
 * behavior the user explicitly said was fine to keep as-is.
 */
export function openDocumentSignedUrl(
  signed: { signedUrl: string; mimeType: string; filename: string },
  setViewing: (doc: ViewingDocument) => void
): void {
  if (isInAppViewable(signed.mimeType)) {
    setViewing({ url: signed.signedUrl, mimeType: signed.mimeType, filename: signed.filename })
  } else {
    window.open(signed.signedUrl, '_blank', 'noopener,noreferrer')
  }
}
