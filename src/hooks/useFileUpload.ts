// PATH: src/hooks/useFileUpload.ts
//
// Hook for managing file uploads with progress per item.
// Supports multiple concurrent uploads, retry, cancellation (best-effort),
// and a clean API for components that need to attach files.

import { useCallback, useState } from 'react'
import {
  uploadDocument,
  validateFile,
  formatBytes,
  type UploadResult,
  type DocumentKind
} from '../services/upload.service'

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error'

export interface UploadItem {
  /** Local id used to track this upload across re-renders */
  localId:        string
  file:           File
  status:         UploadStatus
  progress:       number          // 0–1
  result?:        UploadResult    // populated on 'done'
  // `| undefined` (not just `?:`) is intentional — runUpload explicitly
  // clears a previous error via `updateItem(id, { error: undefined })`
  // when a retry starts, which exactOptionalPropertyTypes otherwise rejects.
  error?:         string | undefined   // populated on 'error'
}

export interface UseFileUploadOptions {
  orgId:          string
  clientId?:      string
  transactionId?: string
  documentKind?:  DocumentKind
  /** Called once a single upload completes successfully */
  onUploaded?:    (result: UploadResult, item: UploadItem) => void
  /** Called when all queued uploads have settled (success or error) */
  onAllSettled?:  (items: UploadItem[]) => void
}

export interface UseFileUpload {
  items:          UploadItem[]
  isUploading:    boolean
  addFiles:       (files: File[] | FileList) => void
  removeItem:     (localId: string) => void
  retry:          (localId: string) => Promise<void>
  clear:          () => void
  /** Convenience: how many successful */
  doneCount:      number
  /** Convenience: array of UploadResults for items that completed */
  completed:      UploadResult[]
}

// ─────────────────────────────────────────────────────────────────────────────

export function useFileUpload(opts: UseFileUploadOptions): UseFileUpload {
  const [items, setItems] = useState<UploadItem[]>([])

  // ── Helpers ─────────────────────────────────────────────────────────────
  function updateItem(localId: string, patch: Partial<UploadItem>) {
    setItems(prev => prev.map(it =>
      it.localId === localId ? { ...it, ...patch } : it
    ))
  }

  async function runUpload(item: UploadItem) {
    updateItem(item.localId, { status: 'uploading', progress: 0, error: undefined })

    try {
      const result = await uploadDocument({
        file:  item.file,
        orgId: opts.orgId,
        ...(opts.clientId      ? { clientId: opts.clientId }           : {}),
        ...(opts.transactionId ? { transactionId: opts.transactionId } : {}),
        ...(opts.documentKind  ? { documentKind: opts.documentKind }   : {}),
        onProgress: pct => updateItem(item.localId, { progress: pct })
      })

      updateItem(item.localId, {
        status:    'done',
        progress:  1,
        result
      })

      opts.onUploaded?.(result, { ...item, status: 'done', result, progress: 1 })
    } catch (err: any) {
      updateItem(item.localId, {
        status:   'error',
        error:    err?.message ?? 'Upload failed'
      })
    }
  }

  // ── Add files ───────────────────────────────────────────────────────────
  const addFiles = useCallback((files: File[] | FileList) => {
    const arr = Array.from(files)
    const newItems: UploadItem[] = []
    const errors:   UploadItem[] = []

    for (const file of arr) {
      const validation = validateFile(file)
      const localId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      if (!validation.ok) {
        errors.push({
          localId, file,
          status: 'error',
          progress: 0,
          error: validation.reason
        })
      } else {
        newItems.push({
          localId, file,
          status: 'pending',
          progress: 0
        })
      }
    }

    setItems(prev => [...prev, ...newItems, ...errors])

    // Kick off uploads (parallel, no concurrency limit for now)
    Promise.all(newItems.map(item => runUpload(item))).finally(() => {
      // After settled — capture final state via setItems callback
      setItems(prev => {
        opts.onAllSettled?.(prev)
        return prev
      })
    })
  }, [opts.orgId, opts.clientId, opts.transactionId, opts.documentKind])

  // ── Remove an item from the list ────────────────────────────────────────
  const removeItem = useCallback((localId: string) => {
    setItems(prev => prev.filter(it => it.localId !== localId))
  }, [])

  // ── Retry a failed upload ───────────────────────────────────────────────
  const retry = useCallback(async (localId: string) => {
    const item = items.find(it => it.localId === localId)
    if (!item) return
    await runUpload(item)
  }, [items])

  // ── Clear all ───────────────────────────────────────────────────────────
  const clear = useCallback(() => setItems([]), [])

  // ── Derived state ───────────────────────────────────────────────────────
  const isUploading = items.some(it => it.status === 'uploading' || it.status === 'pending')
  const doneCount   = items.filter(it => it.status === 'done').length
  const completed   = items.filter(it => it.status === 'done' && it.result).map(it => it.result!)

  return {
    items,
    isUploading,
    addFiles,
    removeItem,
    retry,
    clear,
    doneCount,
    completed
  }
}

// ── Re-export for convenience ────────────────────────────────────────────────
export { formatBytes }
