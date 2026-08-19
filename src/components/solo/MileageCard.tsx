// PATH: src/components/solo/MileageCard.tsx
// Manual mileage entry card.
// Auto-calculates the deduction at IRS standard rate.
// Hook to ControlMiles when GPS tracking is integrated.

import { useState } from 'react'
import { businessMileageRateForDate } from '../../lib/tax-tables-2026'

interface Props {
  totalMilesYTD?:    number   // real YTD miles from DB
  totalDeduction?:   number   // real YTD deduction from DB (snapshot rates)
  entries?:          Array<{ id: string; entry_date: string; miles: number; deduction: number; purpose: string | null }>
  saving?:           boolean
  onAddMileage?:    (entry: { miles: number; date: string; purpose: string }) => void | Promise<void>
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
  minimumFractionDigits: 0, maximumFractionDigits: 2
}).format(n)

const fmtMiles = (n: number) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0, maximumFractionDigits: 1
}).format(n)

export default function MileageCard({ totalMilesYTD = 0, totalDeduction = 0, entries = [], saving = false, onAddMileage }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [miles, setMiles]       = useState('')
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [purpose, setPurpose]   = useState('')

  // Date-aware IRS rate: 72.5¢ before Jul 1 2026, 76¢ on/after (fuel adjustment).
  const rate = businessMileageRateForDate(date)
  const previewMiles   = parseFloat(miles) || 0
  const previewDeduction = previewMiles * rate

  async function handleAdd() {
    const m = parseFloat(miles)
    if (!m || m <= 0) return
    await onAddMileage?.({ miles: m, date, purpose })
    setMiles('')
    setPurpose('')
    setExpanded(false)
  }

  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: '0.5px solid var(--lp-border)',
      borderRadius: 12,
      padding: '16px 18px',
      marginBottom: 16
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, marginBottom: 12
      }}>
        <div>
          <div style={{
            fontSize: 11, color: 'var(--lp-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.07em',
            fontWeight: 600, marginBottom: 4
          }}>
            🚗 Mileage · YTD
          </div>
          <div style={{
            fontSize: 22, fontWeight: 700, color: 'var(--lp-text)',
            letterSpacing: '-0.02em'
          }}>
            {fmtMiles(totalMilesYTD)} <span style={{
              fontSize: 12, color: 'var(--lp-text-muted)', fontWeight: 400
            }}>miles</span>
          </div>
          <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>
            Saves <strong>{fmt(totalDeduction)}</strong> in deductions
          </div>
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            padding: '6px 12px', borderRadius: 7,
            background: expanded ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
            border: '0.5px solid rgba(59,130,246,0.35)',
            color: '#60a5fa', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
          }}
        >
          {expanded ? '× Cancel' : '+ Log miles'}
        </button>
      </div>

      {/* Quick entry form */}
      {expanded && (
        <div style={{
          padding: '12px 14px', borderRadius: 9,
          background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid var(--lp-border)',
          marginBottom: 4
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Miles driven</label>
              <input
                type="number" step="0.1" min="0"
                className="lp-input"
                value={miles}
                onChange={e => setMiles(e.target.value)}
                placeholder="e.g. 24.5"
                autoFocus
              />
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input
                type="date"
                className="lp-input"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Purpose (optional)</label>
            <input
              type="text"
              className="lp-input"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Client meeting in Tampa"
            />
          </div>

          {previewMiles > 0 && (
            <div style={{
              padding: '8px 12px', borderRadius: 7,
              background: 'rgba(34,197,94,0.06)',
              border: '0.5px solid rgba(34,197,94,0.25)',
              fontSize: 12, color: '#22c55e', marginBottom: 10,
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'
            }}>
              <span>
                <strong>{fmtMiles(previewMiles)}</strong> miles × $
                {rate.toFixed(3)}/mi
              </span>
              <strong>= {fmt(previewDeduction)} deduction</strong>
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={previewMiles <= 0 || saving}
            style={{
              width: '100%', padding: '8px 14px', borderRadius: 7,
              background: previewMiles > 0 && !saving
                ? 'linear-gradient(135deg, #3b82f6, #06b6d4)'
                : 'rgba(255,255,255,0.05)',
              border: 'none',
              color: previewMiles > 0 && !saving ? '#fff' : '#475569',
              fontSize: 12.5, fontWeight: 600,
              cursor: previewMiles > 0 && !saving ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              opacity: previewMiles > 0 && !saving ? 1 : 0.5
            }}
          >
            {saving ? 'Saving…' : previewMiles > 0 ? `Add ${fmtMiles(previewMiles)} miles` : 'Enter miles'}
          </button>
        </div>
      )}

      {/* Logged trips — so entered miles are actually visible */}
      {!expanded && entries.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {entries.slice(0, 4).map((e, i) => (
            <div
              key={e.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '5px 0',
                borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.04)' : 'none',
                fontSize: 12
              }}
            >
              <span style={{ color: 'var(--lp-text-muted)' }}>
                <span style={{ fontFamily: 'monospace', color: 'var(--lp-text)' }}>{fmtMiles(e.miles)} mi</span>
                <span style={{ color: '#475569', marginLeft: 8 }}>{e.entry_date}</span>
                {e.purpose && <span style={{ color: '#475569', marginLeft: 8 }}>· {e.purpose}</span>}
              </span>
              <span style={{ color: '#22c55e', fontFamily: 'monospace' }}>+{fmt(e.deduction)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Deduction-basis disclaimer. Hovering reveals the ControlMiles teaser
          as a floating tooltip (native title), instead of a permanent banner. */}
      {!expanded && (
        <div
          title="Coming soon: automatic GPS mileage logging via ControlMiles — capture your trips straight from your phone."
          style={{
            padding: '8px 10px', borderRadius: 7,
            background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid var(--lp-border)',
            fontSize: 11, color: 'var(--lp-text-muted)', lineHeight: 1.5,
            cursor: 'help'
          }}
        >
          Deduction uses the official mileage rate in effect on each trip&apos;s date.
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = {
  fontSize: 10.5, color: 'var(--lp-text-muted)',
  display: 'block', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.05em'
}