// PATH: src/components/dashboard/v2/CriticalAlertBanner.tsx
//
// Critical alert banner shown at the top of dashboards.
// Auto-hides when there's nothing to alert (count = 0).
//
// Replaces the "Today's Focus" widget — same purpose, more executive style.
//
// Severity-aware:
//   · red    → ≥1 critical items (overdue, missing, unreconciled)
//   · amber  → ≥1 warning items (pending, needs review)
//   · info   → informational (rarely used)

interface Props {
  /** Count of items needing attention (banner hides if 0) */
  count:    number
  /** Severity controls color */
  severity?: 'critical' | 'warning' | 'info'
  /** Title of the alert ("critical items", "pending reviews", etc.) */
  label:    string
  /** Sub-text (e.g. "need your attention today") */
  sub?:     string
  /** Click handler for "View →" link */
  onView?:  () => void
  /** Custom view label (default: "View →") */
  viewLabel?: string
}

const SEVERITY_COLORS = {
  critical: {
    border:   'var(--sem-red-border)',
    bg:       'linear-gradient(90deg, var(--sem-red-bg-strong), var(--sem-red-bg))',
    dot:      'var(--sem-red)',
    text:     'var(--sem-red)',
    boldText: 'var(--sem-red)'
  },
  warning: {
    border:   'var(--sem-amber-border)',
    bg:       'linear-gradient(90deg, var(--sem-amber-bg-strong), var(--sem-amber-bg))',
    dot:      'var(--sem-amber)',
    text:     'var(--sem-amber)',
    boldText: 'var(--sem-amber)'
  },
  info: {
    border:   'var(--sem-blue-border)',
    bg:       'linear-gradient(90deg, var(--sem-blue-bg-strong), var(--sem-blue-bg))',
    dot:      'var(--sem-blue)',
    text:     'var(--sem-blue)',
    boldText: 'var(--sem-blue)'
  }
}

export default function CriticalAlertBanner({
  count,
  severity = 'critical',
  label,
  sub,
  onView,
  viewLabel = 'View →'
}: Props) {
  // Auto-hide if nothing to show
  if (count <= 0) return null

  const colors = SEVERITY_COLORS[severity]

  return (
    <div style={{
      background: colors.bg,
      border: `0.5px solid ${colors.border}`,
      borderRadius: 9,
      padding: '9px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0
      }}>
        {/* Pulsing dot */}
        <div style={{
          width: 7,
          height: 7,
          background: colors.dot,
          borderRadius: 50,
          boxShadow: `0 0 8px ${colors.dot}`,
          flexShrink: 0,
          animation: 'lp-pulse 2s ease-in-out infinite'
        }} />

        <div style={{
          fontSize: 11.5,
          color: colors.text,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          <strong style={{ color: colors.boldText, fontWeight: 600 }}>
            {count} {label}
          </strong>
          {sub && <span style={{ marginLeft: 6 }}>{sub}</span>}
        </div>
      </div>

      {onView && (
        <button
          onClick={onView}
          style={{
            fontSize: 10.5,
            color: colors.text,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '2px 6px',
            opacity: 0.85,
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.85' }}
        >
          {viewLabel}
        </button>
      )}

      <style>{`
        @keyframes lp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.6; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}