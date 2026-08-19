// PATH: src/components/estimates/EstimatePrint.tsx
//
// Print-friendly view of a single estimate. Professional US-standard layout.
// Triggers browser Ctrl+P → user saves as PDF.
//
// Layout:
//   ┌─────────────────────────────────────────────────────┐
//   │ [LOGO]                              ESTIMATE #EST-… │
//   │ {org.name}                              Issued: …   │
//   │ {org.address line 1}                    Valid:  …   │
//   │ {org.address line 2}                                │
//   ├─────────────────────────────────────────────────────┤
//   │ Bill To: {client.name}                              │
//   │ {client.email}                                      │
//   │                                                     │
//   │ Scope: {scope_description}                          │
//   ├─────────────────────────────────────────────────────┤
//   │ # | Description    | Qty | Price | Disc | Tax | Tot │
//   │ 1 | …              |   1 | 95.00 |  0%  | 0%  | 95… │
//   │ …                                                   │
//   ├─────────────────────────────────────────────────────┤
//   │                              Subtotal:      $XXX.XX │
//   │                              Discount:     -$XX.XX  │
//   │                              Tax:           $XX.XX  │
//   │                              TOTAL:         $XXX.XX │
//   ├─────────────────────────────────────────────────────┤
//   │ Notes: …                                            │
//   │ Terms & Conditions: …                               │
//   │                                                     │
//   │ Signature:                  Date:                   │
//   │ _____________________      _________________        │
//   └─────────────────────────────────────────────────────┘

import { ESTIMATE_TEMPLATE_CATEGORY_LABELS } from '../../types/estimate'
import type { Estimate, EstimateItem } from '../../types/estimate'
import { formatCurrency } from '../../lib/currency'

interface OrgInfo {
  name:               string
  business_type?:     string | null
  principal_business?: string | null
  business_code?:     string | null
  // The schema only exposes these three columns. We render whatever's available.
}

interface ClientInfo {
  name:  string
  email: string | null
}

interface Props {
  estimate: Estimate
  items:    EstimateItem[]
  org:      OrgInfo
  client:   ClientInfo
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
}

const fmtQty = (n: number) => {
  // Show decimals only if needed
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2)
}

export default function EstimatePrint({ estimate, items, org, client }: Props) {
  const categoryMeta = estimate.template_category
    ? ESTIMATE_TEMPLATE_CATEGORY_LABELS[estimate.template_category]
    : null

  // Once the estimate is issued the DB freezes a bill_to_* snapshot. Prefer it
  // so an emitted document never changes if the client is later edited. Drafts
  // (no snapshot) fall back to the live client prop.
  const billTo = estimate.bill_to_snapshot_at != null
    ? { name: estimate.bill_to_name ?? client.name, email: estimate.bill_to_email }
    : { name: client.name, email: client.email }

  return (
    <>
      {/* ── Print-specific styles ──────────────────────────────────────── */}
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { background: #fff !important; }
          .lp-no-print { display: none !important; }
          .lp-estimate-print {
            box-shadow: none !important;
            border: none !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            color: #000 !important;
            background: #fff !important;
          }
          .lp-estimate-print * {
            color: #000 !important;
            background: transparent !important;
          }
          .lp-estimate-print .accent {
            color: #1d4ed8 !important;
          }
        }
        @media screen {
          .lp-estimate-print {
            max-width: 8.5in;
            margin: 0 auto;
            padding: 0.6in 0.6in 0.5in 0.6in;
            background: #ffffff;
            color: #1a1a1a;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            box-shadow: 0 4px 16px rgba(0,0,0,0.25);
            border-radius: 4px;
          }
        }
      `}</style>

      <div className="lp-estimate-print">

        {/* ── Header: logo placeholder + ESTIMATE header ──────────────── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          paddingBottom: 18,
          borderBottom: '2pt solid #1d4ed8'
        }}>
          {/* Left: org info */}
          <div style={{ flex: 1, maxWidth: '60%' }}>
            {/* Logo placeholder — replace with real logo if available */}
            <div style={{
              fontSize: 24, fontWeight: 700, color: '#1d4ed8',
              letterSpacing: '-0.02em', marginBottom: 6
            }}>
              {org.name}
            </div>
            {org.principal_business && (
              <div style={{ fontSize: 10.5, color: '#555', lineHeight: 1.5 }}>
                {org.principal_business}
              </div>
            )}
            {org.business_type && (
              <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>
                {org.business_type}
              </div>
            )}
          </div>

          {/* Right: ESTIMATE title + meta */}
          <div style={{ textAlign: 'right', minWidth: '35%' }}>
            <div style={{
              fontSize: 20, fontWeight: 700, color: '#1d4ed8',
              letterSpacing: '0.04em', marginBottom: 2
            }} className="accent">
              ESTIMATE
            </div>
            <div style={{
              fontSize: 13, fontFamily: 'monospace', fontWeight: 600,
              color: '#333', marginBottom: 10
            }}>
              {estimate.estimate_number}
            </div>

            <table style={{ marginLeft: 'auto', fontSize: 10 }}>
              <tbody>
                <tr>
                  <td style={{ color: '#666', paddingRight: 12, textAlign: 'right' }}>
                    Issued:
                  </td>
                  <td style={{ fontWeight: 500, textAlign: 'right' }}>
                    {fmtDate(estimate.issue_date)}
                  </td>
                </tr>
                {estimate.valid_until && (
                  <tr>
                    <td style={{ color: '#666', paddingRight: 12, textAlign: 'right', paddingTop: 2 }}>
                      Valid until:
                    </td>
                    <td style={{ fontWeight: 500, textAlign: 'right', paddingTop: 2 }}>
                      {fmtDate(estimate.valid_until)}
                    </td>
                  </tr>
                )}
                {categoryMeta && (
                  <tr>
                    <td style={{ color: '#666', paddingRight: 12, textAlign: 'right', paddingTop: 2 }}>
                      Type:
                    </td>
                    <td style={{ fontWeight: 500, textAlign: 'right', paddingTop: 2 }}>
                      {categoryMeta.label}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Bill To / Scope ───────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          gap: 30,
          marginTop: 18, marginBottom: 18
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: '#666',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 4
            }}>
              Estimate for
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>
              {billTo.name}
            </div>
            {billTo.email && (
              <div style={{ fontSize: 10.5, color: '#555', marginTop: 2 }}>
                {billTo.email}
              </div>
            )}
          </div>

          {estimate.title && (
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, color: '#666',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                marginBottom: 4
              }}>
                Project
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a1a' }}>
                {estimate.title}
              </div>
            </div>
          )}
        </div>

        {/* Scope description */}
        {estimate.scope_description && (
          <div style={{
            padding: '10px 14px',
            background: '#f8fafc',
            border: '0.5pt solid #e2e8f0',
            borderRadius: 4,
            fontSize: 10.5, color: '#444',
            marginBottom: 18,
            lineHeight: 1.55
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: '#666',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 4
            }}>
              Scope of work
            </div>
            {estimate.scope_description}
          </div>
        )}

        {/* ── Items table ──────────────────────────────────────────────── */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 10.5,
          marginBottom: 18
        }}>
          <thead>
            <tr style={{
              borderBottom: '1.5pt solid #1d4ed8',
              fontSize: 9.5,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#1d4ed8',
              fontWeight: 700
            }} className="accent">
              <th style={{ padding: '8px 6px', textAlign: 'left',  width: 28 }}>#</th>
              <th style={{ padding: '8px 6px', textAlign: 'left'  }}>Description</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', width: 50 }}>Qty</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', width: 75 }}>Unit price</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', width: 55 }}>Disc</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', width: 55 }}>Tax</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', width: 80 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{
                  padding: 30, textAlign: 'center',
                  color: '#999', fontStyle: 'italic'
                }}>
                  (No line items)
                </td>
              </tr>
            ) : (
              items.map((it, i) => (
                <tr key={it.id} style={{
                  borderBottom: '0.5pt solid #e8e8e8'
                }}>
                  <td style={{ padding: '8px 6px', color: '#888', fontSize: 9.5 }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '8px 6px', color: '#1a1a1a' }}>
                    {it.description}
                    {it.item_type !== 'service' && (
                      <span style={{
                        fontSize: 8.5, color: '#888', marginLeft: 6,
                        textTransform: 'uppercase', letterSpacing: '0.05em'
                      }}>
                        ({it.item_type})
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {fmtQty(it.quantity)}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatCurrency(it.unit_price, estimate.currency)}
                  </td>
                  <td style={{
                    padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace',
                    color: it.discount_pct > 0 ? '#1d4ed8' : '#aaa'
                  }}>
                    {it.discount_pct > 0 ? `${it.discount_pct}%` : '—'}
                  </td>
                  <td style={{
                    padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace',
                    color: it.tax_rate > 0 ? '#1d4ed8' : '#aaa'
                  }}>
                    {it.tax_rate > 0 ? `${it.tax_rate}%` : '—'}
                  </td>
                  <td style={{
                    padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace',
                    fontWeight: 600
                  }}>
                    {formatCurrency(it.line_total, estimate.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Totals box ──────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 24
        }}>
          <table style={{
            minWidth: 260,
            fontSize: 11,
            borderCollapse: 'collapse'
          }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 12px 4px 0', color: '#555', textAlign: 'right' }}>
                  Subtotal:
                </td>
                <td style={{
                  padding: '4px 0', textAlign: 'right',
                  fontFamily: 'monospace', fontWeight: 500, minWidth: 100
                }}>
                  {formatCurrency(estimate.subtotal, estimate.currency)}
                </td>
              </tr>

              {estimate.discount_total > 0 && (
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', color: '#555', textAlign: 'right' }}>
                    Discount:
                  </td>
                  <td style={{
                    padding: '4px 0', textAlign: 'right',
                    fontFamily: 'monospace', color: '#1d4ed8'
                  }} className="accent">
                    −{formatCurrency(estimate.discount_total, estimate.currency)}
                  </td>
                </tr>
              )}

              {estimate.tax_total > 0 && (
                <tr>
                  <td style={{ padding: '4px 12px 4px 0', color: '#555', textAlign: 'right' }}>
                    Tax:
                  </td>
                  <td style={{
                    padding: '4px 0', textAlign: 'right',
                    fontFamily: 'monospace'
                  }}>
                    {formatCurrency(estimate.tax_total, estimate.currency)}
                  </td>
                </tr>
              )}

              <tr style={{
                borderTop: '1.5pt solid #1d4ed8'
              }}>
                <td style={{
                  padding: '8px 12px 4px 0',
                  textAlign: 'right',
                  fontWeight: 700,
                  fontSize: 13,
                  color: '#1d4ed8'
                }} className="accent">
                  TOTAL:
                </td>
                <td style={{
                  padding: '8px 0 4px 0',
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: 14,
                  color: '#1d4ed8'
                }} className="accent">
                  {formatCurrency(estimate.total, estimate.currency)} {estimate.currency}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Notes ──────────────────────────────────────────────────── */}
        {estimate.notes && (
          <div style={{ marginBottom: 16, fontSize: 10.5, lineHeight: 1.55 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: '#666',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 4
            }}>
              Notes
            </div>
            <div style={{ color: '#444', whiteSpace: 'pre-wrap' }}>
              {estimate.notes}
            </div>
          </div>
        )}

        {/* ── Terms ──────────────────────────────────────────────────── */}
        {estimate.terms && (
          <div style={{ marginBottom: 20, fontSize: 9.5, lineHeight: 1.55 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: '#666',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 4
            }}>
              Terms &amp; Conditions
            </div>
            <div style={{ color: '#555', whiteSpace: 'pre-wrap' }}>
              {estimate.terms}
            </div>
          </div>
        )}

        {/* ── Signatures section ─────────────────────────────────────── */}
        <div style={{
          marginTop: 30,
          paddingTop: 14,
          borderTop: '0.5pt solid #ccc',
          display: 'flex',
          gap: 40
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: '#666',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 28
            }}>
              Authorized signature
            </div>
            <div style={{ borderBottom: '1pt solid #333', marginBottom: 4 }} />
            <div style={{ fontSize: 9, color: '#888' }}>
              {org.name}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, color: '#666',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 28
            }}>
              Client acceptance
            </div>
            <div style={{ borderBottom: '1pt solid #333', marginBottom: 4 }} />
            <div style={{ fontSize: 9, color: '#888' }}>
              Signature &amp; Date
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        {estimate.footer && (
          <div style={{
            marginTop: 24,
            paddingTop: 12,
            borderTop: '0.5pt solid #ddd',
            fontSize: 9, color: '#888',
            textAlign: 'center',
            fontStyle: 'italic'
          }}>
            {estimate.footer}
          </div>
        )}

        {/* Generation timestamp (printed) */}
        <div style={{
          marginTop: 16,
          fontSize: 8, color: '#bbb',
          textAlign: 'center'
        }}>
          Generated by LedgiProof · {new Date().toLocaleString('en-US')}
        </div>
      </div>
    </>
  )
}