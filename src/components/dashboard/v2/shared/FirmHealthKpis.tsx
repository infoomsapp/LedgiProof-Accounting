// PATH: src/components/dashboard/v2/shared/FirmHealthKpis.tsx
//
// Shared widget: Financial Health KPIs (Income / Expenses / CashFlow / Outstanding).
// Used by both BookkeeperDashboard and AccountantDashboard.
//
// Pure presentation — receives pre-computed values, does no aggregation itself
// (Constitution: no backend logic in dashboards).
//
// Extracted from BookkeeperDashboard.tsx (Sprint Accountant — 2026-06-26).

import type { ReactNode } from 'react'
import { Wallet }                from 'lucide-react'
import SectionCard               from './SectionCard'
import KpiTile                   from './KpiTile'
import SourceTag                 from './SourceTag'
import { formatCurrency }        from '../../../../lib/currency'
import { useCountUp }            from '../../../../hooks/useCountUp'

export interface FirmHealthKpisProps {
  monthIncome:        number
  monthExpenses:      number
  monthIncomeCount:   number
  monthExpensesCount: number
  /** ISO 4217 currency code for display. Defaults to 'USD'. */
  currency?:          string
  /** Kept for compatibility; no longer rendered as its own tile (it was a
   *  duplicate of Income − Expenses and of the Insights cash-flow trend). */
  cashFlow?:          number
  outstandingTotal?:  number
  overdueCount?:      number
  onClickOutstanding?: () => void
  /** Optional slot rendered to the right of the KPIs (e.g. the semaphore
   *  donut) so money + automation health live in one unified card. */
  rightSlot?:         ReactNode
  /** Optional custom title — defaults to 'Financial Overview'. */
  title?:             string
}

export default function FirmHealthKpis({
  monthIncome,
  monthExpenses,
  monthIncomeCount,
  monthExpensesCount,
  currency = 'USD',
  outstandingTotal,
  overdueCount,
  onClickOutstanding,
  rightSlot,
  title = 'Financial Overview'
}: FirmHealthKpisProps) {
  const fmt      = (n: number) => formatCurrency(n, currency)
  const fmtShort = (n: number) => formatCurrency(n, currency, { compact: true })

  const incomeAnim      = useCountUp(monthIncome)
  const expensesAnim    = useCountUp(monthExpenses)
  const outstandingAnim = useCountUp(outstandingTotal ?? 0)

  return (
    <SectionCard
      title={title}
      icon={Wallet}
      accentColor="var(--sem-blue)"
      accentBg="var(--sem-blue-bg)"
      right={<SourceTag label="Bank feed" title="Income & expenses come from verified bank-feed transactions this month" />}
    >
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '14px 16px',
          flex: 1,
          minWidth: 200
        }}>
          <KpiTile
            label="Income (this month)"
            value={fmtShort(incomeAnim)}
            sub={`${monthIncomeCount} transactions`}
            color="var(--sem-green)"
          />
          <KpiTile
            label="Expenses"
            value={fmtShort(expensesAnim)}
            sub={`${monthExpensesCount} transactions`}
            color="var(--sem-red)"
          />
          {outstandingTotal !== undefined && (
            <KpiTile
              label="Outstanding"
              value={fmtShort(outstandingAnim)}
              sub={`${overdueCount ?? 0} overdue`}
              color="var(--lp-violet)"
              {...(onClickOutstanding ? { onClick: onClickOutstanding } : {})}
            />
          )}
        </div>

        {rightSlot && (
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
            {rightSlot}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
