// PATH: src/components/upload/AttachmentPreview.tsx
//
// Renders the queued/uploading files as a horizontal row of thumbnails.
// Each item shows:
//   - Image preview OR PDF icon
//   - Filename + size
//   - Progress bar (during upload)
//   - Error state (with retry option)
//   - Remove button

import { useEffect, useState } from 'react'
import type { UploadItem } from '../../hooks/useFileUpload'
import { formatBytes, isImageMime, isPdfMime } from '../../services/upload.service'

interface AttachmentPreviewProps {
  items:       UploadItem[]
  onRemove:    (localId: string) => void
  onRetry?:    (localId: string) => void
}

export default function AttachmentPreview({
  items,
  onRemove,
  onRetry
}: AttachmentPreviewProps) {
  if (items.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      padding: '6px 0',
      borderTop: '0.5px dashed var(--lp-border)'
    }}>
      {items.map(it => (
        <AttachmentThumbnail
          key={it.localId}
          item={it}
          onRemove={() => onRemove(it.localId)}
          {...(onRetry ? { onRetry: () => onRetry(it.localId) } : {})}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function AttachmentThumbnail({
  item,
  onRemove,
  onRetry
}: {
  item:     UploadItem
  onRemove: () => void
  onRetry?: () => void
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Generate local preview URL for images
  useEffect(() => {
    if (isImageMime(item.file.type)) {
      const url = URL.createObjectURL(item.file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [item.file])

  const isImg = isImageMime(item.file.type)
  const isPdf = isPdfMime(item.file.type)
  const isErr = item.status === 'error'
  const isUploading = item.status === 'uploading' || item.status === 'pending'

  return (
    <div style={{
      width: 88,
      height: 110,
      borderRadius: 8,
      overflow: 'hidden',
      position: 'relative',
      background: 'rgba(255,255,255,0.04)',
      border: isErr
        ? '0.5px solid rgba(239,68,68,0.4)'
        : '0.5px solid var(--lp-border)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'inherit'
    }}>

      {/* Thumbnail / icon */}
      <div style={{
        height: 70,
        position: 'relative',
        background: 'rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        {isImg && previewUrl ? (
          <img
            src={previewUrl}
            alt={item.file.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        ) : isPdf ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2
          }}>
            <span style={{ fontSize: 26 }}>📄</span>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#ef4444',
              letterSpacing: '0.05em'
            }}>
              PDF
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 26 }}>📎</span>
        )}

        {/* Progress overlay */}
        {isUploading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 6
          }}>
            <div style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>
              {Math.round(item.progress * 100)}%
            </div>
            <div style={{
              width: '70%',
              height: 3,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.15)',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${item.progress * 100}%`,
                height: '100%',
                background: '#3b82f6',
                transition: 'width 0.2s ease'
              }} />
            </div>
          </div>
        )}

        {/* Done check overlay */}
        {item.status === 'done' && (
          <div style={{
            position: 'absolute',
            top: 4, right: 4,
            background: 'rgba(34,197,94,0.95)',
            color: '#fff',
            width: 18, height: 18,
            borderRadius: '50%',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700
          }}>
            ✓
          </div>
        )}

        {/* Error overlay */}
        {isErr && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(239,68,68,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 18,
            fontWeight: 700
          }}>
            ⚠
          </div>
        )}

        {/* Remove button */}
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          style={{
            position: 'absolute',
            top: 4, left: 4,
            width: 18, height: 18,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.65)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            fontFamily: 'inherit'
          }}
        >
          ×
        </button>
      </div>

      {/* Filename + size + retry */}
      <div style={{
        padding: '4px 6px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <div style={{
          fontSize: 9.5,
          color: 'var(--lp-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.2
        }}
          title={item.file.name}
        >
          {item.file.name}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#64748b' }}>
            {formatBytes(item.file.size)}
          </span>
          {isErr && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              title={item.error ?? 'Retry'}
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'rgba(245,158,11,0.10)',
                border: '0.5px solid rgba(245,158,11,0.30)',
                color: '#f59e0b',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
