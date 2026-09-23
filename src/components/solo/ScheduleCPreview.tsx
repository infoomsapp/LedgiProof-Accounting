// PATH: src/components/solo/ScheduleCPreview.tsx
// Killer feature: live preview of IRS Form 1040 Schedule C lines.
// Shows each line populated with the user's actual data.
// Export buttons: PDF (preparer-ready) and CSV.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  SCHEDULE_C_LINE_LABELS,
  type ScheduleCData
} from '../../services/solo-dashboard.service'
import { formatCurrency } from '../../lib/currency'

interface Props {
  data: ScheduleCData
  year: number
  onExportPdf?: () => void
  onExportCsv?: () => void
}

const fmt = (n: number) => formatCurrency(n, 'USD', { maximumFractionDigits: 0 })

export default function ScheduleCPreview({ data, year, onExportPdf, onExportCsv }: Props) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const [expandedLine, setExpandedLine] = useState<number | null>(null)

  // Sort lines: Line 1 (income) first, then expense lines 8-27
  const sorted = [...data.lines].sort((a, b) => a.line_number - b.line_number)
  const incomeLines  = sorted.filter(l => l.account_type === 'income')
  const expenseLines = sorted.filter(l => l.account_type === 'expense')

  // Hide lines with $0 unless user clicked "show all"
  const visibleExpenses = showAll
    ? expenseLines
    : expenseLines.filter(l => Math.abs(l.line_total) > 0.005)

  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: '0.5px solid var(--lp-border)',
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '0.5px solid var(--lp-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10
      }}>
        <div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: 'var(--lp-text)',
            letterSpacing: '-0.01em'
          }}>
            {t('solo.scheduleCTitle', { year })}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            {t('solo.scheduleCSub')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {onExportPdf && (
            <button
              onClick={onExportPdf}
              style={btnPrimary}
            >
              {t('solo.exportPdf')}
            </button>
          )}
          {onExportCsv && (
            <button
              onClick={onExportCsv}
              style={btnGhost}
            >
              {t('solo.exportCsv')}
            </button>
          )}
        </div>
      </div>

      {/* Income section */}
      <div style={sectionStyle}>
        <div style={sectionHeader('#22c55e')}>{t('solo.income')}</div>
        {incomeLines.length === 0 ? (
          <EmptyRow text={t('solo.noIncomeRecorded')} />
        ) : (
          incomeLines.map(line => (
            <ScheduleCLineRow
              key={line.line_number}
              line={line}
              expanded={expandedLine === line.line_number}
              onToggle={() => setExpandedLine(
                expandedLine === line.line_number ? null : line.line_number
              )}
              colorAccent="#22c55e"
            />
          ))
        )}

        {/* Line 1 total emphasis */}
        <TotalRow
          line={t('solo.lineNumber', { n: 1 })}
          label={t('solo.grossReceipts')}
          value={data.totals.gross_receipts}
          color="#22c55e"
        />
      </div>

      {/* Expenses section */}
      <div style={sectionStyle}>
        <div style={sectionHeader('#f87171')}>
          {t('solo.expensesLines')}
          {!showAll && expenseLines.length > visibleExpenses.length && (
            <button
              onClick={() => setShowAll(true)}
              style={{
                marginLeft: 10, fontSize: 10.5, padding: '2px 7px',
                background: 'rgba(255,255,255,0.05)',
                border: '0.5px solid var(--lp-border)',
                borderRadius: 100,
                color: 'var(--lp-text-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textTransform: 'none', letterSpacing: 0, fontWeight: 400
              }}
            >
              {t('solo.emptyLinesCount', { count: expenseLines.length - visibleExpenses.length })}
            </button>
          )}
        </div>

        {visibleExpenses.length === 0 ? (
          <EmptyRow text={t('solo.noExpensesRecorded')} />
        ) : (
          visibleExpenses.map(line => (
            <ScheduleCLineRow
              key={line.line_number}
              line={line}
              expanded={expandedLine === line.line_number}
              onToggle={() => setExpandedLine(
                expandedLine === line.line_number ? null : line.line_number
              )}
              colorAccent="#f87171"
            />
          ))
        )}

        <TotalRow
          line={t('solo.lineNumber', { n: 28 })}
          label={t('solo.totalExpenses')}
          value={data.totals.total_expenses}
          color="#f87171"
        />
      </div>

      {/* Line 31 — Net profit (the big number) */}
      <div style={{
        padding: '16px 18px',
        background: data.totals.net_profit >= 0
          ? 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.04))'
          : 'linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.04))',
        borderTop: '0.5px solid var(--lp-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'
      }}>
        <div>
          <div style={{
            fontSize: 11, color: 'var(--lp-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600
          }}>
            {data.totals.net_profit >= 0 ? t('solo.line31NetProfit') : t('solo.line31NetLoss')}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
            {t('solo.flowsTo1040')}
          </div>
        </div>
        <div style={{
          fontSize: 26,
          fontWeight: 800,
          color: data.totals.net_profit >= 0 ? '#22c55e' : '#ef4444',
          fontFamily: 'monospace',
          letterSpacing: '-0.02em'
        }}>
          {fmt(data.totals.net_profit)}
        </div>
      </div>

      {/* Unmapped accounts warning */}
      {data.unmapped.length > 0 && (
        <div style={{
          padding: '10px 18px',
          background: 'rgba(251,191,36,0.06)',
          borderTop: '0.5px solid rgba(251,191,36,0.2)',
          fontSize: 11.5, color: '#fbbf24', lineHeight: 1.6
        }}>
          ⚠ <strong>{data.unmapped.length === 1
              ? t('solo.accountCountOne',   { count: data.unmapped.length })
              : t('solo.accountCountOther', { count: data.unmapped.length })}</strong>{' '}
          {t('solo.unmappedWarningMid')}{' '}
          <strong>{t('nav.chartOfAccounts')}</strong> {t('solo.unmappedWarningEnd')}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function ScheduleCLineRow({
  line, expanded, onToggle, colorAccent
}: {
  line: ScheduleCData['lines'][number]
  expanded: boolean
  onToggle: () => void
  colorAccent: string
}) {
  const { t } = useTranslation()
  const label = SCHEDULE_C_LINE_LABELS[line.line_number]
    ?? t('solo.lineNumber', { n: line.line_number })
  const hasDetails = line.accounts.length > 0

  return (
    <>
      <button
        onClick={hasDetails ? onToggle : undefined}
        style={{
          width: '100%', display: 'grid',
          gridTemplateColumns: '60px 1fr auto',
          gap: 12, padding: '8px 18px',
          background: expanded ? 'rgba(255,255,255,0.03)' : 'transparent',
          border: 'none', textAlign: 'left',
          cursor: hasDetails ? 'pointer' : 'default',
          fontFamily: 'inherit',
          borderTop: '0.5px solid rgba(255,255,255,0.03)'
        }}
      >
        <span style={{
          fontFamily: 'monospace', fontSize: 11.5,
          color: '#64748b', fontWeight: 500
        }}>
          {t('solo.lineNumber', { n: line.line_number })}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--lp-text)' }}>
          {label}
          {hasDetails && (
            <span style={{ marginLeft: 6, fontSize: 10, color: '#475569' }}>
              {expanded ? '▼' : '▶'} {line.accounts.length === 1
                ? t('solo.accountCountOne',   { count: line.accounts.length })
                : t('solo.accountCountOther', { count: line.accounts.length })}
            </span>
          )}
        </span>
        <span style={{
          fontFamily: 'monospace', fontSize: 12.5,
          color: line.line_total >= 0 ? colorAccent : 'var(--lp-text-muted)',
          fontWeight: 500
        }}>
          {fmt(line.line_total)}
        </span>
      </button>

      {expanded && hasDetails && (
        <div style={{
          padding: '6px 18px 10px 90px',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '0.5px solid rgba(255,255,255,0.03)'
        }}>
          {line.accounts.map(acc => (
            <div
              key={acc.account_id}
              style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '3px 0', fontSize: 11.5
              }}
            >
              <span style={{ color: 'var(--lp-text-muted)' }}>
                <span style={{ fontFamily: 'monospace', color: '#475569' }}>
                  {acc.account_code}
                </span>
                {' · '}
                {acc.account_name}
              </span>
              <span style={{
                fontFamily: 'monospace',
                color: 'var(--lp-text-muted)'
              }}>
                {fmt(acc.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function TotalRow({
  line, label, value, color
}: {
  line: string; label: string; value: number; color: string
}) {
  return (
    <div style={{
      padding: '10px 18px',
      background: `${color}08`,
      borderTop: `0.5px solid ${color}25`,
      display: 'grid',
      gridTemplateColumns: '60px 1fr auto',
      gap: 12,
      alignItems: 'baseline'
    }}>
      <span style={{
        fontFamily: 'monospace', fontSize: 11,
        color, fontWeight: 600
      }}>
        {line}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 600 }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'monospace', fontSize: 14,
        color, fontWeight: 700
      }}>
        {fmt(value)}
      </span>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{
      padding: '14px 18px',
      fontSize: 12, color: '#475569',
      textAlign: 'center', fontStyle: 'italic'
    }}>
      {text}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  borderBottom: '0.5px solid var(--lp-border)'
}

const sectionHeader = (color: string): React.CSSProperties => ({
  padding: '10px 18px',
  fontSize: 11,
  color,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  background: `${color}08`,
  display: 'flex',
  alignItems: 'center'
})

const btnPrimary: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 7,
  background: 'rgba(34,197,94,0.10)',
  border: '0.5px solid rgba(34,197,94,0.35)',
  color: '#22c55e',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit'
}

const btnGhost: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 7,
  background: 'transparent',
  border: '0.5px solid var(--lp-border)',
  color: 'var(--lp-text-muted)',
  fontSize: 11.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit'
}