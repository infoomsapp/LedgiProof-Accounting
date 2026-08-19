// PATH: src/components/admin/RiskRow.tsx

import type { RiskData } from '../../services/admin-command.service'
import KpiCard from './KpiCard'

export default function RiskRow({ data }: { data: RiskData }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        marginBottom: 8, fontWeight: 600
      }}>
        Risk &amp; AI performance
        <span style={{
          textTransform: 'none', letterSpacing: 0,
          fontWeight: 400, color: '#475569', marginLeft: 8
        }}>
          · Semaphore distribution + auto-resolution rate
        </span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10
      }}>
        {/* Semaphore distribution */}
        <SemaphoreDistribution data={data} />

        {/* AI gauge */}
        <AiGauge pctResolved={data.pct_resolved} totalReview={data.requires_review} />
      </div>
    </div>
  )
}

function SemaphoreDistribution({ data }: { data: RiskData }) {
  const total = data.red_total + data.amber_total + data.green_total + data.blue_total
  const segments = [
    { key: 'red',   label: 'Red',   count: data.red_total,   color: '#ef4444', icon: '🔴' },
    { key: 'amber', label: 'Amber', count: data.amber_total, color: '#f59e0b', icon: '🟡' },
    { key: 'green', label: 'Green', count: data.green_total, color: '#22c55e', icon: '🟢' },
    { key: 'blue',  label: 'Blue',  count: data.blue_total,  color: '#3b82f6', icon: '🔵' }
  ]

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)'
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 12
      }}>
        <span style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600
        }}>
          Transactions by semaphore
        </span>
        <span style={{ fontSize: 11.5, color: '#475569' }}>
          {total.toLocaleString('en-US')} total
        </span>
      </div>

      {/* Stacked bar */}
      {total > 0 && (
        <div style={{
          display: 'flex', height: 10, borderRadius: 100, overflow: 'hidden', marginBottom: 14
        }}>
          {segments.map(s => s.count > 0 && (
            <div
              key={s.key}
              title={`${s.label}: ${s.count}`}
              style={{
                width: `${(s.count / total) * 100}%`,
                background: s.color,
                transition: 'width 0.3s'
              }}
            />
          ))}
        </div>
      )}

      {/* Counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {segments.map(s => (
          <div key={s.key} style={{
            padding: '8px 10px', borderRadius: 8,
            background: `${s.color}10`,
            border: `0.5px solid ${s.color}30`
          }}>
            <div style={{
              fontSize: 10, color: s.color, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3
            }}>
              {s.icon} {s.label}
            </div>
            <div style={{
              fontSize: 18, fontWeight: 700, color: s.color, letterSpacing: '-0.01em'
            }}>
              {s.count.toLocaleString('en-US')}
            </div>
            {total > 0 && (
              <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                {((s.count / total) * 100).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>

      {data.requires_review > 0 && (
        <div style={{
          marginTop: 12, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(245,158,11,0.06)',
          border: '0.5px solid rgba(245,158,11,0.25)',
          fontSize: 11.5, color: '#fbbf24'
        }}>
          ⚠ <strong>{data.requires_review}</strong> transactions explicitly flagged{' '}
          <code style={{ color: 'var(--lp-text-muted)' }}>requires_review = TRUE</code>
        </div>
      )}
    </div>
  )
}

function AiGauge({ pctResolved, totalReview }: { pctResolved: number; totalReview: number }) {
  // Color based on resolution rate
  const color =
    pctResolved >= 90 ? '#22c55e' :
    pctResolved >= 75 ? '#3b82f6' :
    pctResolved >= 60 ? '#f59e0b' :
                        '#ef4444'

  const label =
    pctResolved >= 90 ? 'Excellent' :
    pctResolved >= 75 ? 'Good' :
    pctResolved >= 60 ? 'Fair' :
                        'Needs attention'

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'var(--lp-surface)',
      border: `0.5px solid ${color}40`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontWeight: 600
      }}>
        Auto-resolved
      </div>

      {/* Big number */}
      <div style={{
        fontSize: 42, fontWeight: 800, color, letterSpacing: '-0.03em',
        lineHeight: 1, marginBottom: 4
      }}>
        {pctResolved.toFixed(1)}%
      </div>

      <div style={{
        fontSize: 11, color, fontWeight: 600,
        padding: '2px 9px', borderRadius: 100,
        background: `${color}15`, border: `0.5px solid ${color}40`,
        marginBottom: 8
      }}>
        {label}
      </div>

      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)', textAlign: 'center', lineHeight: 1.5
      }}>
        Blue + Green / total
      </div>
    </div>
  )
}