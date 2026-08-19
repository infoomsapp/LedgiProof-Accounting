// PATH: src/components/admin/SystemHealthRow.tsx

import type { SystemHealthData } from '../../services/admin-command.service'
import KpiCard from './KpiCard'

export default function SystemHealthRow({ data }: { data: SystemHealthData }) {
  return (
    <Section title="System health" description="Live activity across the platform">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KpiCard
          label="Active users today"
          value={data.users_active_today}
          subValue={`${data.users_active_7d} in 7d / ${data.total_users} total`}
          color="#3b82f6"
          icon="👥"
        />
        <KpiCard
          label="Transactions today"
          value={fmt(data.transactions_today)}
          subValue={`${fmt(data.transactions_7d)} in 7d`}
          color="#06b6d4"
          icon="📊"
        />
        <KpiCard
          label="Active organizations"
          value={data.active_organizations_7d}
          subValue={`${data.total_organizations} total · 7d window`}
          color="#22c55e"
          icon="🏢"
        />
        <KpiCard
          label="Impersonations 24h"
          value={data.impersonation_24h}
          subValue="Admin view-as actions"
          color="#a78bfa"
          icon="👁️"
        />
      </div>
    </Section>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function Section({
  title, description, children
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        marginBottom: 8, fontWeight: 600
      }}>
        {title}
        {description && (
          <span style={{
            textTransform: 'none', letterSpacing: 0,
            fontWeight: 400, color: '#475569', marginLeft: 8
          }}>
            · {description}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}