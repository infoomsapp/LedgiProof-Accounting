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
import { useTranslation }        from 'react-i18next'
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
  /** Optional custom title — defaults to the translated 'Financial Overview'. */
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
  title
}: FirmHealthKpisProps) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t('dashboard.financialOverview')
  const fmt      = (n: number) => formatCurrency(n, currency)
  const fmtShort = (n: number) => formatCurrency(n, currency, { compact: true })

  const incomeAnim      = useCountUp(monthIncome)
  const expensesAnim    = useCountUp(monthExpenses)
  const outstandingAnim = useCountUp(outstandingTotal ?? 0)

  return (
    <SectionCard
      title={resolvedTitle}
      icon={Wallet}
      accentColor="var(--sem-blue)"
      accentBg="var(--sem-blue-bg)"
      right={<SourceTag label={t('dashboard.bankFeed')} title={t('dashboard.bankFeedTitle')} />}
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
            label={t('dashboard.incomeThisMonth')}
            value={fmtShort(incomeAnim)}
            sub={t('dashboard.transactionsCount', { count: monthIncomeCount })}
            color="var(--sem-green)"
          />
          <KpiTile
            label={t('dashboard.expenses')}
            value={fmtShort(expensesAnim)}
            sub={t('dashboard.transactionsCount', { count: monthExpensesCount })}
            color="var(--sem-red)"
          />
          {outstandingTotal !== undefined && (
            <KpiTile
              label={t('dashboard.outstanding')}
              value={fmtShort(outstandingAnim)}
              sub={t('dashboard.overdueCount', { count: overdueCount ?? 0 })}
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
