// PATH: src/components/error/ErrorFallback.tsx
//
// UI shown by ErrorBoundary when a wrapped section crashes.
// Branded, friendly, with recovery actions.

interface ErrorFallbackProps {
  error?:        Error | null
  /** Reset the boundary (re-render children) */
  onReset?:      () => void
  /** Section name for context, e.g. "dashboard" */
  section?:      string
  /** Show technical details (dev only) */
  showDetails?:  boolean
}

export default function ErrorFallback({
  error,
  onReset,
  section = 'this section',
  showDetails = false
}: ErrorFallbackProps) {
  return (
    <div style={{
      minHeight: 300,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
      gap: 14
    }}>
      <div style={{ fontSize: 44 }}>🛠️</div>

      <div>
        <h2 style={{
          fontSize: 17, fontWeight: 600, color: 'var(--lp-text)',
          margin: 0, marginBottom: 6
        }}>
          Something went wrong loading {section}
        </h2>
        <p style={{
          fontSize: 13, color: 'var(--lp-text-muted)',
          margin: 0, maxWidth: 380, lineHeight: 1.5
        }}>
          We hit an unexpected error. Your data is safe — this is just a display
          issue. Try reloading; if it persists, contact support.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        {onReset && (
          <button
            onClick={onReset}
            style={{
              padding: '8px 16px', borderRadius: 8,
              background: 'rgba(59,130,246,0.12)',
              border: '0.5px solid rgba(59,130,246,0.35)',
              color: '#60a5fa', fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            ↻ Try again
          </button>
        )}
        <button
          onClick={() => { window.location.href = '/' }}
          style={{
            padding: '8px 16px', borderRadius: 8,
            background: 'transparent',
            border: '0.5px solid var(--lp-border)',
            color: 'var(--lp-text-muted)', fontSize: 12.5,
            cursor: 'pointer', fontFamily: 'inherit'
          }}
        >
          Go to home
        </button>
      </div>

      {showDetails && error && (
        <details style={{
          marginTop: 14, maxWidth: 480, width: '100%',
          textAlign: 'left'
        }}>
          <summary style={{
            fontSize: 11, color: '#64748b', cursor: 'pointer',
            userSelect: 'none'
          }}>
            Technical details
          </summary>
          <pre style={{
            marginTop: 8, padding: 12, borderRadius: 8,
            background: 'rgba(239,68,68,0.06)',
            border: '0.5px solid rgba(239,68,68,0.20)',
            color: '#fca5a5', fontSize: 11,
            overflow: 'auto', maxHeight: 200,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word'
          }}>
            {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        </details>
      )}
    </div>
  )
}