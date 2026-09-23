// PATH: src/components/solo/QuarterlyTaxCard.tsx
// Killer feature: shows quarterly tax estimate with SE + Federal breakdown,
// countdown to IRS Form 1040-ES due date.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { estimateQuarterlyTax, formatTax, formatPct } from '../../services/tax-estimator.service'

interface Props {
  netProfitYTD:  number       // YTD net profit (more accurate than quarter-only)
  netProfitQ:    number       // current quarter only (fallback)
  quarter:       number       // 1-4
  year:          number
  quarterDueDate: string      // ISO date "2026-04-15"
  stateCode?:    string | null
}

export default function QuarterlyTaxCard({
  netProfitYTD, netProfitQ, quarter, year, quarterDueDate, stateCode
}: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [basis, setBasis] = useState<'this_quarter' | 'ytd_annualized'>(
    netProfitYTD > netProfitQ ? 'ytd_annualized' : 'this_quarter'
  )

  // Pick which net profit to feed into estimator
  const feed = basis === 'ytd_annualized' ? netProfitYTD : netProfitQ
  const est = estimateQuarterlyTax({
    netProfit:    feed,
    quarter,
    basis,
    filingStatus: 'single'
  })

  const due = new Date(quarterDueDate + 'T12:00:00')
  const today = new Date()
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const isOverdue = daysUntilDue < 0
  const isUrgent  = daysUntilDue >= 0 && daysUntilDue <= 14

  // Color logic
  const headerColor = isOverdue ? '#ef4444' : isUrgent ? '#f59e0b' : '#22c55e'
  const headerLabel = isOverdue
    ? t('solo.daysOverdueBadge', { count: Math.abs(daysUntilDue) })
    : daysUntilDue === 0 ? t('solo.dueToday')
    : daysUntilDue === 1 ? t('solo.dueTomorrow')
    : t('solo.daysLeft', { count: daysUntilDue })

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(59,130,246,0.04))',
      border: `0.5px solid ${headerColor}40`,
      borderRadius: 12,
      padding: '18px 20px',
      marginBottom: 16
    }}>
      {/* Fail-safe: never present unverified tax tables as final */}
      {est.provisional && (
        <div style={{
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 12,
          fontSize: 12,
          color: 'var(--lp-text, #92400e)'
        }}>
          {t('solo.provisionalEstimate', { year: est.taxYear })}
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, marginBottom: 14, flexWrap: 'wrap'
      }}>
        <div>
          <div style={{
            fontSize: 11, color: 'var(--lp-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
            marginBottom: 4
          }}>
            {t('solo.quarterlyTaxEstimate', { quarter, year })}
          </div>
          <div style={{
            fontSize: 28, fontWeight: 800, color: 'var(--lp-text)',
            letterSpacing: '-0.02em', lineHeight: 1.1
          }}>
            {formatTax(est.quarterlyDue)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            {t('solo.payBy', {
              date: due.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            })}
          </div>
        </div>

        <div style={{
          padding: '6px 12px',
          borderRadius: 100,
          background: `${headerColor}15`,
          border: `0.5px solid ${headerColor}50`,
          fontSize: 11.5,
          fontWeight: 600,
          color: headerColor,
          whiteSpace: 'nowrap',
          flexShrink: 0
        }}>
          {headerLabel}
        </div>
      </div>

      {/* Basis toggle (if we have YTD data) */}
      {netProfitYTD > 0 && netProfitYTD !== netProfitQ && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 10, color: '#475569',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5
          }}>
            {t('solo.estimateBasedOn')}
          </div>
          <div style={{ display: 'inline-flex', gap: 4, padding: 2,
            background: 'rgba(255,255,255,0.03)', borderRadius: 7,
            border: '0.5px solid var(--lp-border)' }}>
            <ToggleBtn
              active={basis === 'this_quarter'}
              onClick={() => setBasis('this_quarter')}
              label={t('solo.thisQOnly', { amount: formatTax(netProfitQ) })}
            />
            <ToggleBtn
              active={basis === 'ytd_annualized'}
              onClick={() => setBasis('ytd_annualized')}
              label={t('solo.ytdAnnualized', { amount: formatTax(netProfitYTD) })}
            />
          </div>
        </div>
      )}

      {/* Expand/collapse breakdown */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', textAlign: 'left',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '8px 0', fontFamily: 'inherit',
          fontSize: 12.5, color: 'var(--lp-text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}
      >
        <span>{expanded ? '▼' : '▶'} {t('solo.seeBreakdown')}</span>
        <span style={{ fontSize: 11, color: '#475569' }}>
          {t('solo.effectiveMarginal', {
            effective: formatPct(est.effectiveRate),
            marginal:  formatPct(est.marginalRate)
          })}
        </span>
      </button>

      {expanded && (
        <div style={{
          marginTop: 10, padding: '14px 0 0',
          borderTop: '0.5px solid var(--lp-border)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12
        }}>
          {/* SE Tax column */}
          <div>
            <div style={{
              fontSize: 11, color: '#a78bfa',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              fontWeight: 600, marginBottom: 8
            }}>
              {t('solo.seTaxTitle')}
            </div>
            <Line label={t('solo.seNetEarnings')} value={formatTax(est.seBase)} />
            <Line label={t('solo.socialSecurity')} value={formatTax(est.socialSecurityTax)} />
            <Line label={t('solo.medicare')} value={formatTax(est.medicareTax)} />
            {est.additionalMedicare > 0 && (
              <Line label={t('solo.additionalMedicare')}
                    value={formatTax(est.additionalMedicare)} />
            )}
            <Line label={t('solo.totalSeTax')} value={formatTax(est.totalSeTax)} bold />
          </div>

          {/* Federal column */}
          <div>
            <div style={{
              fontSize: 11, color: '#3b82f6',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              fontWeight: 600, marginBottom: 8
            }}>
              {t('solo.federalIncomeTax')}
            </div>
            <Line label={t('solo.netProfit')} value={formatTax(est.netProfit)} />
            <Line label={t('solo.seDeduction')}
                  value={`−${formatTax(est.seDeduction)}`} />
            <Line label={t('solo.stdDeduction')}
                  value={`−${formatTax(est.netProfit - est.seDeduction - est.taxableIncome)}`} />
            <Line label={t('solo.taxableIncome')} value={formatTax(est.taxableIncome)} />
            <Line label={t('solo.federalTax')} value={formatTax(est.federalIncomeTax)} bold />
          </div>

          {/* Footer summary */}
          <div style={{ gridColumn: '1 / -1', marginTop: 8,
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(34,197,94,0.06)',
            border: '0.5px solid rgba(34,197,94,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, color: 'var(--lp-text)', fontWeight: 600 }}>
                {t('solo.annualTotal')}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#22c55e',
                fontFamily: 'monospace' }}>
                {formatTax(est.totalTax)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', marginTop: 4 }}>
              <span style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                {t('solo.quartersSafeHarbor')}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#22c55e',
                fontFamily: 'monospace' }}>
                {t('solo.perQuarter', { amount: formatTax(est.quarterlyDue) })}
              </span>
            </div>
          </div>

          {/* State tax note */}
          {!stateCode && (
            <div style={{ gridColumn: '1 / -1',
              padding: '8px 12px', borderRadius: 7,
              background: 'rgba(251,191,36,0.06)',
              border: '0.5px solid rgba(251,191,36,0.2)',
              fontSize: 11.5, color: '#fbbf24', lineHeight: 1.5
            }}>
              {t('solo.addStateNotePrefix')} <strong>{t('solo.settingsTaxInfo')}</strong> {t('solo.addStateNoteSuffix')}
            </div>
          )}
          {stateCode && (
            <div style={{ gridColumn: '1 / -1',
              padding: '8px 12px', borderRadius: 7,
              background: 'rgba(59,130,246,0.06)',
              border: '0.5px solid rgba(59,130,246,0.2)',
              fontSize: 11.5, color: '#93c5fd', lineHeight: 1.5
            }}>
              {t('solo.stateNote', { state: stateCode })}
            </div>
          )}
        </div>
      )}

      {/* CTA buttons */}
      <div style={{
        display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap'
      }}>
        <a
          href="https://www.irs.gov/payments"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'rgba(34,197,94,0.10)',
            border: '0.5px solid rgba(34,197,94,0.35)',
            color: '#22c55e', fontSize: 12.5, fontWeight: 600,
            textDecoration: 'none', fontFamily: 'inherit'
          }}
        >
          {t('solo.payAtIrs')}
        </a>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ToggleBtn({
  active, onClick, label
}: {
  active: boolean; onClick: () => void; label: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 5,
        background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
        border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 11,
        color: active ? '#60a5fa' : '#64748b',
        fontWeight: active ? 600 : 400
      }}
    >
      {label}
    </button>
  )
}

function Line({
  label, value, bold = false
}: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '3px 0',
      borderTop: bold ? '0.5px solid var(--lp-border)' : 'none',
      paddingTop: bold ? 5 : 3,
      marginTop: bold ? 4 : 0
    }}>
      <span style={{ fontSize: 11.5,
        color: bold ? 'var(--lp-text)' : 'var(--lp-text-muted)',
        fontWeight: bold ? 600 : 400 }}>
        {label}
      </span>
      <span style={{ fontSize: 11.5,
        color: bold ? 'var(--lp-text)' : 'var(--lp-text-muted)',
        fontWeight: bold ? 600 : 400,
        fontFamily: 'monospace' }}>
        {value}
      </span>
    </div>
  )
}