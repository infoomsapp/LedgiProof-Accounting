// PATH: src/components/upload/UploadReceiptDialog.tsx
//
// Reusable modal to upload one or more receipts.
// After each successful upload (kind='receipt'|'invoice'), automatically
// triggers OCR extraction via the ocr-receipt edge function and shows
// extracted merchant, amount, date, and confidence to the user.
//
// Used by:
//   - SoloDashboard       → self-employed user upload (no client_id)
//   - PymeDashboard       → client portal user upload (with client_id)
//   - ReceiptRequestsCard → fulfills a pending receipt_request
//   - TransactionDetail   → attaches a receipt to an existing transaction
//
// On success:
//   - If receiptRequestId is provided, calls fulfill_receipt_request RPC.
//   - Otherwise just registers the receipt with document_kind='receipt'.

import { useState, useEffect, useRef } from 'react'
import { db }                  from '../../lib/supabase'
import Modal                   from '../ui/modal'
import Button                  from '../ui/Button'
import SemaphoreSpinner        from '../ui/SemaphoreSpinner'
import AttachButton            from './AttachButton'
import AttachmentPreview       from './AttachmentPreview'
import { useFileUpload }       from '../../hooks/useFileUpload'
import { setDropTarget }       from './DropZone'
import {
  extractReceiptOcr,
  confidenceLabel,
  confidenceColor,
  type OcrResult,
  type OcrStatus
} from '../../services/ocr.service'

interface Props {
  open:           boolean
  onClose:        () => void
  orgId:          string
  clientId?:      string             // present for PYME client portal uploads
  /** If provided, fulfills the given receipt_request after upload */
  receiptRequestId?: string
  /** Optional: link the receipt to a specific transaction */
  transactionId?: string
  /** Optional context to show at the top (e.g. "Starbucks · $4.85 · Apr 28") */
  contextLine?:   string
  /** Called after one upload succeeds — parent may want to refresh data */
  onUploaded?:    (documentId: string) => void
}

interface OcrState {
  status: OcrStatus
  result: OcrResult | null
  error:  string | null
}

export default function UploadReceiptDialog({
  open,
  onClose,
  orgId,
  clientId,
  receiptRequestId,
  transactionId,
  contextLine,
  onUploaded
}: Props) {

  const [fulfilling, setFulfilling] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  // OCR state per documentId
  const [ocrMap, setOcrMap]         = useState<Map<string, OcrState>>(new Map())
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const setOcr = (documentId: string, patch: Partial<OcrState>) =>
    setOcrMap(prev => {
      const next = new Map(prev)
      next.set(documentId, { ...{ status: 'idle', result: null, error: null }, ...prev.get(documentId), ...patch })
      return next
    })

  const runOcr = async (documentId: string) => {
    setOcr(documentId, { status: 'extracting' })
    try {
      const result = await extractReceiptOcr(documentId, orgId)
      setOcr(documentId, { status: 'done', result })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setOcr(documentId, { status: 'error', error: msg })
    }
  }

  const upload = useFileUpload({
    orgId,
    ...(clientId      !== undefined ? { clientId }      : {}),
    ...(transactionId !== undefined ? { transactionId } : {}),
    documentKind: 'receipt',
    onUploaded: async (result, _item) => {
      // Fulfill receipt request if needed
      if (receiptRequestId) {
        setFulfilling(result.documentId)
        try {
          const { error } = await db.rpc('fulfill_receipt_request', {
            p_request_id:  receiptRequestId,
            p_document_id: result.documentId
          })
          if (error) setError(`Receipt uploaded but linking failed: ${error.message}`)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(`Receipt uploaded but linking failed: ${msg}`)
        } finally {
          setFulfilling(null)
        }
      }

      onUploaded?.(result.documentId)

      // Kick off OCR — don't await, just let it update state async
      void runOcr(result.documentId)
    }
  })

  // Reset on open
  useEffect(() => {
    if (open) {
      upload.clear()
      setError(null)
      setOcrMap(new Map())
    }
  }, [open])  // eslint-disable-line react-hooks/exhaustive-deps

  // Register as drop target while open
  useEffect(() => {
    if (!open) return
    const cleanup = setDropTarget({
      id:      'upload-receipt-dialog',
      label:   'Drop receipt to upload',
      handler: (files) => upload.addFiles(files)
    })
    return cleanup
  }, [open])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    if (upload.isUploading || fulfilling) return
    onClose()
  }

  const allDone = upload.items.length > 0 &&
                  upload.items.every(it => it.status === 'done' || it.status === 'error')
  const successCount = upload.doneCount
  const hasErrors    = upload.items.some(it => it.status === 'error')

  // Collect OCR results for done uploads
  const ocrResults = upload.items
    .filter(it => it.status === 'done' && it.result?.documentId)
    .map(it => ({ documentId: it.result!.documentId, ocr: ocrMap.get(it.result!.documentId) }))

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={receiptRequestId ? 'Send receipt' : 'Upload receipt'}
      subtitle={
        receiptRequestId
          ? 'Your accountant requested this receipt.'
          : 'Upload a receipt or invoice — we\'ll extract the key fields automatically.'
      }
      width={560}
      footer={
        <>
          <Button
            variant="ghost"
            size="md"
            onClick={handleClose}
            disabled={upload.isUploading || !!fulfilling}
          >
            {allDone && successCount > 0 ? 'Done' : 'Cancel'}
          </Button>

          {!allDone && (
            <Button
              variant="primary"
              size="md"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isUploading}
            >
              Select files…
            </Button>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Hidden picker driven by the footer "Select files…" button */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf"
          style={{ display: 'none' }}
          onChange={e => {
            if (e.target.files && e.target.files.length > 0) upload.addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {/* Context line */}
        {contextLine && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 7,
            background: 'rgba(59,130,246,0.06)',
            border: '0.5px solid rgba(59,130,246,0.20)',
            fontSize: 12, color: '#bfdbfe'
          }}>
            📎 {contextLine}
          </div>
        )}

        {/* Drop area */}
        <div style={{
          padding: '24px 16px',
          borderRadius: 10,
          border: '1px dashed var(--lp-border)',
          background: 'rgba(255,255,255,0.02)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
          <div style={{ fontSize: 13, color: 'var(--lp-text)', marginBottom: 4, fontWeight: 500 }}>
            Drag &amp; drop files here
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginBottom: 14 }}>
            or click below to choose · Images (JPG, PNG, HEIC) and PDFs up to 50&nbsp;MB
          </div>

          <AttachButton
            onSelect={(files) => upload.addFiles(files)}
            disabled={upload.isUploading}
            label="📎 Choose files"
            multiple
          />
        </div>

        {/* Upload list */}
        {upload.items.length > 0 && (
          <div>
            <div style={{
              fontSize: 11, color: 'var(--lp-text-muted)',
              fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 6
            }}>
              {upload.isUploading
                ? 'Uploading…'
                : allDone
                  ? `${successCount} uploaded${hasErrors ? ' · some failed' : ''}`
                  : 'Queue'}
            </div>
            <AttachmentPreview
              items={upload.items}
              onRemove={upload.removeItem}
              onRetry={upload.retry}
            />
          </div>
        )}

        {/* OCR results — one card per successfully uploaded file */}
        {ocrResults.map(({ documentId, ocr }) => (
          <OcrResultCard key={documentId} ocr={ocr} />
        ))}

        {/* Fulfilling indicator */}
        {fulfilling && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 7,
            background: 'rgba(34,197,94,0.06)',
            border: '0.5px solid rgba(34,197,94,0.20)',
            fontSize: 12, color: '#22c55e',
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <SemaphoreSpinner size="sm" inline />
            Linking to receipt request…
          </div>
        )}

        {/* Success banner (shown only when no OCR results to display) */}
        {allDone && successCount > 0 && !hasErrors && !fulfilling && ocrResults.every(r => !r.ocr || r.ocr.status === 'error') && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(34,197,94,0.07)',
            border: '0.5px solid rgba(34,197,94,0.25)',
            color: '#22c55e', fontSize: 12.5,
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <div>
              <strong style={{ fontWeight: 600 }}>
                {successCount} receipt{successCount === 1 ? '' : 's'} uploaded
              </strong>
              {receiptRequestId && (
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                  Your accountant will be notified.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.07)',
            border: '0.5px solid rgba(239,68,68,0.25)',
            color: '#ef4444', fontSize: 12.5
          }}>
            ⚠ {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── OCR result card ───────────────────────────────────────────────────────────

function OcrResultCard({ ocr }: { ocr: OcrState | undefined }) {
  if (!ocr || ocr.status === 'idle') return null

  // Extracting spinner
  if (ocr.status === 'extracting') {
    return (
      <div style={{
        padding: '10px 14px',
        borderRadius: 8,
        background: 'var(--lp-surface-2)',
        border: '0.5px solid var(--lp-border)',
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 12.5, color: 'var(--lp-text-muted)'
      }}>
        <SemaphoreSpinner size="sm" inline />
        Analyzing receipt with AI…
      </div>
    )
  }

  // Error
  if (ocr.status === 'error') {
    return (
      <div style={{
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(239,68,68,0.05)',
        border: '0.5px solid rgba(239,68,68,0.2)',
        fontSize: 12, color: '#ef4444'
      }}>
        ⚠ OCR failed: {ocr.error}
      </div>
    )
  }

  // Done
  const r = ocr.result!
  const label = confidenceLabel(r.confidence)
  const color = confidenceColor(r.confidence)

  const hasData = r.merchant_name || r.total_amount !== null || r.date

  return (
    <div style={{
      borderRadius: 8,
      background: 'var(--lp-surface-2)',
      border: '0.5px solid var(--lp-border)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '0.5px solid var(--lp-border)',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--lp-text-muted)'
      }}>
        <span>🔍 AI extraction</span>
        <span style={{
          marginLeft: 'auto',
          padding: '1px 7px',
          borderRadius: 100,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          color,
          fontSize: 10
        }}>
          {label} confidence · {r.confidence}%
        </span>
      </div>

      {/* Fields */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!hasData ? (
          <span style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
            Could not extract data from this document.
          </span>
        ) : (
          <>
            {r.merchant_name && (
              <Field label="Merchant" value={r.merchant_name} />
            )}
            {r.total_amount !== null && (
              <Field
                label="Amount"
                value={`${r.currency ?? 'USD'} ${r.total_amount.toFixed(2)}`}
                highlight
              />
            )}
            {r.date && (
              <Field label="Date" value={r.date} />
            )}
            {r.category && (
              <Field label="Category" value={r.category.replace(/_/g, ' ')} />
            )}
            {r.tax_amount !== null && r.tax_amount > 0 && (
              <Field label="Tax" value={`${r.currency ?? 'USD'} ${r.tax_amount.toFixed(2)}`} />
            )}
            {r.payment_method && (
              <Field label="Payment" value={r.payment_method} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  highlight = false
}: {
  label:      string
  value:      string
  highlight?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        fontWeight: 500, minWidth: 72, flexShrink: 0
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 12.5,
        color: highlight ? 'var(--lp-text)' : 'var(--lp-text)',
        fontWeight: highlight ? 600 : 400
      }}>
        {value}
      </span>
    </div>
  )
}
