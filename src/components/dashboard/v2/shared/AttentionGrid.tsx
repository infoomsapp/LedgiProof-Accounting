// PATH: src/components/dashboard/v2/AttentionGrid.tsx
//
// Grid of clickable attention cards.
// Each card: severity-tinted background, big count, label below.
//
// Replaces the previous static list with visually-prominent tiles
// that nudge the user toward action.

import type { ReactNode } from 'react'

export interface AttentionItem {
  /** Unique key for React */
  key:       string
  /** Big number shown */
  count:     number
  /** Label below the count (e.g. "Missing Receipts") */
  label:     string
  /** Severity tint */
  severity:  'critical' | 'warning' | 'info' | 'neutral'
  /** Optional icon (emoji or component) shown top-right */
  icon?:     ReactNode
  /** Click handler */
  onClick?:  () => void
}

interface Props {
  items: AttentionItem[]
  /** Columns count (default 4, can be 2-5) */
  columns?: number
}

const SEVERITY_TINTS = {
  critical: {
    bg:      'var(--sem-red-bg)',
    border:  'var(--sem-red-border)',
    color:   'var(--sem-red)',
    hoverBg: 'var(--sem-red-bg-strong)'
  },
  warning: {
    bg:      'var(--sem-amber-bg)',
    border:  'var(--sem-amber-border)',
    color:   'var(--sem-amber)',
    hoverBg: 'var(--sem-amber-bg-strong)'
  },
  info: {
    bg:      'var(--sem-blue-bg)',
    border:  'var(--sem-blue-border)',
    color:   'var(--sem-blue)',
    hoverBg: 'var(--sem-blue-bg-strong)'
  },
  neutral: {
    bg:      'var(--lp-surface-2)',
    border:  'var(--lp-border)',
    color:   'var(--lp-text-muted)',
    hoverBg: 'var(--lp-surface-2)'
  }
}

export default function AttentionGrid({ items, columns = 4 }: Props) {
  if (items.length === 0) {
    return (
      <div style={{
        padding: '20px 16px',
        textAlign: 'center',
        background: 'var(--sem-green-bg)',
        border: '0.5px solid var(--sem-green-border)',
        borderRadius: 8,
        fontSize: 11.5,
        color: 'var(--sem-green)'
      }}>
        ✓ All clear — nothing needs your attention right now.
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: 8
    }}>
      {items.map(item => {
        const tint = SEVERITY_TINTS[item.severity]
        const interactive = !!item.onClick

        return (
          <div
            key={item.key}
            onClick={item.onClick}
            style={{
              background: tint.bg,
              border: `0.5px solid ${tint.border}`,
              borderRadius: 8,
              padding: 10,
              cursor: interactive ? 'pointer' : 'default',
              transition: 'background 0.15s, border-color 0.15s',
              position: 'relative'
            }}
            onMouseEnter={e => {
              if (interactive) {
                e.currentTarget.style.background = tint.hoverBg
              }
            }}
            onMouseLeave={e => {
              if (interactive) {
                e.currentTarget.style.background = tint.bg
              }
            }}
          >
            {/* Icon top-right (optional) */}
            {item.icon && (
              <div style={{
                position: 'absolute',
                top: 8,
                right: 8,
                fontSize: 12,
                opacity: 0.6
              }}>
                {item.icon}
              </div>
            )}

            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: tint.color,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.1
            }}>
              {item.count}
            </div>
            <div style={{
              fontSize: 9.5,
              color: 'var(--lp-text-muted)',
              marginTop: 4,
              lineHeight: 1.3
            }}>
              {item.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}