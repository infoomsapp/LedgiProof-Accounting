// PATH: src/components/estimates/LineItemRow.tsx
//
// Single editable row for an estimate line item. Renders inputs for
// description, qty, unit price, discount, tax — and a live-computed
// line total. Drag-handle support via parent (uses sort_order on the draft).
//
// Wired to useEstimateDraft via the updateItem / removeItem callbacks.

import { useState } from 'react'
import type { DraftItem } from '../../hooks/useEstimateDraft'
import type { EstimateItemType } from '../../types/estimate'
import { formatCurrency } from '../../lib/currency'

interface Props {
  item:        DraftItem
  index:       number
  currency:    string
  /** Update a field of this row */
  onChange:    (patch: Partial<DraftItem>) => void
  /** Remove this row */
  onRemove:    () => void
  /** Disable editing (e.g. estimate is accepted/converted) */
  readonly?:   boolean
}

const ITEM_TYPE_OPTIONS: { value: EstimateItemType; label: string }[] = [
  { value: 'service',  label: 'Service'  },
  { value: 'product',  label: 'Product'  },
  { value: 'expense',  label: 'Expense'  },
  { value: 'discount', label: 'Discount' },
  { value: 'tax',      label: 'Tax'      }
]

export default function LineItemRow({
  item,
  index,
  currency,
  onChange,
  onRemove,
  readonly = false
}: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 2.5fr 80px 110px 70px 70px 110px 32px',
      gap: 8,
      alignItems: 'center',
      padding: '8px 4px',
      borderBottom: '0.5px solid var(--lp-border)',
      background: item._saving ? 'rgba(59,130,246,0.02)' : 'transparent',
      transition: 'background 0.15s'
    }}>

      {/* Row index */}
      <div style={{
        fontSize: 10.5, color: '#64748b',
        textAlign: 'center', fontWeight: 500
      }}>
        {index + 1}
      </div>

      {/* Description */}
      <input
        type="text"
        value={item.description}
        onChange={e => onChange({ description: e.target.value })}
        placeholder="Description"
        disabled={readonly}
        className="lp-input"
        style={inputStyle}
      />

      {/* Quantity */}
      <input
        type="number"
        value={item.quantity}
        onChange={e => onChange({ quantity: parseFloat(e.target.value) || 0 })}
        step="0.01"
        min="0"
        disabled={readonly}
        className="lp-input"
        style={{ ...inputStyle, textAlign: 'right', fontFamily: 'monospace' }}
      />

      {/* Unit price */}
      <input
        type="number"
        value={item.unit_price}
        onChange={e => onChange({ unit_price: parseFloat(e.target.value) || 0 })}
        step="0.01"
        min="0"
        disabled={readonly}
        className="lp-input"
        style={{ ...inputStyle, textAlign: 'right', fontFamily: 'monospace' }}
      />

      {/* Discount % */}
      <input
        type="number"
        value={item.discount_pct}
        onChange={e => onChange({ discount_pct: parseFloat(e.target.value) || 0 })}
        step="0.1"
        min="0"
        max="100"
        disabled={readonly}
        className="lp-input"
        title="Discount %"
        style={{ ...inputStyle, textAlign: 'right', fontFamily: 'monospace' }}
      />

      {/* Tax rate % */}
      <input
        type="number"
        value={item.tax_rate}
        onChange={e => onChange({ tax_rate: parseFloat(e.target.value) || 0 })}
        step="0.1"
        min="0"
        max="100"
        disabled={readonly}
        className="lp-input"
        title="Tax rate %"
        style={{ ...inputStyle, textAlign: 'right', fontFamily: 'monospace' }}
      />

      {/* Line total */}
      <div style={{
        fontFamily: 'monospace',
        fontSize: 12.5,
        fontWeight: 600,
        color: 'var(--lp-text)',
        textAlign: 'right',
        padding: '0 6px'
      }}>
        {formatCurrency(item.line_total, currency)}
      </div>

      {/* Remove button */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {!readonly && (
          <>
            {confirmRemove ? (
              <div style={{ display: 'flex', gap: 3 }}>
                <button
                  onClick={() => { onRemove(); setConfirmRemove(false) }}
                  title="Confirm delete"
                  style={{
                    width: 20, height: 20,
                    background: 'rgba(239,68,68,0.20)',
                    border: '0.5px solid rgba(239,68,68,0.5)',
                    borderRadius: 4,
                    color: '#ef4444',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 10, padding: 0
                  }}
                >
                  ✓
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  title="Cancel"
                  style={{
                    width: 20, height: 20,
                    background: 'transparent',
                    border: '0.5px solid var(--lp-border)',
                    borderRadius: 4,
                    color: '#64748b',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 10, padding: 0
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                title="Remove row"
                style={{
                  width: 24, height: 24,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  color: '#64748b',
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, padding: 0,
                  opacity: 0.6,
                  transition: 'opacity 0.15s, color 0.15s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '1'
                  e.currentTarget.style.color = '#ef4444'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '0.6'
                  e.currentTarget.style.color = '#64748b'
                }}
              >
                ✕
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12.5,
  padding: '6px 8px',
  background: 'rgba(255,255,255,0.02)',
  border: '0.5px solid var(--lp-border)',
  borderRadius: 6,
  color: 'var(--lp-text)',
  fontFamily: 'inherit'
}

// ── Header row component (separate for use in editor) ────────────────────────

export function LineItemHeader() {
  const cellHeader: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--lp-text-muted)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '6px 6px'
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 2.5fr 80px 110px 70px 70px 110px 32px',
      gap: 8,
      alignItems: 'center',
      borderBottom: '1px solid var(--lp-border)',
      background: 'rgba(255,255,255,0.02)'
    }}>
      <div style={{ ...cellHeader, textAlign: 'center' }}>#</div>
      <div style={cellHeader}>Description</div>
      <div style={{ ...cellHeader, textAlign: 'right' }}>Qty</div>
      <div style={{ ...cellHeader, textAlign: 'right' }}>Unit price</div>
      <div style={{ ...cellHeader, textAlign: 'right' }}>Disc %</div>
      <div style={{ ...cellHeader, textAlign: 'right' }}>Tax %</div>
      <div style={{ ...cellHeader, textAlign: 'right' }}>Total</div>
      <div />
    </div>
  )
}