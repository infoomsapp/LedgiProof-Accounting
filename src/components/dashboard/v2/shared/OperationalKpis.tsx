// PATH: src/components/dashboard/v2/shared/OperationalKpis.tsx
//
// Shared widget: Operational Health KPIs (Active Clients / Pending Review / Unreconciled).
// Used by both BookkeeperDashboard and AccountantDashboard.
//
// Pure presentation — receives pre-computed values from useBookkeeperDashboard
// (or equivalent for Accountant). Constitution: no aggregation in dashboards.
//
// Extracted from BookkeeperDashboard.tsx (Sprint Accountant — 2026-06-26).

import { ListChecks, Users, Hourglass, Scale } from 'lucide-react'
import SectionCard       from './SectionCard'
import { KpiRow }        from './KpiTile'

export interface OperationalKpisProps {
  activeClients:    number
  pendingAmber:     number
  pendingRed:       number
  unreconciled:     number
  onClickClients?:      () => void
  onClickPending?:      () => void
  onClickUnreconciled?: () => void
  /** Optional custom title — defaults to 'Operational Health'. */
  title?:           string
}

export default function OperationalKpis({
  activeClients,
  pendingAmber,
  pendingRed,
  unreconciled,
  onClickClients,
  onClickPending,
  onClickUnreconciled,
  title = 'Operational Health'
}: OperationalKpisProps) {
  const totalPending = pendingAmber + pendingRed
  const pendingColor = pendingRed > 0
    ? 'var(--sem-red)'
    : 'var(--sem-amber)'

  return (
    <SectionCard title={title} icon={ListChecks}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <KpiRow
          icon={<Users size={13} color="var(--sem-green)" />}
          iconBg="var(--sem-green-bg)"
          label="Active Clients"
          value={activeClients}
          valueColor="var(--sem-green)"
          {...(onClickClients ? { onClick: onClickClients } : {})}
        />
        <KpiRow
          icon={<Hourglass size={13} color={pendingColor} />}
          iconBg="var(--sem-amber-bg)"
          label="Pending Review"
          value={totalPending}
          valueColor={pendingColor}
          {...(onClickPending ? { onClick: onClickPending } : {})}
        />
        <KpiRow
          icon={<Scale size={13} color={unreconciled > 0 ? 'var(--sem-red)' : 'var(--sem-green)'} />}
          iconBg="var(--sem-red-bg)"
          label="Unreconciled"
          value={unreconciled}
          valueColor={unreconciled > 0 ? 'var(--sem-red)' : 'var(--sem-green)'}
          {...(onClickUnreconciled ? { onClick: onClickUnreconciled } : {})}
        />
      </div>
    </SectionCard>
  )
}
