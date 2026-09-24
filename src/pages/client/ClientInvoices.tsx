// PATH: src/pages/client/ClientInvoices.tsx
//
// Client's own invoices, view + pay online. Same idea as ClientTransactions.tsx
// (list on the left, detail on the right), but for invoices: this is the
// authenticated-portal counterpart to the public /i/:token page — a client
// who's logged into the portal shouldn't have to hunt down a copy-pasted
// link to see what they owe.
//
// Access (RLS, not this page): invoices_client_select already restricted
// this table to `is_client_user() AND client_id = current_client_id()` --
// that policy existed before this page did, generic-purpose. This page adds
// its own rule on top: drafts are filtered out client-side, since a draft is
// the accountant's own work-in-progress, not something a client should see.
//
// Payment: every non-draft invoice should already carry a public_token (set
// by markInvoiceSent() when the accountant sends it) -- but status can also
// be changed directly via updateInvoice(), so this defensively lazy-creates
// the token via the same markInvoiceSent() call before checkout if one is
// somehow missing, rather than blocking payment on an accountant oversight.

import { useState } from 'react'
import { useClientContext } from '../../hooks/useClientContext'
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

export default function ClientInvoices() {
  const { clientId, orgId, loading: ctxLoading } = useClientContext()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['client-invoices', orgId, clientId],
    queryFn: () => getInvoices(orgId as string, { clientId }),
    enabled: !!orgId && !!clientId,
  })

  // A draft is the accountant's own work-in-progress -- never shown here,
  // same boundary the accountant-side editor already enforces by hiding
  // "Send" until they're ready.
  const invoices = (listQuery.data ?? []).filter(inv => inv.status !== 'draft')

  const detailQuery = useQuery({
    queryKey: ['client-invoice-detail', selectedId, orgId],
    queryFn: () => getInvoice(selectedId as string, orgId as string) as Promise<InvoiceDetail>,
    enabled: !!selectedId && !!orgId,
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

  if (ctxLoading) {
    return (
      <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
        <SemaphoreSpinner size="md" inline />
      </div>
    )
  }

  if (!clientId) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, opacity: 0.5 }}>
          <Icon name="lock" size={28} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)' }}>
          No client linked to your account
        </div>
        <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 6, maxWidth: 420, margin: '6px auto 0' }}>
          Your bookkeeper needs to link your account before you can view invoices.
        </div>
      </div>
    )
  }

  const detail = detailQuery.data

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>

      {/* ─────────────────────── Left: invoice list ────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, padding: '24px 28px', overflowY: 'auto' }}>
        <h1 className="lp-page-title" style={{ margin: 0 }}>My Invoices</h1>
        <p className="lp-page-sub" style={{ margin: '4px 0 18px 0' }}>
          Click an invoice to see its detail and pay online.
        </p>

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
            <button
              onClick={() => listQuery.refetch()}
              style={{
                marginLeft: 'auto', background: 'transparent',
                border: '0.5px solid var(--sem-red)', color: 'var(--sem-red)',
                borderRadius: 6, padding: '2px 8px', fontSize: 11,
                cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              Retry
            </button>
          </div>
        )}

        {listQuery.isSuccess && invoices.length === 0 && (
          <div style={{
            padding: '36px 20px', textAlign: 'center',
            background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', borderRadius: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, opacity: 0.5 }}>
              <Icon name="invoices" size={26} />
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 4 }}>
              No invoices yet
            </div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
              Invoices your bookkeeper sends you will show up here.
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
                <div
                  key={inv.id}
                  onClick={() => setSelectedId(inv.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '110px 1fr 90px 110px',
                    gap: 12, padding: '11px 14px',
                    borderBottom: i < invoices.length - 1 ? '0.5px solid var(--chat-row-divider)' : 'none',
                    cursor: 'pointer', fontSize: 12.5, color: 'var(--lp-text)',
                    background: isSelected ? 'var(--chat-bubble-mine-bg)' : 'transparent',
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
                </div>
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
              style={{
                background: 'transparent', border: 'none', color: 'var(--lp-text-muted)',
                cursor: 'pointer', padding: '2px 6px', display: 'flex'
              }}
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
