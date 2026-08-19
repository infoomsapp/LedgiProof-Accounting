import type { SemaphoreStatus } from '../../types/database.types'
import { SEMAPHORE_CONFIG } from './SemaphoreBadge'

type FilterValue = SemaphoreStatus | 'all'

interface SemaphoreFilterProps {
  value:    FilterValue
  onChange: (value: FilterValue) => void
  counts?:  Partial<Record<SemaphoreStatus | 'all', number>>
}

const OPTIONS: FilterValue[] = ['all', 'blue', 'green', 'amber', 'red']

export default function SemaphoreFilter({ value, onChange, counts }: SemaphoreFilterProps) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {OPTIONS.map(opt => {
        const isActive = value === opt
        const cfg      = opt !== 'all' ? SEMAPHORE_CONFIG[opt] : null
        const count    = counts?.[opt]

        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              display:     'inline-flex',
              alignItems:  'center',
              gap:         6,
              padding:     '5px 12px',
              borderRadius: 100,
              border:      isActive
                ? `0.5px solid ${cfg?.border ?? 'rgba(255,255,255,0.25)'}`
                : '0.5px solid var(--lp-border)',
              background: isActive
                ? (cfg?.bg ?? 'rgba(255,255,255,0.08)')
                : 'transparent',
              color:    isActive
                ? (cfg?.color ?? 'var(--lp-text)')
                : 'var(--lp-text-muted)',
              fontSize:   12.5,
              fontWeight: isActive ? 500 : 400,
              cursor:     'pointer',
              transition: 'all 0.12s'
            }}
          >
            {cfg && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background:  isActive ? cfg.color : 'var(--lp-text-muted)',
                boxShadow:   isActive ? `0 0 5px ${cfg.color}` : 'none',
                flexShrink:  0,
                transition:  'all 0.12s'
              }} />
            )}
            {opt === 'all' ? 'All' : cfg!.label}
            {count !== undefined && (
              <span style={{
                fontSize: 10.5,
                opacity:  0.6,
                marginLeft: 1
              }}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}