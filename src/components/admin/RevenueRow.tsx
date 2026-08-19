// PATH: src/components/admin/RevenueRow.tsx

import type { RevenueData } from '../../services/admin-command.service'
import KpiCard from './KpiCard'

export default function RevenueRow({ data }: { data: RevenueData }) {
  // ARR proyectado
  const arr = data.mrr_dollars * 12
  const conversionRate =
    data.trial_users > 0 ? ((data.conversions_30d / (data.conversions_30d + data.trial_users)) * 100).toFixed(1) : '—'

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        marginBottom: 8, fontWeight: 600
      }}>
        Revenue
        <span style={{
          textTransform: 'none', letterSpacing: 0,
          fontWeight: 400, color: '#475569', marginLeft: 8
        }}>
          · MRR · ARR · Trials
        </span>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
        <KpiCard
          label="MRR"
          value={`$${formatMoney(data.mrr_dollars)}`}
          subValue={`ARR proj. $${formatMoney(arr)}`}
          color="#22c55e"
          icon="💵"
          highlighted
        />
        <KpiCard
          label="Active subscriptions"
          value={data.active_subs}
          subValue="Paying + trialing"
          color="#3b82f6"
          icon="✅"
        />
        <KpiCard
          label="Trial users"
          value={data.trial_users}
          subValue="Pro 14d trial"
          color="#a78bfa"
          icon="🎁"
        />
        <KpiCard
          label="Conversions 30d"
          value={data.conversions_30d}
          subValue={typeof conversionRate === 'string' ? `Rate: ${conversionRate}` : '—'}
          color="#06b6d4"
          icon="📈"
        />
      </div>

      {/* Plan distribution bars */}
      <PlanDistribution data={data} />
    </div>
  )
}

function PlanDistribution({ data }: { data: RevenueData }) {
  const total =
    data.plan_distribution.starter +
    data.plan_distribution.entrepreneur +
    data.plan_distribution.bookkeeper +
    data.plan_distribution.accountant

  const plans = [
    { key: 'starter',      label: 'Starter',      count: data.plan_distribution.starter,      color: '#64748b', price: '$9.99'  },
    { key: 'entrepreneur', label: 'Entrepreneur', count: data.plan_distribution.entrepreneur, color: '#3b82f6', price: '$19.99' },
    { key: 'bookkeeper',   label: 'Bookkeeper',   count: data.plan_distribution.bookkeeper,   color: '#06b6d4', price: '$59.99' },
    { key: 'accountant',   label: 'Accountant',   count: data.plan_distribution.accountant,   color: '#a78bfa', price: '$69.99' }
  ]

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)'
    }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontWeight: 600
      }}>
        Plan distribution {total > 0 && <span style={{ color: '#475569' }}>· {total} subs</span>}
      </div>

      {/* Stacked bar */}
      {total > 0 && (
        <div style={{
          display: 'flex', height: 8, borderRadius: 100, overflow: 'hidden', marginBottom: 12
        }}>
          {plans.map(p => p.count > 0 && (
            <div
              key={p.key}
              title={`${p.label}: ${p.count}`}
              style={{
                width: `${(p.count / total) * 100}%`,
                background: p.color,
                transition: 'width 0.3s'
              }}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {plans.map(p => (
          <div key={p.key} style={{
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: p.color, flexShrink: 0
            }} />
            <span style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
              <strong style={{ color: 'var(--lp-text)' }}>{p.count}</strong> {p.label}
              <span style={{ color: '#475569', marginLeft: 4 }}>{p.price}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 10_000)    return (n / 1_000).toFixed(1) + 'k'
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}