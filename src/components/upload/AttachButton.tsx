// PATH: src/components/upload/AttachButton.tsx
//
// Small "📎 Attach" button that opens the native file picker.
// Accepts the project-wide allowed mime types and triggers the parent's
// onSelect callback when files are chosen.

import { useRef } from 'react'
import { ALLOWED_MIME_TYPES } from '../../services/upload.service'

interface AttachButtonProps {
  onSelect:        (files: File[]) => void
  disabled?:       boolean
  multiple?:       boolean
  /** Optional override (defaults to "📎 Attach") */
  label?:          string
  /** 'compact' shrinks to icon only */
  variant?:        'default' | 'compact'
}

export default function AttachButton({
  onSelect,
  disabled = false,
  multiple = true,
  label    = '📎 Attach',
  variant  = 'default'
}: AttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleClick() {
    if (disabled) return
    inputRef.current?.click()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    onSelect(Array.from(files))
    // Reset so the same file can be re-selected later
    e.target.value = ''
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={ALLOWED_MIME_TYPES.join(',') + ',.heic,.heif'}
        style={{ display: 'none' }}
        onChange={handleChange}
      />

      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title="Attach images or PDFs"
        style={{
          fontSize: variant === 'compact' ? 13 : 11,
          padding: variant === 'compact' ? '4px 6px' : '3px 10px',
          borderRadius: 100,
          cursor: disabled ? 'not-allowed' : 'pointer',
          border: '0.5px solid var(--lp-border)',
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--lp-text-muted)',
          fontFamily: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          opacity: disabled ? 0.4 : 1,
          transition: 'background 0.12s, color 0.12s'
        }}
        onMouseEnter={e => {
          if (!disabled) {
            e.currentTarget.style.background = 'rgba(59,130,246,0.10)'
            e.currentTarget.style.color = '#3b82f6'
          }
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          e.currentTarget.style.color = 'var(--lp-text-muted)'
        }}
      >
        {variant === 'compact' ? '📎' : label}
      </button>
    </>
  )
}