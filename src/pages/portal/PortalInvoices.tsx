// PATH: src/pages/portal/PortalInvoices.tsx
//
// Invoices for a firm-invited client_portal_users member -- the counterpart
// to ClientInvoices.tsx (which serves the OTHER client population, the
// self-service PYME org/profile.client_id tier reached via /client). Kept
// as its own page rather than shared, matching PortalShell.tsx's own stated
// reason for not reusing ClientPortalShell: two different products, kept
// behind two different navs on purpose.
//
// invoices_client_select's RLS (is_client_user() AND client_id =
// current_client_id()) covers this population too: accept_client_portal_invitation()
// now syncs profiles.user_type/client_id on accept (see the client-portal
// root-cause fix earlier this session), so a client_portal_users member's
// profile carries the same fields this policy actually reads.

import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { ClientPortalMembership } from '../../store/client-portal.store'
import {
  getInvoices, getInvoice, markInvoiceSent,
  type InvoiceWithClient
} from '../../services/invoice.service'
import { createInvoiceCheckoutSession } from '../../services/stripe.service'
import { INVOICE_STATUS_CONFIG, type InvoiceItem, type InvoicePayment } from '../../types/database.types'
import { formatCurrency } from '../../lib/currency'
import { formatDateShort } from '../../lib/dates'
import Icon from '../../components/ui/Icon'
import SemaphoreSpinner from '../../components/ui/SemaphoreSpinner'
import { useQuery } from '@tanstack/react-query'

type InvoiceDetail = InvoiceWithClient & { items: InvoiceItem[]; payments: InvoicePayment[] }

export default function PortalInvoices() {
  const membership = useOutletContext<ClientPortalMembership>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['portal-invoices', membership.orgId, membership.clientId],
    queryFn: () => getInvoices(membership.orgId, { clientId: membership.clientId }),
  })

  const invoices = (listQuery.data ?? []).filter(inv => inv.status !== 'draft')

  const detailQuery = useQuery({
    queryKey: ['portal-invoice-detail', selectedId, membership.orgId],
    queryFn: () => getInvoice(selectedId as string, membership.orgId) as Promise<InvoiceDetail>,
    enabled: !!selectedId,
  })

  async function handlePay(inv: InvoiceWithClient) {
    if (paying) return
    setPaying(true)
    setPayError(null)
    try {
      const token = inv.public_token ?? (await markInvoiceSent(inv.id)).token
      const url = await createInvoiceCheckoutSession(token)
      window.location.href = url
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : 'Payment unavailable. Please try again.')
      setPaying(false)
    }
  }

  const detail = detailQuery.data

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* ─────────────────────── Left: invoice list ────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, padding: '28px 32px', overflowY: 'auto' }}>
        <h1 className="lp-page-title">Invoices</h1>
        <p className="lp-page-sub">From {membership.orgName}</p>

        <div style={{ height: 8 }} />

        {listQuery.isLoading && (
          <div style={{ padding: 36, display: 'flex', justifyContent: 'center' }}>
            <SemaphoreSpinner size="sm" inline />
          </div>
        )}

        {listQuery.isError && (
          <div style={{
            padding: '12px 14px', background: 'var(--sem-red-bg)',
            border: '0.5px solid var(--sem-red)', borderRadius: 8,
            color: 'var(--sem-red)', fontSize: 12.5, marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <Icon name="warning" size={13} /> Could not load invoices.
          </div>
        )}

        {listQuery.isSuccess && invoices.length === 0 && (
          <div className="lp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, opacity: 0.6 }}>
              <Icon name="invoices" size={32} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
              No invoices yet
            </div>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
              Invoices {membership.orgName} sends you will show up here.
            </div>
          </div>
        )}

        {listQuery.isSuccess && invoices.length > 0 && (
          <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '110px 1fr 90px 110px',
              gap: 12, padding: '10px 14px', background: 'var(--lp-surface-2)',
              borderBottom: '0.5px solid var(--lp-border)', fontSize: 10,
              color: 'var(--lp-text-muted)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em'
            }}>
              <div>Invoice</div>
              <div>Due</div>
              <div>Status</div>
              <div style={{ textAlign: 'right' }}>Balance</div>
            </div>
            {invoices.map((inv, i) => {
              const cfg = INVOICE_STATUS_CONFIG[inv.status]
              const isSelected = selectedId === inv.id
              const balance = Number(inv.balance_due ?? inv.total)
              return (
                <button
                  key={inv.id}
                  onClick={() => setSelectedId(inv.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '110px 1fr 90px 110px',
                    gap: 12, padding: '11px 14px', width: '100%', textAlign: 'left',
                    borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)',
                    border: 'none', borderBottomWidth: 0,
                    cursor: 'pointer', fontSize: 12.5, color: 'var(--lp-text)', fontFamily: 'inherit',
                    background: isSelected ? 'var(--lp-surface-2)' : 'var(--lp-surface)',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{inv.invoice_number}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                    {inv.due_date ? formatDateShort(inv.due_date) : '—'}
                  </div>
                  <div>
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 100,
                      color: cfg.color, background: cfg.bg, border: `0.5px solid ${cfg.border}`
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{
                    fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600, textAlign: 'right',
                    color: balance > 0 ? 'var(--sem-red)' : 'var(--sem-green)'
                  }}>
                    {formatCurrency(balance, inv.currency ?? 'USD')}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────── Right: invoice detail ─────────────────────── */}
      {selectedId && (
        <div style={{
          width: 400, flexShrink: 0, borderLeft: '0.5px solid var(--lp-border)',
          background: 'var(--lp-surface)', display: 'flex', flexDirection: 'column',
          minHeight: 0, overflowY: 'auto'
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '0.5px solid var(--lp-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {detail?.invoice_number ?? 'Invoice'}
            </div>
            <button
              onClick={() => setSelectedId(null)}
              title="Close"
              style={{ background: 'transparent', border: 'none', color: 'var(--lp-text-muted)', cursor: 'pointer', padding: '2px 6px', display: 'flex' }}
            >
              <Icon name="xCircle" size={16} />
            </button>
          </div>

          <div style={{ padding: 16, flex: 1 }}>
            {detailQuery.isLoading && (
              <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
                <SemaphoreSpinner size="sm" inline />
              </div>
            )}

            {detail && (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
                  <tbody>
                    {detail.items.map(it => (
                      <tr key={it.id} style={{ borderBottom: '0.5px solid var(--lp-border)' }}>
                        <td style={{ padding: '7px 0', color: 'var(--lp-text)' }}>{it.description}</td>
                        <td style={{ padding: '7px 0', textAlign: 'right', fontFamily: 'monospace', color: 'var(--lp-text-muted)' }}>
                          {formatCurrency(Number(it.line_total ?? 0), detail.currency ?? 'USD')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ fontSize: 12.5, marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--lp-border)', fontWeight: 700 }}>
                    <span>Total</span>
                    <span style={{ fontFamily: 'monospace' }}>{formatCurrency(Number(detail.total), detail.currency ?? 'USD')}</span>
                  </div>
                  {Number(detail.amount_paid ?? 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--sem-green)' }}>
                      <span>Paid</span>
                      <span style={{ fontFamily: 'monospace' }}>−{formatCurrency(Number(detail.amount_paid), detail.currency ?? 'USD')}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--lp-border)', fontWeight: 800, fontSize: 14 }}>
                    <span>Balance due</span>
                    <span style={{ fontFamily: 'monospace', color: Number(detail.balance_due) > 0 ? 'var(--sem-red)' : 'var(--sem-green)' }}>
                      {formatCurrency(Number(detail.balance_due ?? detail.total), detail.currency ?? 'USD')}
                    </span>
                  </div>
                </div>

                {Number(detail.balance_due ?? detail.total) > 0 && detail.status !== 'void' && (
                  <button
                    onClick={() => handlePay(detail)}
                    disabled={paying}
                    style={{
                      width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                      background: paying ? 'var(--lp-border)' : 'var(--lp-accent)',
                      color: '#fff', fontWeight: 700, fontSize: 13.5,
                      cursor: paying ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {paying ? 'Redirecting to payment…' : `Pay ${formatCurrency(Number(detail.balance_due ?? detail.total), detail.currency ?? 'USD')} securely`}
                  </button>
                )}
                {payError && (
                  <p style={{ marginTop: 8, fontSize: 11.5, color: 'var(--sem-red)', textAlign: 'center' }}>{payError}</p>
                )}
                <p style={{ marginTop: 10, fontSize: 10.5, color: 'var(--lp-text-muted)', textAlign: 'center' }}>
                  Powered by Stripe · SSL encrypted
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
