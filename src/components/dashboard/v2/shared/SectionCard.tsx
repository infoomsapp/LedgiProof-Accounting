// PATH: src/components/dashboard/v2/SectionCard.tsx
//
// Uniform card with a section title and content slot.
// Used by all dashboard sections (Financial Health, Operational Health,
// Attention, Workflow, etc.) for visual consistency.
//
// Title style: uppercase, muted, optional emoji prefix.
// Right slot: optional (count badge, "View all →" link, controls).

import type { ReactNode, CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  /** Section title (will be uppercased) */
  title:      string
  /** Optional icon shown before the title */
  icon?:      LucideIcon
  /** Optional right-aligned slot (count, link, controls) */
  right?:     ReactNode
  /** Section body */
  children:   ReactNode
  /** Override outer styles (margin etc.) */
  style?:     CSSProperties
  /** Color tint for the title (default: muted) */
  titleColor?: string
  /** Compact mode (less padding) */
  compact?:   boolean
  /**
   * Accent color for a top border stripe + tinted header band (e.g.
   * 'var(--sem-blue)' + its matching bg token is resolved by the caller
   * via accentBg). Omit for a neutral, unaccented card.
   */
  accentColor?: string
  /** Tinted background for the header band — pair with accentColor (e.g. 'var(--sem-blue-bg)') */
  accentBg?:    string
}

export default function SectionCard({
  title,
  icon: Icon,
  right,
  children,
  style,
  titleColor,
  compact = false,
  accentColor,
  accentBg
}: Props) {
  // `padding` in `style` historically zeroed out the card's own padding (e.g.
  // "Pending Documents", which renders a full-bleed list). Header/body now
  // carry their own padding, so pull it out and apply it to the body only —
  // everything else in `style` (margin etc.) still targets the outer card.
  const { padding: bodyPaddingOverride, ...outerStyle } = style ?? {}

  return (
    <div className="lp-section-card" style={{
      borderTop: accentColor ? `2px solid ${accentColor}` : undefined,
      overflow: 'hidden',
      ...outerStyle
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        padding: compact ? '10px 14px' : '11px 16px',
        background: accentBg,
        borderBottom: accentBg ? `0.5px solid ${accentColor ?? 'var(--lp-border)'}` : undefined
      }}>
        <div style={{
          fontSize: 9.5,
          color: titleColor ?? 'var(--lp-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0
        }}>
          {Icon && <Icon size={12.5} strokeWidth={2.25} aria-hidden style={{ flexShrink: 0, color: accentColor ?? 'currentColor' }} />}
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {title}
          </span>
        </div>

        {right && (
          <div style={{ flexShrink: 0, fontSize: 10 }}>
            {right}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: bodyPaddingOverride ?? (compact ? '12px 14px' : '14px 16px') }}>{children}</div>
    </div>
  )
}