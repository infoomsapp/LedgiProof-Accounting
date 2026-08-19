import type { SemaphoreStatus } from '../../types/database.types'

const CONFIG: Record<SemaphoreStatus, { label: string; color: string; bg: string; border: string }> = {
  blue:  { label: 'Blue',   color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.25)' },
  green: { label: 'Green',  color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.25)' },
  amber: { label: 'Amber',  color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.25)' },
  red:   { label: 'Red',    color: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.25)' }
}

interface SemaphoreBadgeProps {
  status:   SemaphoreStatus
  size?:    'sm' | 'md'
  showDot?: boolean
}

export default function SemaphoreBadge({ status, size = 'md', showDot = true }: SemaphoreBadgeProps) {
  const c = CONFIG[status]
  return (
    <span style={{
      display:     'inline-flex',
      alignItems:  'center',
      gap:         5,
      padding:     size === 'sm' ? '2px 7px' : '3px 9px',
      borderRadius: 100,
      fontSize:    size === 'sm' ? 10.5 : 11.5,
      fontWeight:  500,
      color:       c.color,
      background:  c.bg,
      border:      `0.5px solid ${c.border}`,
      whiteSpace:  'nowrap'
    }}>
      {showDot && (
        <span style={{
          width: size === 'sm' ? 5 : 6,
          height: size === 'sm' ? 5 : 6,
          borderRadius: '50%',
          background: c.color,
          boxShadow:  `0 0 5px ${c.color}`,
          flexShrink: 0
        }} />
      )}
      {c.label}
    </span>
  )
}

export { CONFIG as SEMAPHORE_CONFIG }

// ✅ FIX AQUÍ
export const SEMAPHORE_ORDER: SemaphoreStatus[] = ['blue', 'green', 'amber', 'red']