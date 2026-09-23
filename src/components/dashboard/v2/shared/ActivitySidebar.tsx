// PATH: src/components/dashboard/v2/ActivitySidebar.tsx
//
// Lateral activity feed (right sidebar in the 70/30 grid).
// Consistent across all dashboards.
//
// Each item: colored dot, primary text (with optional accent), sub-text, time ago.
// Auto-collapses to "show more" if items exceed max visible count.

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Radio } from 'lucide-react'
import SectionCard from './SectionCard'
import { formatDateShort } from '../../../../lib/dates'

export interface ActivityItem {
  /** Unique key for React */
  key:       string
  /** Dot color (semantic: green=ok, blue=info, amber=warn, red=alert, purple=event) */
  color:     'green' | 'blue' | 'amber' | 'red' | 'purple' | 'gray'
  /** Primary text (can include <strong> for emphasis via the accent prop instead) */
  text:      string
  /** Optional accent string highlighted inside the text (replaces the {accent} placeholder) */
  accent?:   string
  accentColor?: string
  /** Sub-text (smaller, below primary) */
  sub?:      string
  /** ISO timestamp for "x ago" computation */
  at:        string
  /** Optional click handler (e.g. navigate to detail) */
  onClick?:  () => void
}

interface Props {
  items: ActivityItem[]
  /** Max items shown before "show more" (default 6) */
  maxVisible?: number
  /** Live indicator (small green dot in header) */
  isLive?: boolean
  /** Optional header right slot ("View all →" link) */
  rightSlot?: React.ReactNode
}

const DOT_COLORS = {
  green:  'var(--sem-green)',
  blue:   'var(--sem-blue)',
  amber:  'var(--sem-amber)',
  red:    'var(--sem-red)',
  purple: 'var(--lp-violet)',
  gray:   'var(--lp-text-muted)'
}

export default function ActivitySidebar({
  items,
  maxVisible = 6,
  isLive = true,
  rightSlot
}: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const visibleItems = expanded ? items : items.slice(0, maxVisible)
  const hasMore = items.length > maxVisible

  return (
    <SectionCard
      title={t('dashboard.recentActivity')}
      icon={Radio}
      right={
        rightSlot ?? (isLive ? (
          <span style={{
            fontSize: 9,
            color: 'var(--sem-green)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: 50,
              background: 'var(--sem-green)',
              animation: 'lp-blink 1.6s ease-in-out infinite'
            }} />
            {t('dashboard.live')}
          </span>
        ) : null)
      }
    >
      {items.length === 0 ? (
        <div style={{
          padding: '20px 12px',
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--lp-text-muted)'
        }}>
          {t('dashboard.noRecentActivity')}
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 9
          }}>
            {visibleItems.map(item => (
              <ActivityRow key={item.key} item={item} />
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                width: '100%',
                marginTop: 11,
                padding: '5px 8px',
                background: 'transparent',
                border: '0.5px solid var(--lp-border)',
                borderRadius: 6,
                color: 'var(--lp-text-muted)',
                fontSize: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 0.15s, background 0.15s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--lp-text-muted)'
                e.currentTarget.style.background = 'var(--lp-surface-2)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--lp-text-muted)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {expanded
                ? t('dashboard.showLess')
                : t('dashboard.showMore', { count: items.length - maxVisible })}
            </button>
          )}
        </>
      )}

      <style>{`
        @keyframes lp-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>
    </SectionCard>
  )
}

// ── Single activity row ─────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  const { t } = useTranslation()
  const interactive = !!item.onClick
  const timeAgo = useMemo(() => formatRelativeTime(item.at, t), [item.at, t])

  return (
    <div
      onClick={item.onClick}
      style={{
        display: 'flex',
        gap: 9,
        cursor: interactive ? 'pointer' : 'default',
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
        width: 6,
        height: 6,
        background: DOT_COLORS[item.color],
        borderRadius: 50,
        flexShrink: 0,
        marginTop: 5
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10.5,
          color: 'var(--lp-text)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {item.accent
            ? renderWithAccent(item.text, item.accent, item.accentColor ?? DOT_COLORS[item.color])
            : item.text}
        </div>
        {item.sub && (
          <div style={{
            fontSize: 9,
            color: 'var(--lp-text-muted)',
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {item.sub} · {timeAgo}
          </div>
        )}
        {!item.sub && (
          <div style={{
            fontSize: 9,
            color: 'var(--lp-text-muted)',
            marginTop: 1
          }}>
            {timeAgo}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Replace {accent} placeholder in text with a colored span */
function renderWithAccent(text: string, accent: string, color: string) {
  // If text contains literal "{accent}", substitute. Otherwise just append.
  if (text.includes('{accent}')) {
    const parts = text.split('{accent}')
    return (
      <>
        {parts[0]}
        <strong style={{ color, fontWeight: 600 }}>{accent}</strong>
        {parts[1]}
      </>
    )
  }
  return text
}

/** Format an ISO timestamp as "5m", "2h", "3d", or full date */
function formatRelativeTime(iso: string, t: TFunction): string {
  const now = Date.now()
  const ts  = new Date(iso).getTime()
  if (isNaN(ts)) return ''
  const diffSec = Math.floor((now - ts) / 1000)

  if (diffSec < 60)   return t('dashboard.relSecondsAgo', { count: diffSec })
  if (diffSec < 3600) return t('dashboard.relMinutesAgo', { count: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('dashboard.relHoursAgo', { count: Math.floor(diffSec / 3600) })
  if (diffSec < 7 * 86400) return t('dashboard.relDaysAgo', { count: Math.floor(diffSec / 86400) })

  return formatDateShort(iso, { withYear: false })
}