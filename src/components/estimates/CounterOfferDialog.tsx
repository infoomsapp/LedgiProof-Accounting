// PATH: src/components/estimates/CounterOfferDialog.tsx
//
// Light-themed modal for the public estimate page where a client can propose
// modified items (quantity and unit_price only — they don't add or remove items).
//
// Why limited fields? UX simplicity — clients aren't accountants. They might
// say "I only need 2 hours, not 4" or "can you do it for $X?". That's what
// the form captures.
//
// On submit, calls counter_offer_public RPC via useCounterOfferPublic.

import { useState, useEffect, useMemo } from 'react'
import { useCounterOfferPublic } from '../../hooks/useEstimates'
import type { EstimateItem, EstimateTemplateItem } from '../../types/estimate'
import { formatCurrency } from '../../lib/currency'

interface Props {
  open:        boolean
  onClose:     () => void
  token:       string
  /** Original items from the estimate (used as starting point) */
  originalItems: EstimateItem[]
  /** Currency for display */
  currency:    string
  /** Called after successful counter-offer submission */
  onSubmitted?: () => void
}

interface ProposedRow {
  description: string
  quantity:    number
  unit_price:  number
  /** Original quantity (read-only reference) */
  origQty:     number
  /** Original unit price (read-only reference) */
  origPrice:   number
}

export default function CounterOfferDialog({
  open,
  onClose,
  token,
  originalItems,
  currency,
  onSubmitted
}: Props) {
  const counterMut = useCounterOfferPublic()

  const [proposedRows, setProposedRows] = useState<ProposedRow[]>([])
  const [signerName,   setSignerName]   = useState('')
  const [signerEmail,  setSignerEmail]  = useState('')
  const [note,         setNote]         = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [submitted,    setSubmitted]    = useState(false)

  // Initialize proposed rows from original items
  useEffect(() => {
    if (open) {
      setProposedRows(originalItems.map(it => ({
        description: it.description,
        quantity:    it.quantity,
        unit_price:  it.unit_price,
        origQty:     it.quantity,
        origPrice:   it.unit_price
      })))
      setSignerName('')
      setSignerEmail('')
      setNote('')
      setError(null)
      setSubmitted(false)
    }
  }, [open, originalItems])

  // Compute proposed total (with same discount/tax as original — clients can't modify those)
  const proposedTotal = useMemo(() => {
    return proposedRows.reduce((sum, row, i) => {
      const orig = originalItems[i]
      if (!orig) return sum
      const subtotal = row.quantity * row.unit_price
      const discount = subtotal * (orig.discount_pct / 100)
      const tax      = (subtotal - discount) * (orig.tax_rate / 100)
      return sum + (subtotal - discount + tax)
    }, 0)
  }, [proposedRows, originalItems])

  const originalTotal = useMemo(() => {
    return originalItems.reduce((sum, it) => sum + it.line_total, 0)
  }, [originalItems])

  const diff = proposedTotal - originalTotal
  const hasChanges = proposedRows.some((row, i) => {
    const orig = originalItems[i]
    if (!orig) return false
    return row.quantity !== orig.quantity || row.unit_price !== orig.unit_price
  })

  // ── Submit handler ──────────────────────────────────────────────────────
  async function handleSubmit() {
    setError(null)

    if (!hasChanges) {
      setError('Please modify at least one quantity or price to submit a counter-offer.')
      return
    }
    if (!note.trim()) {
      setError('Please add a brief note explaining your counter-offer.')
      return
    }

    // Build payload for the RPC (just qty + unit_price + description)
    const proposedItems: EstimateTemplateItem[] = proposedRows.map(row => ({
      description: row.description,
      quantity:    row.quantity,
      unit_price:  row.unit_price
    }))

    try {
      await counterMut.mutateAsync({
        token,
        proposedItems,
        note: note.trim(),
        ...(signerName.trim() ? { signerName: signerName.trim() } : {}),
        ...(signerEmail.trim() ? { signerEmail: signerEmail.trim() } : {})
      })
      setSubmitted(true)
      onSubmitted?.()
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit counter-offer')
    }
  }

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          maxWidth: 720, width: '100%',
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: '#1a1a1a',
              letterSpacing: '-0.01em'
            }}>
              Propose a counter-offer
            </h2>
            <p style={{
              margin: '4px 0 0 0',
              fontSize: 12.5,
              color: '#666'
            }}>
              Adjust quantities or prices and explain what you'd like to change.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={counterMut.isPending}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: '#999',
              lineHeight: 1,
              padding: 0
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px'
        }}>
          {submitted ? (
            /* Success state */
            <div style={{
              padding: '32px 16px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
              <h3 style={{
                margin: 0, marginBottom: 6,
                fontSize: 16, fontWeight: 600, color: '#1a1a1a'
              }}>
                Counter-offer submitted
              </h3>
              <p style={{
                margin: 0,
                fontSize: 13, color: '#666', lineHeight: 1.5
              }}>
                The vendor has been notified and will review your proposal. You'll receive a
                response by email or a new link.
              </p>
            </div>
          ) : (
            <>
              {/* Items table */}
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#666',
                textTransform: 'uppercase', letterSpacing: '0.07em',
                marginBottom: 10
              }}>
                Items
              </div>

              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                overflow: 'hidden',
                marginBottom: 20
              }}>
                {/* Table header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 70px 90px 90px',
                  gap: 8,
                  padding: '8px 12px',
                  background: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#666'
                }}>
                  <div>Description</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Unit Price</div>
                  <div style={{ textAlign: 'right' }}>Line Total</div>
                </div>

                {/* Rows */}
                {proposedRows.map((row, idx) => {
                  const orig = originalItems[idx]
                  if (!orig) return null

                  const subtotal = row.quantity * row.unit_price
                  const discount = subtotal * (orig.discount_pct / 100)
                  const tax      = (subtotal - discount) * (orig.tax_rate / 100)
                  const lineTotal = subtotal - discount + tax

                  const changed = row.quantity !== row.origQty || row.unit_price !== row.origPrice

                  return (
                    <div key={idx} style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 70px 90px 90px',
                      gap: 8,
                      padding: '10px 12px',
                      borderBottom: idx < proposedRows.length - 1 ? '1px solid #f0f0f0' : 'none',
                      alignItems: 'center',
                      background: changed ? 'rgba(59,130,246,0.04)' : 'transparent',
                      transition: 'background 0.15s'
                    }}>
                      <div style={{ fontSize: 12.5, color: '#1a1a1a' }}>
                        {row.description}
                        {changed && (
                          <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 2 }}>
                            Changed from {row.origQty} × {formatCurrency(row.origPrice, currency)}
                          </div>
                        )}
                      </div>
                      <input
                        type="number"
                        value={row.quantity}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0
                          setProposedRows(prev => prev.map((r, i) =>
                            i === idx ? { ...r, quantity: v } : r
                          ))
                        }}
                        min="0"
                        step="0.5"
                        style={cellInputStyle}
                      />
                      <input
                        type="number"
                        value={row.unit_price}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0
                          setProposedRows(prev => prev.map((r, i) =>
                            i === idx ? { ...r, unit_price: v } : r
                          ))
                        }}
                        min="0"
                        step="0.01"
                        style={cellInputStyle}
                      />
                      <div style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: changed ? '#3b82f6' : '#1a1a1a'
                      }}>
                        {formatCurrency(lineTotal, currency)}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Totals comparison */}
              <div style={{
                padding: '12px 14px',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                marginBottom: 20,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12.5
              }}>
                <div>
                  <div style={{ color: '#666', marginBottom: 3 }}>Original total</div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: '#1a1a1a',
                    fontSize: 15
                  }}>
                    {formatCurrency(originalTotal, currency)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#666', marginBottom: 3 }}>
                    Your proposed total
                  </div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: diff < 0 ? '#22c55e' : diff > 0 ? '#3b82f6' : '#1a1a1a',
                    fontSize: 15
                  }}>
                    {formatCurrency(proposedTotal, currency)}
                    {diff !== 0 && (
                      <span style={{
                        fontSize: 11, marginLeft: 6,
                        fontWeight: 500
                      }}>
                        ({diff > 0 ? '+' : ''}{formatCurrency(diff, currency)})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Note */}
              <div style={{ marginBottom: 14 }}>
                <div style={fieldLabelStyle}>
                  Note <span style={{ color: '#ef4444' }}>*</span>
                </div>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Briefly explain your counter-offer (e.g. 'I only need 2 hours, not 4')…"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 13,
                    border: '1px solid #d4d4d4',
                    borderRadius: 8,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Optional name/email */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 14
              }}>
                <div>
                  <div style={fieldLabelStyle}>Your name (optional)</div>
                  <input
                    type="text"
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    placeholder="Full name"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={fieldLabelStyle}>Email (optional)</div>
                  <input
                    type="email"
                    value={signerEmail}
                    onChange={e => setSignerEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Error banner */}
              {error && (
                <div style={{
                  padding: '9px 12px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8,
                  color: '#dc2626',
                  fontSize: 12,
                  marginBottom: 12
                }}>
                  ⚠ {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!submitted && (
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid #e5e7eb',
            background: '#fafafa',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10
          }}>
            <button
              onClick={onClose}
              disabled={counterMut.isPending}
              style={ghostBtnStyle}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={counterMut.isPending}
              style={{
                ...primaryBtnStyle,
                opacity: counterMut.isPending ? 0.7 : 1,
                cursor: counterMut.isPending ? 'wait' : 'pointer'
              }}
            >
              {counterMut.isPending ? 'Submitting…' : 'Submit counter-offer'}
            </button>
          </div>
        )}

        {submitted && (
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid #e5e7eb',
            background: '#fafafa',
            display: 'flex',
            justifyContent: 'flex-end'
          }}>
            <button onClick={onClose} style={primaryBtnStyle}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const fieldLabelStyle: import('react').CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: '#666',
  marginBottom: 5
}

const inputStyle: import('react').CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  fontSize: 13,
  border: '1px solid #d4d4d4',
  borderRadius: 8,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none'
}

const cellInputStyle: import('react').CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12.5,
  border: '1px solid #d4d4d4',
  borderRadius: 6,
  textAlign: 'right',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
  outline: 'none'
}

const primaryBtnStyle: import('react').CSSProperties = {
  padding: '9px 18px',
  borderRadius: 8,
  background: '#3b82f6',
  border: 'none',
  color: '#fff',
  fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit'
}

const ghostBtnStyle: import('react').CSSProperties = {
  padding: '9px 16px',
  borderRadius: 8,
  background: '#fff',
  border: '1px solid #d4d4d4',
  color: '#555',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit'
}
