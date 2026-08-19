// PATH: src/components/dashboard/v2/SemaphoreDonut.tsx
//
// Donut chart of semaphore distribution. Replaces 4 separate boxes.
// Pure SVG — no chart library needed.
//
// Canonical semaphore order: blue → green → amber → red
//
// Renders:
//   · The donut (4 arcs, color-coded, animated draw-in on mount)
//   · Center label: % of "green" (or "healthy %")
//   · Legend below: name, count, % per semaphore

import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../../../../lib/motion'

interface SemaphoreCounts {
  blue:  number
  green: number
  amber: number
  red:   number
}

interface Props {
  counts:    SemaphoreCounts
  /** Diameter of the donut in px (default 100) */
  size?:     number
  /** Stroke thickness (default 13) */
  thickness?: number
  /** Show legend below (default true) */
  showLegend?: boolean
}

const SEMAPHORE_COLORS = {
  blue:  'var(--sem-blue)',
  green: 'var(--sem-green)',
  amber: 'var(--sem-amber)',
  red:   'var(--sem-red)'
}

const SEMAPHORE_LABELS = {
  blue:  'Blue',
  green: 'Green',
  amber: 'Amber',
  red:   'Red'
}

export default function SemaphoreDonut({
  counts,
  size = 105,
  thickness = 13,
  showLegend = true
}: Props) {
  const [revealed, setRevealed] = useState(prefersReducedMotion())
  useEffect(() => {
    if (revealed) return
    // setTimeout, not requestAnimationFrame — rAF is suspended entirely for a
    // hidden/backgrounded tab (e.g. opened in a background tab, prerendered),
    // which would leave the donut permanently collapsed at 0. A short timeout
    // still fires in that case, just possibly throttled.
    const t = setTimeout(() => setRevealed(true), 30)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = counts.blue + counts.green + counts.amber + counts.red

  // Avoid division by zero — render empty donut
  if (total === 0) {
    return (
      <div style={{ textAlign: 'center' }}>
        <svg viewBox="0 0 100 100" style={{ width: size, height: size, display: 'block', margin: '0 auto' }}>
          <circle
            cx="50" cy="50" r="36"
            fill="none"
            stroke="var(--lp-border)"
            strokeWidth={thickness}
          />
          <text x="50" y="55" textAnchor="middle" fill="var(--lp-text-muted)" fontSize="11" fontWeight="500">
            no data
          </text>
        </svg>
      </div>
    )
  }

  // Percentages (use canonical order: blue, green, amber, red)
  const pct = {
    blue:  (counts.blue  / total) * 100,
    green: (counts.green / total) * 100,
    amber: (counts.amber / total) * 100,
    red:   (counts.red   / total) * 100
  }

  // Arc circumference for r=36
  const circumference = 2 * Math.PI * 36  // ≈226.19

  // Compute arc dash patterns in canonical order
  // Each arc's length = circumference × (pct/100)
  const greenLen = circumference * (pct.green / 100)
  const amberLen = circumference * (pct.amber / 100)
  const redLen   = circumference * (pct.red   / 100)
  const blueLen  = circumference * (pct.blue  / 100)

  // Cumulative offsets (where each arc starts after the previous)
  const greenOffset = 0
  const amberOffset = -greenLen
  const redOffset   = -(greenLen + amberLen)
  const blueOffset  = -(greenLen + amberLen + redLen)

  // Center label: % healthy = green only (most common UX convention)
  const healthyPct = Math.round(pct.green)

  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 100 100" style={{ width: size, height: size, display: 'block', margin: '0 auto' }}>
        {/* Background ring (subtle) */}
        <circle
          cx="50" cy="50" r="36"
          fill="none"
          stroke="var(--lp-border)"
          strokeWidth={thickness}
          opacity={0.4}
        />

        {/* Green arc (largest typically) */}
        {pct.green > 0 && (
          <circle
            cx="50" cy="50" r="36"
            fill="none"
            stroke={SEMAPHORE_COLORS.green}
            strokeWidth={thickness}
            strokeDasharray={`${revealed ? greenLen : 0} ${circumference}`}
            strokeDashoffset={greenOffset}
            transform="rotate(-90 50 50)"
            strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
          />
        )}

        {/* Amber arc */}
        {pct.amber > 0 && (
          <circle
            cx="50" cy="50" r="36"
            fill="none"
            stroke={SEMAPHORE_COLORS.amber}
            strokeWidth={thickness}
            strokeDasharray={`${revealed ? amberLen : 0} ${circumference}`}
            strokeDashoffset={amberOffset}
            transform="rotate(-90 50 50)"
            strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
          />
        )}

        {/* Red arc */}
        {pct.red > 0 && (
          <circle
            cx="50" cy="50" r="36"
            fill="none"
            stroke={SEMAPHORE_COLORS.red}
            strokeWidth={thickness}
            strokeDasharray={`${revealed ? redLen : 0} ${circumference}`}
            strokeDashoffset={redOffset}
            transform="rotate(-90 50 50)"
            strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
          />
        )}

        {/* Blue arc */}
        {pct.blue > 0 && (
          <circle
            cx="50" cy="50" r="36"
            fill="none"
            stroke={SEMAPHORE_COLORS.blue}
            strokeWidth={thickness}
            strokeDasharray={`${revealed ? blueLen : 0} ${circumference}`}
            strokeDashoffset={blueOffset}
            transform="rotate(-90 50 50)"
            strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
          />
        )}

        {/* Center label */}
        <text
          x="50" y="48"
          textAnchor="middle"
          fill={SEMAPHORE_COLORS.green}
          fontSize="15"
          fontWeight="700"
        >
          {healthyPct}%
        </text>
        <text
          x="50" y="59"
          textAnchor="middle"
          fill="var(--lp-text-muted)"
          fontSize="6.5"
        >
          healthy
        </text>
      </svg>

      {showLegend && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          marginTop: 10
        }}>
          {/* Canonical order: blue → green → amber → red */}
          {(['green', 'amber', 'red', 'blue'] as const).map(key => (
            <div key={key} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 10
            }}>
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--lp-text-muted)'
              }}>
                <span style={{
                  width: 7,
                  height: 7,
                  background: SEMAPHORE_COLORS[key],
                  borderRadius: 50
                }} />
                {SEMAPHORE_LABELS[key]}
              </span>
              <span style={{
                color: SEMAPHORE_COLORS[key],
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums'
              }}>
                {Math.round(pct[key])}%
                <span style={{ color: 'var(--lp-text-muted)', fontWeight: 400, marginLeft: 4, fontSize: 9 }}>
                  ({counts[key]})
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}