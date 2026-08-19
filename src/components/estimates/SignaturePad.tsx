// PATH: src/components/estimates/SignaturePad.tsx
//
// Typed signature input — user writes their name in a regular input;
// we render it in a cursive font over a horizontal line to look like a signature.
//
// Legally valid in the US per the E-SIGN Act (2000) for ordinary contracts.
// More accessible than canvas-drawn signatures (mobile-friendly, screen-reader OK).

import type { CSSProperties } from 'react'

interface Props {
  /** The typed name */
  value:        string
  /** Called when the typed name changes */
  onChange:     (val: string) => void
  /** Disable input (after acceptance) */
  disabled?:    boolean
  /** Show validation error styling if true */
  hasError?:    boolean
  /** Placeholder for the input */
  placeholder?: string
  /** Label above the input */
  label?:       string
}

export default function SignaturePad({
  value,
  onChange,
  disabled = false,
  hasError = false,
  placeholder = 'Type your full legal name',
  label = 'Your signature'
}: Props) {
  const trimmed = value.trim()
  const isValid = trimmed.length >= 2

  return (
    <div>
      {label && (
        <div style={labelStyle}>
          {label}
        </div>
      )}

      {/* Signature preview area */}
      <div style={{
        position: 'relative',
        height: 60,
        background: '#fafafa',
        border: hasError
          ? '0.5px solid #ef4444'
          : isValid && !disabled
            ? '0.5px solid rgba(34,197,94,0.4)'
            : '0.5px solid #ddd',
        borderRadius: 8,
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        transition: 'border-color 0.2s'
      }}>
        {/* Horizontal line behind the signature */}
        <div style={{
          position: 'absolute',
          left: 16, right: 16, bottom: 18,
          height: 1,
          background: '#999'
        }} />

        {/* The typed name rendered as cursive */}
        {trimmed && (
          <span style={{
            fontFamily: '"Brush Script MT", "Lucida Handwriting", cursive',
            fontSize: 26,
            color: '#1a1a1a',
            zIndex: 1,
            paddingBottom: 12,
            letterSpacing: '0.02em',
            transform: 'rotate(-1.5deg)'
          }}>
            {trimmed}
          </span>
        )}

        {/* Placeholder when empty */}
        {!trimmed && (
          <span style={{
            fontSize: 12,
            color: '#aaa',
            fontStyle: 'italic',
            paddingBottom: 12
          }}>
            (your signature will appear here)
          </span>
        )}

        {/* Valid checkmark */}
        {isValid && !disabled && (
          <span style={{
            position: 'absolute',
            top: 8, right: 10,
            fontSize: 14,
            color: '#22c55e'
          }}>
            ✓
          </span>
        )}
      </div>

      {/* Text input below */}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="name"
        style={{
          width: '100%',
          padding: '11px 14px',
          fontSize: 14,
          background: disabled ? '#f5f5f5' : '#fff',
          color: '#1a1a1a',
          border: hasError
            ? '1px solid #ef4444'
            : '1px solid #d4d4d4',
          borderRadius: 8,
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box'
        }}
        onFocus={e => {
          if (!hasError) e.target.style.borderColor = '#3b82f6'
        }}
        onBlur={e => {
          if (!hasError) e.target.style.borderColor = '#d4d4d4'
        }}
      />

      {/* Legal disclaimer below */}
      <div style={{
        fontSize: 10.5,
        color: '#666',
        marginTop: 8,
        lineHeight: 1.5
      }}>
        By typing your name, you are providing an electronic signature with the same legal effect
        as a handwritten signature. This action is recorded with date, time, and IP address.
      </div>
    </div>
  )
}

const labelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#555',
  marginBottom: 7
}