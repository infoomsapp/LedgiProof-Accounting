// PATH: src/components/ui/SemaphoreSpinner.tsx
//
// LedgiProof brand loading indicator.
// Uses the 4 semaphore colors (Blue → Green → Amber → Red) with staggered
// pulse animation. Matches the timing in index.html so users see a seamless
// transition: initial HTML loader → React mount → in-app loading states.
//
// Usage:
//   <SemaphoreSpinner />                      // full-screen, no label
//   <SemaphoreSpinner label="Loading…" />     // full-screen with label
//   <SemaphoreSpinner size="md" inline />     // inline 14px (button/form)
//   <SemaphoreSpinner size="sm" inline />     // inline 10px (compact)

import type { CSSProperties } from 'react'

type Size = 'full' | 'md' | 'sm'

interface Props {
  size?:   Size
  label?:  string
  /** When true, renders inline (for buttons/forms). Default: full-screen. */
  inline?: boolean
  /** Color override for monochrome contexts (e.g. inside a colored button) */
  monochrome?: string
}

const DOT_SIZE: Record<Size, number> = {
  full: 9,
  md:   7,
  sm:   5
}

const DOT_GAP: Record<Size, number> = {
  full: 8,
  md:   5,
  sm:   3
}

// Semaphore order: Blue → Green → Amber → Red (canonical)
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'] as const
const DELAYS = ['0s', '0.2s', '0.4s', '0.6s'] as const

export default function SemaphoreSpinner({
  size       = 'full',
  label,
  inline     = false,
  monochrome
}: Props) {

  const dotSize = DOT_SIZE[size]
  const dotGap  = DOT_GAP[size]

  // The dots themselves
  const dots = (
    <div style={{
      display: 'inline-flex',
      gap: dotGap,
      alignItems: 'center'
    }}>
      {COLORS.map((color, i) => (
        <span
          key={i}
          className="lp-sem-dot"
          style={{
            width:  dotSize,
            height: dotSize,
            borderRadius: '50%',
            background: monochrome ?? color,
            animationDelay: DELAYS[i],
            display: 'inline-block'
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  )

  // Inline: just the dots
  if (inline || size !== 'full') {
    return (
      <>
        {dots}
        <SemaphoreSpinnerStyles />
      </>
    )
  }

  // Full-screen: centered with optional label
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Loading'}
      style={fullScreenStyle}
    >
      {dots}
      {label && (
        <div style={{
          color: 'var(--lp-text-muted)',
          fontSize: 13,
          letterSpacing: '0.01em'
        }}>
          {label}
        </div>
      )}
      <SemaphoreSpinnerStyles />
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const fullScreenStyle: CSSProperties = {
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--lp-bg)',
  gap: 16
}

function SemaphoreSpinnerStyles() {
  return (
    <style>{`
      .lp-sem-dot {
        animation-name: lp-sem-pulse;
        animation-duration: 1.2s;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
        will-change: transform, opacity;
      }
      @keyframes lp-sem-pulse {
        0%, 100% { opacity: 0.30; transform: scale(0.80); }
        50%      { opacity: 1.00; transform: scale(1.20); }
      }
    `}</style>
  )
}