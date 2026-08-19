// PATH: src/services/upload.service.ts
//
// Single source of truth for file uploads.
// Flow:
//   1. validateFile()          → check mime + size
//   2. compressIfImage()       → browser-side compression (HEIC → JPEG too)
//   3. uploadToStorage()       → Supabase Storage put
//   4. registerDocument()      → RPC writes documents row + hash chain
//   5. getDocumentSignedUrl()  → generate short-lived URL for viewing

import { db, supabase } from '../lib/supabase'
import imageCompression from 'browser-image-compression'
import { pruneRpcArgs } from '../lib/rpc-args'

// ── Constants ────────────────────────────────────────────────────────────────

export const STORAGE_BUCKET = 'transaction-documents'

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'application/pdf'
] as const

export const MAX_FILE_SIZE       = 50 * 1024 * 1024   // 50 MB hard cap
export const MAX_IMAGE_SIZE_AFTER = 1.5 * 1024 * 1024 // 1.5 MB target after compression
export const MAX_IMAGE_WIDTH      = 2400              // px

export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number]

export type DocumentKind =
  | 'attachment'
  | 'receipt'
  | 'invoice'
  | 'statement'
  | 'tax_form'
  | 'contract'
  | 'other'

// ── Types ────────────────────────────────────────────────────────────────────

export interface UploadInput {
  file:          File
  orgId:         string
  clientId?:     string
  transactionId?: string
  documentKind?: DocumentKind
  /** Optional progress callback (0–1) */
  onProgress?:   (pct: number) => void
}

export interface UploadResult {
  documentId:    string
  storagePath:   string
  filename:      string
  mimeType:      string
  sizeBytes:     number
  uploadedRole:  string
}

export interface SignedUrlResult {
  documentId:   string
  storageBucket: string
  storagePath:  string
  filename:     string
  mimeType:     string
  sizeBytes:    number
  documentKind: string
  /** Browser-usable signed URL with expiration */
  signedUrl:    string
  /** Expiration timestamp (ISO) */
  expiresAt:    string
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validateFile(file: File): { ok: true } | { ok: false; reason: string } {
  if (!file) return { ok: false, reason: 'No file provided' }

  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      reason: `File too large: ${formatBytes(file.size)} (max ${formatBytes(MAX_FILE_SIZE)})`
    }
  }

  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    // HEIC files sometimes report empty mime type on iOS, accept by extension
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'heic' || ext === 'heif') {
      return { ok: true }
    }
    return {
      ok: false,
      reason: `File type "${file.type || 'unknown'}" not allowed. ` +
              `Allowed: images (JPG, PNG, HEIC, WebP) and PDFs.`
    }
  }

  return { ok: true }
}

// ── Compression ──────────────────────────────────────────────────────────────

async function compressIfImage(file: File): Promise<File> {
  // PDFs and small images: pass through
  if (file.type === 'application/pdf') return file
  if (!file.type.startsWith('image/') && !isHeicByExt(file)) return file

  // Compress
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB:           MAX_IMAGE_SIZE_AFTER / (1024 * 1024),
      maxWidthOrHeight:    MAX_IMAGE_WIDTH,
      useWebWorker:        true,
      // Convert HEIC/HEIF → JPEG for cross-browser support
      ...(isHeicByExt(file) ? { fileType: 'image/jpeg' } : {}),
      initialQuality:      0.85,
      preserveExif:        true
    })

    // imageCompression returns a Blob sometimes — normalize to File
    const normalizedName = isHeicByExt(file)
      ? file.name.replace(/\.(heic|heif)$/i, '.jpg')
      : file.name

    return new File([compressed], normalizedName, {
      type: compressed.type || file.type,
      lastModified: file.lastModified
    })
  } catch (e) {
    // Compression failure shouldn't block upload — fall back to original
    console.warn('[upload.service] compression failed, uploading original:', e)
    return file
  }
}

function isHeicByExt(file: File): boolean {
  const ext = file.name.toLowerCase().split('.').pop()
  return ext === 'heic' || ext === 'heif'
}

// ── Path generation ──────────────────────────────────────────────────────────

function generateStoragePath(input: {
  orgId:          string
  clientId?:      string
  transactionId?: string
  filename:       string
}): string {
  const clientSegment = input.clientId ?? 'org'
  const txSegment     = input.transactionId ?? 'general'
  const uniqueId      = crypto.randomUUID()
  // Sanitize filename: keep letters, digits, dash, underscore, dot. Replace rest with _.
  const safeName = input.filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80)

  return `${input.orgId}/${clientSegment}/${txSegment}/${uniqueId}_${safeName}`
}

// ── Get image dimensions (best-effort) ───────────────────────────────────────

async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return null
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

// ── MAIN: uploadDocument ─────────────────────────────────────────────────────

export async function uploadDocument(input: UploadInput): Promise<UploadResult> {
  // 1. Validate
  const validation = validateFile(input.file)
  if (!validation.ok) throw new Error(validation.reason)

  input.onProgress?.(0.05)

  // 2. Compress (if image)
  const compressed = await compressIfImage(input.file)
  input.onProgress?.(0.30)

  // 3. Generate path
  const storagePath = generateStoragePath({
    orgId:         input.orgId,
    filename:      compressed.name,
    ...(input.clientId      !== undefined ? { clientId:      input.clientId }      : {}),
    ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {})
  })

  // 4. Get image dimensions (non-blocking quality info)
  const dims = await getImageDimensions(compressed)
  input.onProgress?.(0.40)

  // 5. Upload to Storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, compressed, {
      contentType: compressed.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false
    })

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }
  input.onProgress?.(0.80)

  // 6. Register metadata via RPC
  try {
    const { data, error } = await db.rpc('register_document', pruneRpcArgs({
      p_org_id:         input.orgId,
      p_storage_path:   storagePath,
      p_filename:       input.file.name,                    // original name for display
      p_mime_type:      compressed.type || 'application/octet-stream',
      p_size_bytes:     compressed.size,
      p_client_id:      input.clientId      ?? undefined,
      p_transaction_id: input.transactionId ?? undefined,
      p_document_kind:  input.documentKind  ?? 'attachment',
      p_width:          dims?.width  ?? undefined,
      p_height:         dims?.height ?? undefined,
      p_storage_bucket: STORAGE_BUCKET
    }))

    if (error) {
      // Compensate: delete the orphan blob from storage
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {})
      throw new Error(`Document registration failed: ${error.message}`)
    }

    input.onProgress?.(1.0)

    const result = data as { document_id: string; storage_path: string; uploaded_role: string }
    return {
      documentId:    result.document_id,
      storagePath:   result.storage_path,
      filename:      input.file.name,
      mimeType:      compressed.type,
      sizeBytes:     compressed.size,
      uploadedRole:  result.uploaded_role
    }
  } catch (err) {
    // Compensate any orphan
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {})
    throw err
  }
}

// ── Generate signed URL ──────────────────────────────────────────────────────

export async function getDocumentSignedUrl(
  documentId: string,
  expiresInSeconds = 3600
): Promise<SignedUrlResult> {
  // First, fetch metadata + access validation via RPC
  const { data, error } = await db.rpc('get_document_signed_url', {
    p_document_id: documentId
  })

  if (error) throw new Error(error.message)

  const meta = data as {
    document_id:    string
    storage_bucket: string
    storage_path:   string
    filename:       string
    mime_type:      string
    size_bytes:     number
    document_kind:  string
  }

  // Now generate the actual signed URL (the storage SDK requires
  // the user's JWT, which is already attached)
  const { data: signed, error: signError } = await supabase.storage
    .from(meta.storage_bucket)
    .createSignedUrl(meta.storage_path, expiresInSeconds)

  if (signError || !signed) {
    throw new Error(`Could not sign URL: ${signError?.message ?? 'unknown error'}`)
  }

  return {
    documentId:    meta.document_id,
    storageBucket: meta.storage_bucket,
    storagePath:   meta.storage_path,
    filename:      meta.filename,
    mimeType:      meta.mime_type,
    sizeBytes:     meta.size_bytes,
    documentKind:  meta.document_kind,
    signedUrl:     signed.signedUrl,
    expiresAt:     new Date(Date.now() + expiresInSeconds * 1000).toISOString()
  }
}

// ── Soft delete ──────────────────────────────────────────────────────────────

export async function softDeleteDocument(documentId: string): Promise<void> {
  const { error } = await db.rpc('soft_delete_document', {
    p_document_id: documentId
  })
  if (error) throw new Error(error.message)
}

// ── Utils ────────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

export function isPdfMime(mime: string): boolean {
  return mime === 'application/pdf'
}