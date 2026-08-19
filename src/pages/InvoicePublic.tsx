// PATH: src/pages/InvoicePublic.tsx
//
// Facturación paso 1 — Vista pública de invoice (/i/:token). Sin AppShell, como
// /e/:token. El cliente abre el link, ve la factura y su saldo. El botón de
// pago online se activa cuando se cablee Stripe (paso 3).

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getInvoiceByPublicToken, type PublicInvoicePayload } from '../services/invoice.service'
import { createInvoiceCheckoutSession } from '../services/stripe.service'
import { formatCurrency } from '../lib/currency'

const fmt = (n: number, ccy = 'USD') => formatCurrency(Number(n) || 0, ccy)

const wrap: React.CSSProperties = {
  minHeight: '100vh', background: 'var(--lp-bg)', color: 'var(--lp-text)',
  display: 'flex', justifyContent: 'center', padding: '40px 16px'
}
const card: React.CSSProperties = {
  width: '100%', maxWidth: 640, background: 'var(--lp-surface)',
  border: '0.5px solid var(--lp-border)', borderRadius: 14, padding: 28
}

export default function InvoicePublic() {
  const { token } = useParams<{ token: string }>()
  const [payload, setPayload]     = useState<PublicInvoicePayload | null>(null)
  const [err, setErr]             = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [paying, setPaying]       = useState(false)
  const [payError, setPayError]   = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    getInvoiceByPublicToken(token)
      .then(setPayload)
      .catch(e => setErr(e?.message ?? 'This invoice could not be found.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div style={wrap}><div style={card}>Loading…</div></div>
  if (err || !payload) return <div style={wrap}><div style={card}><h2 style={{ marginTop: 0 }}>Not found</h2><p style={{ color: 'var(--lp-text-muted)' }}>{err}</p></div></div>

  const { invoice: inv, items, org, client } = payload
  const ccy = inv.currency ?? 'USD'
  const balance = Number(inv.balance_due ?? inv.total)
  const paid = Number(inv.amount_paid ?? 0)

  // Org branding (viene del RPC público). Accent cae al token global si no hay.
  const accent      = org.brand_color || 'var(--lp-accent)'
  const termsText   = inv.terms  ?? org.invoice_terms  ?? null
  const footerText  = inv.footer ?? org.invoice_footer ?? null
  const payInstruct = org.payment_instructions ?? null

  return (
    <div style={wrap}>
      <div style={card}>
        {/* Header */}
        {/* Brand accent bar */}
        <div style={{ height: 4, background: accent, borderRadius: 4, marginBottom: 20 }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            {org.logo_url && (
              <img src={org.logo_url} alt="" style={{ maxHeight: 40, marginBottom: 8, display: 'block' }} />
            )}
            <div style={{ fontSize: 18, fontWeight: 700 }}>{org.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>Powered by LedgiProof</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: accent }}>INVOICE</div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>{inv.invoice_number}</div>
          </div>
        </div>

        {/* Bill to + meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Bill to</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{client.name ?? '—'}</div>
            {client.email && <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>{client.email}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--lp-text-muted)', lineHeight: 1.7 }}>
            <div>Issued: {inv.issue_date}</div>
            <div>Due: {inv.due_date}</div>
            <div>Status: <strong style={{ color: 'var(--lp-text)' }}>{inv.status}</strong></div>
          </div>
        </div>

        {/* Items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 18 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--lp-border)', color: 'var(--lp-text-muted)', fontSize: 10.5, textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>Rate</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any) => (
              <tr key={it.id} style={{ borderBottom: '0.5px solid var(--lp-border)' }}>
                <td style={{ padding: '8px 4px' }}>{it.description ?? it.name ?? '—'}</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{it.quantity ?? 1}</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(it.unit_price ?? it.rate ?? 0, ccy)}</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(it.line_total ?? it.amount ?? 0, ccy)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ marginLeft: 'auto', width: 240, fontSize: 12.5 }}>
          {[
            ['Subtotal', inv.subtotal],
            ['Discount', -Number(inv.discount_total ?? 0)],
            ['Tax', inv.tax_total]
          ].map(([l, v]) => (
            <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--lp-text-muted)' }}>
              <span>{l}</span><span style={{ fontFamily: 'monospace' }}>{fmt(Number(v), ccy)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--lp-border)', fontWeight: 700 }}>
            <span>Total</span><span style={{ fontFamily: 'monospace' }}>{fmt(inv.total, ccy)}</span>
          </div>
          {paid > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--sem-green)' }}>
              <span>Paid</span><span style={{ fontFamily: 'monospace' }}>−{fmt(paid, ccy)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--lp-border)', fontWeight: 800, fontSize: 15 }}>
            <span>Balance due</span><span style={{ fontFamily: 'monospace', color: balance > 0 ? 'var(--sem-red)' : 'var(--sem-green)' }}>{fmt(balance, ccy)}</span>
          </div>
        </div>

        {/* Pay online */}
        {balance > 0 && inv.public_token && (
          <div style={{ marginTop: 22 }}>
            <button
              onClick={async () => {
                if (paying) return
                setPaying(true)
                setPayError(null)
                try {
                  const url = await createInvoiceCheckoutSession(inv.public_token as string)
                  window.location.href = url
                } catch (e: unknown) {
                  setPayError(e instanceof Error ? e.message : 'Payment unavailable. Please try again.')
                  setPaying(false)
                }
              }}
              disabled={paying}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
                background: paying ? 'var(--lp-border)' : accent,
                color: '#fff', fontWeight: 700, fontSize: 14,
                cursor: paying ? 'not-allowed' : 'pointer', letterSpacing: '0.01em',
              }}
            >
              {paying ? 'Redirecting to payment…' : `Pay ${fmt(balance, ccy)} securely`}
            </button>
            {payError && (
              <p style={{ marginTop: 8, fontSize: 11.5, color: 'var(--sem-red)', textAlign: 'center' }}>
                {payError}
              </p>
            )}
            <p style={{ marginTop: 6, fontSize: 10.5, color: 'var(--lp-text-muted)', textAlign: 'center' }}>
              Powered by Stripe · SSL encrypted
            </p>
          </div>
        )}

        {inv.notes && <div style={{ marginTop: 18, fontSize: 12, color: 'var(--lp-text-muted)' }}>{inv.notes}</div>}

        {payInstruct && (
          <div style={{
            marginTop: 18, padding: '12px 14px', borderRadius: 10,
            background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)'
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>How to pay</div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{payInstruct}</div>
          </div>
        )}

        {termsText && (
          <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--lp-text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{termsText}</div>
        )}

        {footerText && (
          <div style={{ marginTop: 18, paddingTop: 12, borderTop: '0.5px solid var(--lp-border)', fontSize: 11, color: 'var(--lp-text-muted)', textAlign: 'center' }}>{footerText}</div>
        )}
      </div>
    </div>
  )
}
