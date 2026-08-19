// PATH: src/components/invoices/InvoicePrint.tsx
// Full-page printable invoice component.
// Rendered in a hidden div, then window.print() is called.
// Matches professional invoice standards: logo, client info, line items,
// totals, payment terms, QR verification code.

import { useEffect, useRef } from 'react'
import type { Invoice, InvoiceItem, Client } from '../../types/database.types'
import { formatCurrency } from '../../lib/currency'

export interface InvoiceBranding {
  logo_url:             string | null
  brand_color:          string | null
  invoice_footer:       string | null
  invoice_terms:        string | null
  payment_instructions: string | null
}

interface InvoicePrintProps {
  invoice:  Invoice
  items:    InvoiceItem[]
  client:   Client
  orgName:  string
  branding?: InvoiceBranding | null
  onClose:  () => void
}

export default function InvoicePrint({
  invoice, items, client, orgName, branding, onClose
}: InvoicePrintProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Brand accent — org's chosen color, else the LedgiProof default blue.
  const accent = branding?.brand_color || '#1d4ed8'
  // Terms/footer/payment fall back to org-level branding defaults.
  const termsText   = invoice.terms  ?? branding?.invoice_terms  ?? null
  const footerText  = invoice.footer ?? branding?.invoice_footer  ?? 'Thank you for your business.'
  const payInstruct = branding?.payment_instructions ?? null

  // Bill-to: once the invoice is issued, the DB freezes a bill_to_* snapshot.
  // Prefer it wholesale so an emitted document never changes if the client is
  // later edited or deactivated. Drafts (no snapshot) fall back to live client.
  const hasSnapshot = invoice.bill_to_snapshot_at != null
  const billTo = hasSnapshot
    ? {
        name:    invoice.bill_to_name,
        company: invoice.bill_to_company,
        email:   invoice.bill_to_email,
        taxId:   invoice.bill_to_tax_id,
        line1:   invoice.bill_to_address_line1,
        line2:   invoice.bill_to_address_line2,
        city:    invoice.bill_to_city,
        state:   invoice.bill_to_state,
        postal:  invoice.bill_to_postal_code
      }
    : {
        name:    client.display_name,
        company: client.company_name,
        email:   client.email,
        taxId:   client.tax_id,
        line1:   client.address_line1,
        line2:   client.address_line2,
        city:    client.city,
        state:   client.state,
        postal:  client.postal_code
      }

  useEffect(() => {
    // Brief delay so DOM paints first
    const t = setTimeout(() => {
      window.print()
      onClose()
    }, 300)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      {/* Print styles — injected into head */}
      <style>{`
        @media print {
          body > *:not(#lp-invoice-print) { display: none !important; }
          #lp-invoice-print { display: block !important; }
          @page { margin: 15mm 18mm; size: letter; }
        }
        @media screen {
          #lp-invoice-print { display: none; }
        }
      `}</style>

      <div id="lp-invoice-print" ref={ref} style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize:   11,
        color:      '#111827',
        lineHeight: 1.5,
        maxWidth:   '100%'
      }}>

        {/* ── Header ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
          {/* Company / org */}
          <div>
            {branding?.logo_url && (
              <img src={branding.logo_url} alt="" style={{ maxHeight: 44, marginBottom: 8, display: 'block' }} />
            )}
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
              {orgName}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              Powered by LedgiProof · Olympus Mont Systems LLC
            </div>
          </div>

          {/* INVOICE label */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: accent, letterSpacing: '-0.03em' }}>
              INVOICE
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {invoice.invoice_number}
            </div>
          </div>
        </div>

        {/* ── Bill to + Invoice meta ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 28 }}>
          {/* Bill to */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 6 }}>
              Bill To
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>
              {billTo.name}
            </div>
            {billTo.company && (
              <div style={{ color: '#374151', marginBottom: 2 }}>{billTo.company}</div>
            )}
            {billTo.email && (
              <div style={{ color: '#6b7280' }}>{billTo.email}</div>
            )}
            {billTo.line1 && (
              <div style={{ color: '#6b7280' }}>
                {billTo.line1}
                {billTo.line2 ? `, ${billTo.line2}` : ''}
              </div>
            )}
            {(billTo.city || billTo.state) && (
              <div style={{ color: '#6b7280' }}>
                {[billTo.city, billTo.state, billTo.postal].filter(Boolean).join(', ')}
              </div>
            )}
            {billTo.taxId && (
              <div style={{ color: '#9ca3af', fontSize: 10, marginTop: 4 }}>
                Tax ID: {billTo.taxId}
              </div>
            )}
          </div>

          {/* Invoice details */}
          <div>
            {[
              ['Invoice Number', invoice.invoice_number],
              ['Issue Date',     invoice.issue_date],
              ['Due Date',       invoice.due_date],
              ['Currency',       invoice.currency],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                padding: '4px 0', borderBottom: '0.5px solid #f3f4f6' }}>
                <span style={{ color: '#6b7280', fontSize: 10.5 }}>{label}</span>
                <span style={{ fontWeight: 500, fontSize: 11 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Title ─────────────────────────────────────────────────── */}
        {invoice.title && (
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 16 }}>
            {invoice.title}
          </div>
        )}

        {/* ── Line items table ───────────────────────────────────────── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${accent}` }}>
              {['Description', 'Qty', 'Unit Price', 'Tax %', 'Amount'].map((h, i) => (
                <th key={h} style={{
                  padding: '8px 6px', textAlign: i >= 1 ? 'right' : 'left',
                  fontSize: 9.5, fontWeight: 600, color: '#374151',
                  textTransform: 'uppercase', letterSpacing: '0.06em'
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} style={{
                backgroundColor: i % 2 === 0 ? '#f9fafb' : 'white',
                borderBottom: '0.5px solid #f3f4f6'
              }}>
                <td style={{ padding: '9px 6px', fontSize: 11 }}>
                  {item.description}
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', fontSize: 11 }}>
                  {item.quantity}
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', fontSize: 11 }}>
                  {formatCurrency(item.unit_price, invoice.currency)}
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', fontSize: 11 }}>
                  {item.tax_rate > 0 ? `${item.tax_rate}%` : '—'}
                </td>
                <td style={{ padding: '9px 6px', textAlign: 'right', fontSize: 11, fontWeight: 500 }}>
                  {formatCurrency(item.line_total, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totals ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
          <div style={{ minWidth: 220 }}>
            {[
              { label: 'Subtotal',   value: invoice.subtotal,       bold: false },
              { label: 'Tax',        value: invoice.tax_total,      bold: false },
              { label: 'Total',      value: invoice.total,          bold: true  },
              { label: 'Amount Paid',value: invoice.amount_paid,    bold: false },
            ].map(({ label, value, bold }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', gap: 32,
                padding: '5px 0',
                borderTop: label === 'Total' ? '1.5px solid #111827' : '0.5px solid #f3f4f6',
                borderBottom: label === 'Total' ? '1.5px solid #111827' : 'none'
              }}>
                <span style={{ fontSize: bold ? 12 : 11, color: '#374151' }}>{label}</span>
                <span style={{ fontSize: bold ? 13 : 11, fontWeight: bold ? 700 : 400 }}>
                  {formatCurrency(value, invoice.currency)}
                </span>
              </div>
            ))}

            {/* Balance due — highlighted */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', gap: 32,
              padding: '8px 10px', marginTop: 6,
              background: invoice.balance_due > 0 ? '#eff6ff' : '#f0fdf4',
              border: `1px solid ${invoice.balance_due > 0 ? '#bfdbfe' : '#bbf7d0'}`,
              borderRadius: 6
            }}>
              <span style={{ fontSize: 12, fontWeight: 600,
                color: invoice.balance_due > 0 ? '#1d4ed8' : '#15803d' }}>
                {invoice.balance_due > 0 ? 'Balance Due' : 'Paid in Full'}
              </span>
              <span style={{ fontSize: 14, fontWeight: 800,
                color: invoice.balance_due > 0 ? '#1d4ed8' : '#15803d' }}>
                {formatCurrency(invoice.balance_due, invoice.currency)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Notes + Terms ──────────────────────────────────────────── */}
        {(invoice.notes || termsText) && (
          <div style={{ display: 'grid', gridTemplateColumns: termsText ? '1fr 1fr' : '1fr',
            gap: 20, marginBottom: 24, padding: '14px 0',
            borderTop: '0.5px solid #e5e7eb' }}>
            {invoice.notes && (
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 6 }}>Notes</div>
                <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.6 }}>
                  {invoice.notes}
                </div>
              </div>
            )}
            {termsText && (
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 6 }}>Payment Terms</div>
                <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {termsText}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Payment instructions (org branding) ────────────────────── */}
        {payInstruct && (
          <div style={{
            marginBottom: 24, padding: '12px 14px', borderRadius: 6,
            background: '#f9fafb', border: '0.5px solid #e5e7eb'
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: accent, marginBottom: 6 }}>How to Pay</div>
            <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {payInstruct}
            </div>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div style={{
          borderTop: '0.5px solid #e5e7eb', paddingTop: 14,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>
            {footerText}
          </div>
          <div style={{ fontSize: 9, color: '#d1d5db', textAlign: 'right' }}>
            <div>LedgiProof · {invoice.invoice_number}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 8 }}>
              Verified by Olympus Mont Systems LLC
            </div>
          </div>
        </div>

      </div>
    </>
  )
}