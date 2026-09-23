// PATH: src/components/solo/RecurringSubscriptionsCard.tsx
//
// Solo — cargos recurrentes / suscripciones. Los detecta un RPC (misma huella
// de merchant + monto en ≥3 meses). Le muestra al solopreneur cuánto gasta al
// mes en suscripciones y el estimado anual — un ahorro concreto.

import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getRecurringSubscriptions } from '../../services/solo-dashboard.service'
import { formatCurrency } from '../../lib/currency'

const fmt = (n: number) => formatCurrency(n, 'USD', { maximumFractionDigits: 0 })

export default function RecurringSubscriptionsCard({ orgId }: { orgId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['solo-recurring', orgId],
    queryFn:  () => getRecurringSubscriptions(orgId),
    enabled:  !!orgId,
    staleTime: 5 * 60_000
  })

  const rows = q.data ?? []
  const monthlyTotal = rows.reduce((s, r) => s + Number(r.avg_amount), 0)

  return (
    <div style={{
      background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
      borderRadius: 12, overflow: 'hidden', marginBottom: 16
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: '0.5px solid var(--lp-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--lp-text)' }}>{t('solo.recurringSubscriptions')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            {t('solo.recurringSubscriptionsSub')}
          </div>
        </div>
        {rows.length > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--sem-red-soft)', fontFamily: 'monospace' }}>
              {fmt(monthlyTotal)}<span style={{ fontSize: 11, color: 'var(--lp-text-muted)' }}>{t('solo.perMonthSuffix')}</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)' }}>{t('solo.perYearApprox', { amount: fmt(monthlyTotal * 12) })}</div>
          </div>
        )}
      </div>

      <div style={{ padding: '6px 0' }}>
        {q.isLoading && <div style={{ padding: '12px 18px', fontSize: 12.5, color: 'var(--lp-text-muted)' }}>{t('solo.scanningTransactions')}</div>}
        {!q.isLoading && rows.length === 0 && (
          <div style={{ padding: '16px 18px', fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
            {t('solo.noRecurringDetected')}
          </div>
        )}
        {rows.slice(0, 6).map((r, i) => (
          <div key={r.display + i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 18px', borderTop: i > 0 ? '0.5px solid var(--lp-border)' : 'none'
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.display}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', marginTop: 1 }}>
                {t('solo.occurrencesLast', { count: r.occurrences, date: r.last_charge })}
              </div>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>
              {t('solo.amountPerMonth', { amount: fmt(Number(r.avg_amount)) })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
