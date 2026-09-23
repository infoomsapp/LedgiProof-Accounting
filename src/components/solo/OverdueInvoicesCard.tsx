// PATH: src/components/solo/OverdueInvoicesCard.tsx
//
// Solo — invoices vencidas. Surfacea las facturas impagas y pasadas de fecha
// para dar seguimiento al flujo de caja. Click → /invoices para actuar
// (imprimir/reenviar). El envío por email queda para cuando se cablee un
// proveedor de correo (como la edge function de invitaciones).

import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getOverdueInvoices } from '../../services/invoice.service'
import { formatCurrency } from '../../lib/currency'

const fmt = (n: number) => formatCurrency(n, 'USD', { maximumFractionDigits: 0 })

function daysOverdue(due: string): number {
  const ms = Date.now() - new Date(due + 'T00:00:00').getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export default function OverdueInvoicesCard({ orgId }: { orgId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: ['solo-overdue-invoices', orgId],
    queryFn:  () => getOverdueInvoices(orgId),
    enabled:  !!orgId,
    staleTime: 60_000
  })

  const rows = q.data ?? []
  const total = rows.reduce((s, r) => s + Number((r as any).balance_due ?? 0), 0)

  if (!q.isLoading && rows.length === 0) return null   // no vencidas → no ruido

  return (
    <div style={{
      background: 'var(--lp-surface)', border: '0.5px solid var(--sem-red-border)',
      borderRadius: 12, overflow: 'hidden', marginBottom: 16
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: '0.5px solid var(--lp-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sem-red)' }}>{t('solo.overdueInvoices')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            {t('solo.overdueInvoicesSub')}
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--sem-red)', fontFamily: 'monospace' }}>
          {fmt(total)}
        </div>
      </div>

      <div>
        {rows.slice(0, 5).map((r: any, i) => (
          <button
            key={r.id}
            onClick={() => navigate('/invoices')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              textAlign: 'left', gap: 10, padding: '10px 18px', fontFamily: 'inherit', cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderTop: i > 0 ? '0.5px solid var(--lp-border)' : 'none'
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--lp-text)' }}>
                {r.invoice_number} · {r.clients?.company_name ?? r.clients?.display_name ?? t('solo.clientFallback')}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--sem-red)', marginTop: 1 }}>
                {t('solo.daysOverdue', { count: daysOverdue(r.due_date) })}
              </div>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>
              {fmt(Number(r.balance_due))}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
