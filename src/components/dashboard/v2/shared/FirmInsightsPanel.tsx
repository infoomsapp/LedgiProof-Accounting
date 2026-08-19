// PATH: src/components/dashboard/v2/shared/FirmInsightsPanel.tsx
//
// QuickBooks-parity insights for the firm dashboards, grouped into one section
// so they don't scatter the layout: AR aging · Cash flow trend · Anomalies ·
// Firm P&L. Pure presentation — every number arrives pre-computed from
// get_firm_insights (Constitution: no UI aggregation). Honest empty states
// (the P&L is empty until transactions are posted to the GL).

import { Inbox, TrendingUp, Search, Calculator } from 'lucide-react'
import SectionCard                from './SectionCard'
import SourceTag                  from './SourceTag'
import { formatCurrency }         from '../../../../lib/currency'
import { useCountUp }             from '../../../../hooks/useCountUp'
import type { FirmInsights }      from '../../../../services/firm-insights.service'

interface Props {
  data:       FirmInsights | null
  loading?:   boolean
  onNavigate: (path: string) => void
  /** ISO 4217 code for amount display. Defaults to 'USD'. */
  currency?:  string
}

// Shared shape for the sub-cards. `loading` is `boolean | undefined` (not
// optional) so the panel can forward its own optional prop under
// exactOptionalPropertyTypes without conditional spreads.
interface CardProps {
  data:       FirmInsights | null
  loading:    boolean | undefined
  onNavigate: (path: string) => void
  currency:   string
}

export default function FirmInsightsPanel({ data, loading, onNavigate, currency = 'USD' }: Props) {
  const cp: CardProps = { data, loading, onNavigate, currency }
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.07em', fontWeight: 600, marginBottom: 10
      }}>
        Insights
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 12
      }}>
        <ArAgingCard   {...cp} />
        <CashflowCard  {...cp} />
        <AnomaliesCard {...cp} />
        <PlCard        {...cp} />
      </div>
    </div>
  )
}

// ── AR aging ─────────────────────────────────────────────────────────────────
function ArAgingCard({ data, loading, onNavigate, currency }: CardProps) {
  const fmt = (n: number) => formatCurrency(n, currency, { compact: true })
  const ar = data?.ar_aging
  const rows: Array<[string, keyof NonNullable<typeof ar>['buckets'], string]> = [
    ['Current',   'current',  'var(--sem-green)'],
    ['1–30 days', 'd1_30',    'var(--sem-blue)'],
    ['31–60',     'd31_60',   'var(--sem-amber)'],
    ['61–90',     'd61_90',   'var(--sem-amber)'],
    ['90+ days',  'd90_plus', 'var(--sem-red)']
  ]
  const total = ar?.total_outstanding ?? 0

  return (
    <SectionCard title="AR aging" icon={Inbox} right={
      <button onClick={() => onNavigate('/invoices')} className="lp-btn-outline">Invoices →</button>
    }>
      {loading ? <Skeleton /> : total <= 0 ? (
        <Empty text="No outstanding invoices." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {rows.map(([label, key, color]) => {
            const b = ar!.buckets[key]
            const pct = total > 0 ? Math.round((b.amount / total) * 100) : 0
            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--lp-text-muted)' }}>{label}</span>
                <div style={{ height: 8, background: 'var(--lp-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                </div>
                <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--lp-text)' }}>{fmt(b.amount)}</span>
              </div>
            )
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, marginTop: 2, borderTop: '0.5px solid var(--lp-border)' }}>
            <span style={{ fontSize: 11, color: 'var(--lp-text-muted)' }}>Outstanding</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(total)}</span>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ── Cash flow trend ──────────────────────────────────────────────────────────
function CashflowCard({ data, loading, currency }: CardProps) {
  const fmt = (n: number) => formatCurrency(n, currency, { compact: true })
  const months = data?.cashflow?.months ?? []
  const peak = Math.max(1, ...months.map(m => Math.max(m.income, m.expenses)))
  const hasActivity = months.some(m => m.income !== 0 || m.expenses !== 0)

  return (
    <SectionCard title="Cash flow" icon={TrendingUp} right={
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SourceTag label="Bank feed" title="Verified bank-feed transactions over time" />
        <span style={{ fontSize: 10, color: 'var(--lp-text-muted)' }}>{months.length} mo</span>
      </div>
    }>
      {loading ? <Skeleton /> : !hasActivity ? (
        <Empty text="No verified activity yet." />
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 88, marginBottom: 6 }}>
            {months.map(m => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 72 }}>
                  <div title={`Income ${fmt(m.income)}`}
                       style={{ width: 7, height: `${(m.income / peak) * 100}%`, background: 'var(--sem-green)', borderRadius: 2, alignSelf: 'flex-end' }} />
                  <div title={`Expenses ${fmt(m.expenses)}`}
                       style={{ width: 7, height: `${(m.expenses / peak) * 100}%`, background: 'var(--sem-red)', borderRadius: 2, alignSelf: 'flex-end' }} />
                </div>
                <span style={{ fontSize: 9, color: 'var(--lp-text-muted)' }}>{m.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--lp-text-muted)' }}>
            <span><span style={{ color: 'var(--sem-green)' }}>■</span> Income</span>
            <span><span style={{ color: 'var(--sem-red)' }}>■</span> Expenses</span>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ── Anomalies (semaphore red as insight) ─────────────────────────────────────
function AnomaliesCard({ data, loading, onNavigate, currency: _currency }: CardProps) {
  const a = data?.anomalies
  const openAnim = useCountUp(a?.open ?? 0)
  return (
    <SectionCard title="Anomalies" icon={Search} right={
      <button onClick={() => onNavigate('/transactions?status=red')} className="lp-btn-outline">Review →</button>
    }>
      {loading ? <Skeleton /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: (a?.open ?? 0) > 0 ? 'var(--sem-red)' : 'var(--sem-green)', fontFamily: 'monospace' }}>
              {Math.round(openAnim)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 3 }}>
              open {(a?.open ?? 0) === 1 ? 'anomaly' : 'anomalies'} — caught by the engine
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--lp-text-muted)' }}>
            <span><strong style={{ color: 'var(--lp-text)' }}>{a?.flagged_this_month ?? 0}</strong> flagged this month</span>
            <span><strong style={{ color: 'var(--sem-green)' }}>{a?.resolved_this_month ?? 0}</strong> resolved</span>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ── Firm P&L (from the GL) ───────────────────────────────────────────────────
function PlCard({ data, loading, onNavigate, currency }: CardProps) {
  const fmt = (n: number) => formatCurrency(n, currency, { compact: true })
  const pl = data?.pl
  const hasData = (pl?.lines?.length ?? 0) > 0
  const netIncomeAnim = useCountUp(pl?.net_income ?? 0)

  return (
    <SectionCard title="P&L (firm)" icon={Calculator} right={
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SourceTag label="General ledger" title="From posted journal entries (accrual/accounting basis) — not the bank feed" />
        <button onClick={() => onNavigate('/reports')} className="lp-btn-outline">Reports →</button>
      </div>
    }>
      {loading ? <Skeleton /> : !hasData ? (
        <Empty text="No posted ledger entries yet. The P&L fills in once transactions are posted to accounts." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <PlRow label="Income"   value={fmt(pl!.total_income)}  color="var(--sem-green)" />
          <PlRow label="Expenses" value={fmt(pl!.total_expense)} color="var(--sem-red)" />
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '0.5px solid var(--lp-border)' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Net income</span>
            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace',
              color: pl!.net_income >= 0 ? 'var(--sem-green)' : 'var(--sem-red)' }}>
              {fmt(netIncomeAnim)}
            </span>
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
            Year {pl!.year}{pl!.month ? ` · month ${pl!.month}` : ' · YTD'}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

function PlRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontFamily: 'monospace', color }}>{value}</span>
    </div>
  )
}

// ── Bits ─────────────────────────────────────────────────────────────────────
function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: '18px 6px', textAlign: 'center', fontSize: 11.5, color: 'var(--lp-text-muted)', lineHeight: 1.5 }}>
      {text}
    </div>
  )
}

function Skeleton() {
  return <div style={{ height: 88, borderRadius: 8, background: 'var(--lp-surface-2)', opacity: 0.5 }} />
}
