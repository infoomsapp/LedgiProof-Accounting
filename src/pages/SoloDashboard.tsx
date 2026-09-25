// PATH: src/pages/SoloDashboard.tsx
//
// CSS-TODO (file-level): remaining hardcoded values are:
//   · var(--sem-red-soft) (red-400, expense KPI) — needs --sem-red-soft var()
//   · rgba(239,68,68,0.15/0.3/0.4) — urgent banner gradations, no var() yet
//   · var(--sem-blue-bg-strong) — active period selector bg, no var() yet
//   · linear-gradient(...#3b82f6,#2563eb) — period pill active state
//   · rgba(255,255,255,0.03/0.04) — dark-mode generic overlays
// Direct mappings migrated.
//
// Entrepreneur (self-employed) dashboard. Replaces the standard Dashboard for
// users with workspace_kind = 'solo' (and account_type = 'self_employed').
//
// Organised by CADENCE into two tabs so the entrepreneur isn't overwhelmed:
//   · "Overview" (default, daily): needs-attention (pending review + overdue
//     invoices) → money glance (KPI strip + recurring subscriptions) →
//     recent activity.
//   · "Taxes" (periodic): quarterly tax estimate (hero) → tax set-aside →
//     Schedule C (the one detailed P&L, with export) → mileage.
//
// Dedupe: the old layout showed profit three times (KPI strip + ScheduleC
// preview + PLSnapshotCard). PLSnapshotCard is dropped; KPIs are the money
// glance, Schedule C is the detailed tax P&L.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation }     from 'react-i18next'
import { useAuthStore }       from '../store/auth.store'
import { useOrgStore }        from '../store/org.store'
import { useSoloDashboard }   from '../hooks/useSoloDashboard'
import { SCHEDULE_C_LINE_LABELS, type ScheduleCData } from '../services/solo-dashboard.service'
import { useMileageSummary, useMileageEntries, useAddMileage } from '../hooks/useMileage'

import QuarterlyTaxCard       from '../components/solo/QuarterlyTaxCard'
import ScheduleCPreview       from '../components/solo/ScheduleCPreview'
import MileageCard            from '../components/solo/MileageCard'
import PendingReviewCard      from '../components/solo/PendingReviewCard'
import OverdueInvoicesCard    from '../components/solo/OverdueInvoicesCard'
import RecurringSubscriptionsCard from '../components/solo/RecurringSubscriptionsCard'
import Icon, { type IconName } from '../components/ui/Icon'
import TaxSetAsideCard        from '../components/solo/TaxSetAsideCard'
import UploadReceiptDialog    from '../components/upload/UploadReceiptDialog'
import { formatCurrency } from '../lib/currency'

const fmtCur = (n: number) => formatCurrency(n, 'USD', { maximumFractionDigits: 0 })

// `rangeKey` holds an i18n KEY — resolved with t() at the render site.
const QUARTERS = [
  { num: 1, label: 'Q1', rangeKey: 'solo.q1Range' },
  { num: 2, label: 'Q2', rangeKey: 'solo.q2Range' },
  { num: 3, label: 'Q3', rangeKey: 'solo.q3Range' },
  { num: 4, label: 'Q4', rangeKey: 'solo.q4Range' }
]

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Descarga real del CSV de Schedule C a partir de las líneas ya computadas. */
function downloadScheduleCCsv(sc: ScheduleCData, year: number) {
  const rows = [...sc.lines]
    .sort((a, b) => a.line_number - b.line_number)
    .map(l => [
      l.line_number,
      SCHEDULE_C_LINE_LABELS[l.line_number] ?? `Line ${l.line_number}`,
      Number(l.line_total).toFixed(2)
    ].map(csvCell).join(','))
  const csv = ['Line,Description,Amount', ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `schedule-c-${year}.csv`; a.click()
  URL.revokeObjectURL(url)
}

export default function SoloDashboard() {
  const navigate = useNavigate()
  const { t }    = useTranslation()
  const { profile, membership } = useAuthStore()
  const { activeOrg } = useOrgStore()
  const orgId = membership?.org_id ?? ''

  const sd = useSoloDashboard(orgId, true)

  // Real mileage (persisted; deduction snapshotted at official rate by date)
  const mileage        = useMileageSummary(orgId, sd.year, null)
  const mileageEntries = useMileageEntries(orgId, sd.year, null)
  const addMileage     = useAddMileage(orgId, sd.year, null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  async function handleExportScheduleCPdf(sc: ScheduleCData) {
    setExportingPdf(true)
    try {
      // pdf-lib (~400 kB) is only needed here, on click — loaded on demand
      // so it stays out of the Dashboard chunk every solo user downloads.
      const { generateScheduleCPdf, downloadScheduleCPdf } =
        await import('../services/schedule-c-pdf.service')
      const bytes = await generateScheduleCPdf(sc, sd.year, activeOrg?.name ?? null)
      downloadScheduleCPdf(bytes, sd.year)
    } finally {
      setExportingPdf(false)
    }
  }
  const [tab, setTab] = useState<'overview' | 'taxes'>('overview')

  if (sd.loading) {
    return (
      <div style={{
        padding: 48, textAlign: 'center', color: 'var(--lp-text-muted)'
      }}>
        {t('solo.loadingDashboard')}
      </div>
    )
  }

  if (sd.error || !sd.dashboard) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <div style={{
          padding: '14px 18px',
          background: 'var(--sem-red-bg)',
          border: '0.5px solid var(--sem-red-border)',
          borderRadius: 10,
          color: 'var(--sem-red)', fontSize: 13
        }}>
          ⚠ {sd.error ?? t('solo.couldNotLoad')}
          <button onClick={sd.refresh} style={{
            marginLeft: 14, padding: '4px 10px', borderRadius: 6,
            background: 'var(--sem-red-bg-strong)',
            border: '0.5px solid rgba(239,68,68,0.4)',
            color: 'var(--sem-red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5
          }}>
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  const d = sd.dashboard
  const sc = sd.scheduleC
  const stateCode = d.profile?.state_code ?? null

  const hourNow   = new Date().getHours()
  const timeOfDay = hourNow < 12 ? 'Morning' : hourNow < 18 ? 'Afternoon' : 'Evening'
  const firstName = profile?.display_name?.split(' ')[0]
    ?? profile?.email?.split('@')[0]
  const greeting  = firstName
    ? t(`dashboard.greeting${timeOfDay}`, { name: firstName })
    : t(`dashboard.greeting${timeOfDay}NoName`)

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, marginBottom: 24, flexWrap: 'wrap'
      }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: 'var(--lp-text)',
            letterSpacing: '-0.01em', margin: 0
          }}>
            {greeting} 👋
          </h1>
          <p style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 5 }}>
            {t('solo.entrepreneurWorkspace')}
            {sd.refreshing && (
              <span style={{ marginLeft: 8, color: 'var(--lp-accent)' }}>
                {t('solo.refreshing')}
              </span>
            )}
          </p>
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <div style={lblHeader}>{t('solo.year')}</div>
            <select
              value={sd.year}
              onChange={e => sd.setYear(parseInt(e.target.value))}
              className="lp-input"
              style={{ width: 100 }}
            >
              {[sd.year - 1, sd.year, sd.year + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={lblHeader}>{t('solo.quarter')}</div>
            <div style={{
              display: 'inline-flex', gap: 2, padding: 2,
              background: 'var(--lp-surface)',
              border: '0.5px solid var(--lp-border)',
              borderRadius: 8
            }}>
              {QUARTERS.map(q => (
                <button
                  key={q.num}
                  onClick={() => sd.setQuarter(q.num)}
                  title={t(q.rangeKey)}
                  style={{
                    padding: '5px 10px', borderRadius: 6,
                    background: sd.quarter === q.num
                      ? 'var(--sem-blue-bg-strong)' : 'transparent',
                    border: 'none',
                    color: sd.quarter === q.num ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
                    fontSize: 11.5, fontWeight: sd.quarter === q.num ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit'
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Upload receipt button */}
          <button
            onClick={() => setUploadOpen(true)}
            disabled={!orgId}
            title={t('solo.uploadReceiptTitle')}
            style={{
              padding: '7px 14px', borderRadius: 8,
              background: orgId
                ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                : 'rgba(255,255,255,0.04)',
              border: 'none',
              color: orgId ? '#fff' : 'var(--lp-text-muted)',
              fontSize: 12.5, fontWeight: 600,
              cursor: orgId ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'opacity 0.15s'
            }}
            onMouseEnter={e => { if (orgId) e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {t('solo.uploadReceipt')}
          </button>
        </div>
      </div>

      {/* ── Tab switcher (by cadence) ─────────────────────────────────── */}
      <div style={{
        display: 'inline-flex', gap: 2, padding: 3, marginBottom: 22,
        background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
        borderRadius: 10
      }}>
        {([['overview', 'solo.tabOverview'], ['taxes', 'solo.tabTaxes']] as const).map(([id, labelKey]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12.5,
              background: tab === id ? 'var(--sem-blue-bg-strong)' : 'transparent',
              color: tab === id ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
              fontWeight: tab === id ? 600 : 400
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW — daily: attention → money → activity ══════════════ */}
      {tab === 'overview' && (
        <>
          {/* Needs your attention */}
          <div style={sectionLabel}>{t('solo.needsAttention')}</div>
          <PendingReviewCard pending={d.pending} recentTx={d.recent_tx} />
          <OverdueInvoicesCard orgId={orgId} />

          {/* Your money */}
          <div style={{ ...sectionLabel, marginTop: 24 }}>{t('solo.yourMoney', { quarter: sd.quarter })}</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10, marginBottom: 16
          }}>
            <Kpi label={t('solo.kpiIncome',   { quarter: sd.quarter })} value={fmtCur(d.quarter_kpis.income)}   color="var(--sem-green)" icon="income" />
            <Kpi label={t('solo.kpiExpenses', { quarter: sd.quarter })} value={fmtCur(d.quarter_kpis.expenses)} color="var(--sem-red-soft)" icon="expense" />
            <Kpi label={t('solo.kpiNetProfitQuarter', { quarter: sd.quarter })}
                 value={fmtCur(d.quarter_kpis.net_profit)}
                 sub={t('solo.marginPct', { pct: d.quarter_kpis.margin_pct })}
                 color={d.quarter_kpis.net_profit >= 0 ? 'var(--sem-green)' : 'var(--sem-red)'}
                 icon="trendUp" />
            <Kpi label={t('solo.ytdNetProfit')}
                 value={fmtCur(d.ytd.net_profit)}
                 sub={t('dashboard.transactionsCount', { count: d.ytd.tx_count })}
                 color={d.ytd.net_profit >= 0 ? 'var(--sem-green)' : 'var(--sem-red)'}
                 icon="chartBar"
                 onClick={() => navigate('/transactions')} />
          </div>
          <RecurringSubscriptionsCard orgId={orgId} />

          {/* Recent activity */}
          {d.recent_tx.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{
                ...sectionLabel, marginBottom: 10,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                {t('dashboard.recentActivity')}
                <button
                  onClick={() => navigate('/transactions')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: 'var(--lp-accent)', fontFamily: 'inherit',
                    textTransform: 'none', letterSpacing: 0, fontWeight: 400
                  }}
                >
                  {t('common.viewAll')}
                </button>
              </div>
              <div style={{
                background: 'var(--lp-surface)',
                border: '0.5px solid var(--lp-border)',
                borderRadius: 10, overflow: 'hidden'
              }}>
                {d.recent_tx.slice(0, 6).map((tx, i) => (
                  <div
                    key={tx.tx_id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 1fr auto',
                      gap: 12, padding: '9px 14px',
                      borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.03)' : 'none'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center' }}><SemDot s={tx.semaphore} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, color: 'var(--lp-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {tx.merchant ?? tx.description ?? t('dashboard.transactionFallback')}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', marginTop: 1 }}>
                        {tx.transaction_date}
                      </div>
                    </div>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 12.5, fontWeight: 500,
                      color: tx.amount >= 0 ? 'var(--sem-green)' : 'var(--sem-red-soft)', whiteSpace: 'nowrap'
                    }}>
                      {fmtCur(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ TAXES — periodic: estimate → set-aside → Schedule C → miles ══ */}
      {tab === 'taxes' && (
        <>
          <QuarterlyTaxCard
            netProfitYTD={d.ytd.net_profit}
            netProfitQ={d.quarter_kpis.net_profit}
            quarter={sd.quarter}
            year={sd.year}
            quarterDueDate={d.period.quarter_due_date}
            stateCode={stateCode}
          />

          <TaxSetAsideCard
            orgId={orgId}
            year={sd.year}
            userId={membership?.user_id ?? null}
            netProfitYTD={d.ytd.net_profit}
          />

          {/* Schedule C (detailed P&L) + Mileage */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
            gap: 16, marginBottom: 16
          }}>
            <div>
              {sc && (
                <ScheduleCPreview
                  data={sc}
                  year={sd.year}
                  onExportPdf={() => handleExportScheduleCPdf(sc)}
                  pdfLoading={exportingPdf}
                  onExportCsv={() => downloadScheduleCCsv(sc, sd.year)}
                />
              )}
            </div>
            <div>
              <MileageCard
                totalMilesYTD={mileage.data?.totalMiles ?? 0}
                totalDeduction={mileage.data?.totalDeduction ?? 0}
                entries={mileageEntries.data ?? []}
                saving={addMileage.isPending}
                onAddMileage={async (entry) => {
                  if (!membership?.user_id) return
                  await addMileage.mutateAsync({
                    orgId,
                    userId:  membership.user_id,
                    miles:   entry.miles,
                    date:    entry.date,
                    ...(entry.purpose ? { purpose: entry.purpose } : {})
                  })
                }}
              />
            </div>
          </div>
        </>
      )}

      {/* Upload receipt modal */}
      {orgId && (
        <UploadReceiptDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          orgId={orgId}
          onUploaded={() => sd.refresh()}
        />
      )}

    </div>
  )
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function Kpi({
  label, value, sub, color, icon, onClick
}: {
  label: string; value: string; sub?: string
  color: string; icon: IconName; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 16px', borderRadius: 11,
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.12s'
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = color + '50' }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.borderColor = 'var(--lp-border)' }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6
      }}>
        <span style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em'
        }}>
          {label}
        </span>
        <span style={{ color, display: 'flex' }}><Icon name={icon} size={14} /></span>
      </div>
      <div style={{
        fontSize: 20, fontWeight: 700, color,
        letterSpacing: '-0.02em', fontFamily: 'monospace'
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

const SEM_DOT_COLOR: Record<string, string> = {
  red: '#ef4444', amber: '#f59e0b', green: '#22c55e', blue: '#3b82f6'
}

function SemDot({ s }: { s: string }) {
  const color = SEM_DOT_COLOR[s] ?? SEM_DOT_COLOR.blue
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}`, display: 'inline-block' }} />
}

const lblHeader: React.CSSProperties = {
  fontSize: 10, color: 'var(--lp-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 4, fontWeight: 600
}

// Section divider label inside a tab — gives visual hierarchy so cards don't
// all read as equal-weight.
const sectionLabel: React.CSSProperties = {
  fontSize: 11, color: 'var(--lp-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  fontWeight: 600, marginBottom: 12
}