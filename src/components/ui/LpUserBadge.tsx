// PATH: src/components/ui/LpUserBadge.tsx
// Displays a user's LP code with tier-colored styling.
// LPA-K7M2X9 → gold badge (admin)
// LPT-4H8R2N → purple badge (tester)
// LP-7K2M9X4 → grey badge (user)

import type { CSSProperties } from 'react'
import type { LpUserTier } from '../../types/database.types'
import { LP_TIER_CONFIG } from '../../types/database.types'

interface LpUserBadgeProps {
  code: string | null
  tier?: LpUserTier
  size?: 'sm' | 'md'
  showTier?: boolean
}

const SIZE_STYLES: Record<'sm' | 'md', CSSProperties> = {
  sm: {
    padding: '2px 7px',
    fontSize: 10.5
  },
  md: {
    padding: '3px 10px',
    fontSize: 12
  }
}

export default function LpUserBadge({
  code,
  tier = 'user',
  size = 'md',
  showTier = false
}: LpUserBadgeProps) {
  if (!code) return null

  const cfg = LP_TIER_CONFIG[tier]

  return (
    <span
      title={showTier ? `${code} · ${cfg.label}` : code}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        ...SIZE_STYLES[size],
        borderRadius: 100,
        background: cfg.bg,
        border: `0.5px solid ${cfg.border}`,
        fontFamily: 'monospace',
        fontWeight: 600,
        color: cfg.color,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        userSelect: 'text',
        lineHeight: 1.1
      }}
    >
      <span>{code}</span>

      {showTier && (
        <span
          style={{
            fontSize: size === 'sm' ? 8.5 : 9,
            fontWeight: 500,
            opacity: 0.75,
            fontFamily: 'inherit',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            lineHeight: 1
          }}
        >
          {cfg.label}
        </span>
      )}
    </span>
  )
}