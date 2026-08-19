// PATH: src/components/dashboard/v2/KpiTile.tsx
//
// Executive-style KPI: number is the protagonist (18px, weight 600),
// label is subtle (9.5px muted), optional sub-text (9px) and trend.
//
// Two variants:
//   · default:  label on top, big number below, optional sub
//   · iconRow:  small icon left, label center, number right (used in
//               Operational Health where we have icons per row)
//
// Used inside SectionCard via grid (2 or 4 columns per row).

import type { ReactNode, CSSProperties } from 'react'

interface KpiTileProps {
  label:   string
  value:   string | number
  /** Optional sub-text under the number (e.g. "↑ 12% vs Q1") */
  sub?:    string
  /** Color of the number (defaults to neutral white) */
  color?:  string
  /** Color of the sub-text (defaults to muted) */
  subColor?: string
  /** Optional click handler */
  onClick?: () => void
  /** Override outer styles */
  style?:  CSSProperties
}

export default function KpiTile({
  label,
  value,
  sub,
  color,
  subColor,
  onClick,
  style
}: KpiTileProps) {
  const interactive = !!onClick

  return (
    <div
      onClick={onClick}
      style={{
        cursor: interactive ? 'pointer' : 'default',
        transition: 'opacity 0.15s',
        ...style
      }}
      onMouseEnter={e => {
        if (interactive) e.currentTarget.style.opacity = '0.85'
      }}
      onMouseLeave={e => {
        if (interactive) e.currentTarget.style.opacity = '1'
      }}
    >
      <div style={{
        fontSize: 9.5,
        color: 'var(--lp-text-muted)',
        marginBottom: 3
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 18,
        fontWeight: 600,
        color: color ?? 'var(--lp-text)',
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.2
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 9,
          color: subColor ?? 'var(--lp-text-muted)',
          marginTop: 3
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Variant: KPI row with icon (for Operational Health style) ─────────────

interface KpiRowProps {
  icon:     ReactNode  // emoji or component
  iconBg:   string     // background tint for the icon square
  label:    string
  value:    string | number
  valueColor?: string
  onClick?: () => void
}

export function KpiRow({
  icon,
  iconBg,
  label,
  value,
  valueColor,
  onClick
}: KpiRowProps) {
  const interactive = !!onClick

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        cursor: interactive ? 'pointer' : 'default',
        padding: '2px 0',
        transition: 'opacity 0.15s'
      }}
      onMouseEnter={e => {
        if (interactive) e.currentTarget.style.opacity = '0.85'
      }}
      onMouseLeave={e => {
        if (interactive) e.currentTarget.style.opacity = '1'
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        minWidth: 0
      }}>
        <div style={{
          width: 26,
          height: 26,
          background: iconBg,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          flexShrink: 0
        }}>
          {icon}
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--lp-text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {label}
        </div>
      </div>
      <div style={{
        fontSize: 15,
        fontWeight: 600,
        color: valueColor ?? 'var(--lp-text)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0
      }}>
        {value}
      </div>
    </div>
  )
}