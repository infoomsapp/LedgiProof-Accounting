// PATH: src/pages/Reports.tsx
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useScope }     from '../hooks/useScope'
import { useOrgStore }  from '../store/org.store'
import { db }           from '../lib/supabase'
import { printToPDF, downloadCSV, buildCSV } from '../services/export.service'
import { formatCurrency } from '../lib/currency'
import { formatDate }     from '../lib/dates'
import { toSafeMessage } from '../lib/errors'
import { useAuthStore } from '../store/auth.store'
import BudgetEditor from '../components/reports/BudgetEditor'
import TrialBalanceReport from '../components/reports/TrialBalanceReport'
import GeneralLedgerReport, { onNormalSide } from '../components/reports/GeneralLedgerReport'
import AgingReport, { agingByParty } from '../components/reports/AgingReport'
import { getBudgetVsActual, type BudgetVsActualData } from '../services/budget.service'
import Icon from '../components/ui/Icon'
import {
  getProfitAndLossRange, getTrialBalance, getGeneralLedger, getAging,
  presetRange, formatRange, isoDate, RANGE_PRESETS, AGING_BUCKETS,
  type PlRow, type TrialBalance, type GeneralLedger, type Aging, type RangePreset
} from '../services/reports.service'

const fmt = (n: number) => formatCurrency(n)

interface BSAccount { id: string; code: string; name: string; level: number; balance: number }

interface CashFlowLine { code: string; name: string; bucket: string; amount: number }
interface CashFlowData {
  period: string
  net_income: number
  operating: number; investing: number; financing: number
  net_change: number
  cash_start: number; cash_end: number
  actual_change: number; difference: number
  // False means the account classification does not explain the money that
  // actually moved. Surfaced, never hidden -- an unexplained statement is a
  // question, not an answer.
  reconciles: boolean
  cash_accounts: { code: string; name: string }[]
  lines: CashFlowLine[]
}
interface BSSection  { accounts: BSAccount[]; total: number }
interface BalanceSheetData {
  as_of: string
  assets: BSSection; liabilities: BSSection; equity: BSSection
  net_income: number; assets_total: number; liabilities_total: number
  equity_total: number; difference: number; balanced: boolean
}

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

type ReportKey =
  | 'balance_sheet' | 'pl' | 'cash_flow' | 'budget'
  | 'trial_balance' | 'general_ledger' | 'ar_aging' | 'ap_aging'

// The second element is an i18n KEY (module scope can't call hooks): every
// render site resolves it with t(). The names used to be English literals,
// so a Spanish UI read "Budget vs Actual" ("actual" = current, in Spanish).
const REPORT_TABS: [ReportKey, string][] = [
  ['balance_sheet',  'reports.names.balance_sheet'],
  ['pl',             'reports.names.pl'],
  ['cash_flow',      'reports.names.cash_flow'],
  ['trial_balance',  'reports.names.trial_balance'],
  ['general_ledger', 'reports.names.general_ledger'],
  ['ar_aging',       'reports.names.ar_aging'],
  ['ap_aging',       'reports.names.ap_aging'],
  ['budget',         'reports.names.budget'],
]

const REPORT_TITLES: Record<ReportKey, string> = {
  balance_sheet:  'reports.titles.balance_sheet',
  pl:             'reports.titles.pl',
  cash_flow:      'reports.titles.cash_flow',
  budget:         'reports.titles.budget',
  trial_balance:  'reports.titles.trial_balance',
  general_ledger: 'reports.titles.general_ledger',
  ar_aging:       'reports.titles.ar_aging',
  ap_aging:       'reports.titles.ap_aging',
}

// How each report is scoped in time.
const RANGE_REPORTS  = new Set<ReportKey>(['pl', 'general_ledger'])
const AS_OF_REPORTS  = new Set<ReportKey>(['trial_balance', 'ar_aging', 'ap_aging'])
// Invoices and bills live in the workspace's own books: no aging inside a
// firm's client workspace.
const OWN_BOOKS_ONLY = new Set<ReportKey>(['ar_aging', 'ap_aging'])

// Who may write a budget, mirroring budgets_write (owner/admin/accountant) so
// the editor is only offered where saving will actually succeed. A client
// portal user has no org membership by design and so never sees it.
const BUDGET_EDIT_ROLES = new Set(['owner', 'admin', 'accountant'])

// Real letterhead — the entity's own name, not just a generic report
// title, is the single biggest thing a financial statement needs to look
// legitimate handed to a CPA or filed with taxes.
function ReportLetterhead({ entityName, reportTitle, period }: {
  entityName: string; reportTitle: string; period: string
}) {
  return (
    <div style={{
      textAlign: 'center', marginBottom: 22, paddingBottom: 16,
      borderBottom: '1px solid var(--lp-border)'
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--lp-text)', letterSpacing: '-0.01em' }}>
        {entityName}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text-muted)', marginTop: 5 }}>
        {reportTitle}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
        {period}
      </div>
    </div>
  )
}

function ReportFooter() {
  return (
    <div style={{
      marginTop: 20, paddingTop: 12, borderTop: '0.5px solid var(--lp-border)',
      fontSize: 10.5, color: 'var(--lp-text-muted)', textAlign: 'center'
    }}>
      Prepared with LedgiProof · Generated {formatDate(new Date())}
    </div>
  )
}

function AccountRow({ account, isTotal = false }: { account: BSAccount; isTotal?: boolean }) {
  const indent = (account.level - 1) * 16
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: `${isTotal ? 10 : 6}px 16px`, paddingLeft: 16 + indent,
      borderTop: isTotal ? '0.5px solid var(--lp-border)' : 'none',
      background: isTotal ? 'var(--lp-surface-2)' : 'transparent'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!isTotal && (
          <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--lp-text-stronger)', minWidth:36 }}>
            {account.code}
          </span>
        )}
        <span style={{
          fontSize: isTotal ? 13 : 12.5,
          fontWeight: isTotal ? 600 : account.level === 1 ? 500 : 400,
          color: isTotal ? 'var(--lp-text)' : account.level === 1 ? 'var(--lp-text-muted)' : 'var(--lp-text-muted)'
        }}>
          {account.name}
        </span>
      </div>
      <span style={{
        fontSize: isTotal ? 14 : 12.5, fontWeight: isTotal ? 700 : 400,
        color: account.balance < 0 ? 'var(--sem-red-soft)' : isTotal ? 'var(--lp-text)' : 'var(--lp-text-muted)',
        fontFamily: 'monospace'
      }}>
        {fmt(account.balance)}
      </span>
    </div>
  )
}

function SectionBlock({ title, section, color, bg }: { title: string; section: BSSection; color: string; bg: string }) {
  const nonZero = section.accounts.filter(a => a.balance !== 0 || a.level === 1)
  return (
    <div style={{
      background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
      borderTop: `2px solid ${color}`, borderRadius: '0 0 10px 10px', overflow: 'hidden'
    }}>
      <div style={{ padding:'10px 16px', background:bg,
        fontSize:12, fontWeight:600, color, textTransform:'uppercase', letterSpacing:'0.07em' }}>
        {title}
      </div>
      {nonZero.length === 0 ? (
        <div style={{ padding:16, fontSize:12.5, color:'var(--lp-text-stronger)', textAlign:'center' }}>No balances</div>
      ) : nonZero.map(acc => <AccountRow key={acc.id} account={acc} />)}
      <AccountRow
        account={{ id:'total', code:'', name:`Total ${title}`, level:1, balance: section.total }}
        isTotal
      />
    </div>
  )
}

interface ReportsProps {
  // Lets FirmReportsSummary/PortalOverview embed this page for a client
  // picked outside the normal /clients/:clientId/reports route (whose
  // orgId/clientId normally come from useScope(), which reads
  // organization_memberships). A client-portal user has NO org membership
  // by design (see handle_new_user()'s is_client_portal_invite skip) — for
  // them scope.orgId resolves to '', so orgIdOverride is required, not
  // optional, for that caller. Everything else about the page (Balance
  // Sheet/P&L, year/month controls) works exactly the same.
  orgIdOverride?:      string
  clientIdOverride?:   string
  entityNameOverride?: string
}

export default function Reports({ orgIdOverride, clientIdOverride, entityNameOverride }: ReportsProps = {}) {
  const { t, i18n } = useTranslation()
  // Month names in the interface's language (MONTHS stays English for CSV).
  const monthNames = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(i18n.language, { month: 'long' })),
    [i18n.language])
  // scope.clientId is set when this page is reached inside a firm's client
  // workspace (/clients/:clientId/reports) and null for solo/pyme orgs and
  // for a firm's own org-level view — both real cases, not "show everyone".
  // Without this, a firm with 2+ clients gets every client's accounts and
  // journal entries combined into one Balance Sheet/P&L (found and fixed
  // 2026-08-18, before any visual work on this page).
  const scope  = useScope()
  const orgId  = orgIdOverride ?? scope.orgId
  const clientId = clientIdOverride ?? scope.clientId
  const { activeOrg } = useOrgStore()
  const { membership } = useAuthStore()
  // Mirrors budgets_write. Hiding the editor from someone who cannot save is
  // the point: RLS would reject the write, and a rejected save after filling
  // in thirty accounts is the worst possible way to learn that.
  const canEditBudget = !!membership?.role && BUDGET_EDIT_ROLES.has(membership.role)
  // Letterhead identity: the specific client when scoped to one (a firm's
  // report is for THAT client, not the firm itself), otherwise the org's
  // own name (solo/pyme, or a firm's own org-level view).
  const entityName = entityNameOverride || scope.client?.company_name || scope.client?.display_name
    || activeOrg?.name || 'Financial Reports'
  const now    = new Date()

  const [year,    setYear]   = useState(now.getFullYear())
  const [month,   setMonth]  = useState(now.getMonth() + 1)
  const [report,  setReport] = useState<ReportKey>('balance_sheet')
  const [cfData,  setCfData] = useState<CashFlowData | null>(null)
  const [bvaData, setBvaData] = useState<BudgetVsActualData | null>(null)
  const [showBudgetEditor, setShowBudgetEditor] = useState(false)
  const [bsData,  setBsData] = useState<BalanceSheetData | null>(null)
  const [plData,  setPlData] = useState<PlRow[] | null>(null)
  const [preset,  setPreset] = useState<RangePreset>('this_year')
  const [from,    setFrom]   = useState(presetRange('this_year').from)
  const [to,      setTo]     = useState(presetRange('this_year').to)
  const [asOf,    setAsOf]   = useState(isoDate(now))
  const [tbData,  setTbData] = useState<TrialBalance | null>(null)
  const [glData,  setGlData] = useState<GeneralLedger | null>(null)
  const [agData,  setAgData] = useState<Aging | null>(null)
  const tabs = REPORT_TABS.filter(([k]) => !(clientId && OWN_BOOKS_ONLY.has(k)))

  function choosePreset(p: RangePreset) {
    setPreset(p)
    if (p !== 'custom') {
      const r = presetRange(p)
      setFrom(r.from); setTo(r.to)
    }
  }
  const [loading, setLoading] = useState(false)
  const [error,   setError]  = useState<string | null>(null)
  const [hasRun,  setHasRun] = useState(false)

  const runBalanceSheet = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await db.rpc('get_balance_sheet', {
      p_org_id: orgId, p_as_of_year: year, p_as_of_month: month,
      ...(clientId ? { p_client_id: clientId } : {})
    })
    if (err) setError(toSafeMessage(err, 'Could not run the balance sheet'))
    else setBsData(data as unknown as BalanceSheetData)
    setLoading(false); setHasRun(true)
  }, [orgId, clientId, year, month])

  const runCashFlow = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await db.rpc('get_cash_flow', {
      p_org_id: orgId, p_year: year, p_month: month,
      ...(clientId ? { p_client_id: clientId } : {})
    })
    if (err) setError(toSafeMessage(err, 'Could not run the cash flow statement'))
    else setCfData(data as unknown as CashFlowData)
    setLoading(false); setHasRun(true)
  }, [orgId, clientId, year, month])

  const runBudget = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setBvaData(await getBudgetVsActual({ orgId, clientId, year, month }))
    } catch (e) {
      setError(toSafeMessage(e, 'Could not run the budget report'))
    }
    setLoading(false); setHasRun(true)
  }, [orgId, clientId, year, month])

  // P&L for any date range (get_profit_and_loss_range: the same ledger lines
  // as every other report).
  const runPL = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setPlData((await getProfitAndLossRange(orgId, from, to, clientId)).sort((a, b) => a.code.localeCompare(b.code)))
      setHasRun(true)
    } catch (e) {
      setError(toSafeMessage(e, 'Could not run the profit and loss report'))
    }
    setLoading(false)
  }, [orgId, clientId, from, to])

  const runOther = useCallback(async (key: ReportKey) => {
    setLoading(true); setError(null)
    try {
      if (key === 'trial_balance')  setTbData(await getTrialBalance(orgId, asOf, clientId))
      if (key === 'general_ledger') setGlData(await getGeneralLedger(orgId, from, to, clientId))
      if (key === 'ar_aging')       setAgData(await getAging(orgId, 'ar', asOf))
      if (key === 'ap_aging')       setAgData(await getAging(orgId, 'ap', asOf))
      setHasRun(true)
    } catch (e) {
      setError(toSafeMessage(e, 'Could not run the report'))
    }
    setLoading(false)
  }, [orgId, clientId, from, to, asOf])

  function handleRun() {
    if (report === 'balance_sheet') runBalanceSheet()
    else if (report === 'cash_flow') runCashFlow()
    else if (report === 'budget') runBudget()
    else if (report === 'pl') runPL()
    else runOther(report)
  }

  const incomeRows   = plData?.filter(r => r.type === 'income')  ?? []
  const expenseRows  = plData?.filter(r => r.type === 'expense') ?? []
  const totalIncome  = incomeRows.reduce((s,r)  => s + (r.credit - r.debit),  0)
  const totalExpense = expenseRows.reduce((s,r) => s + (r.debit  - r.credit), 0)
  const netIncome    = totalIncome - totalExpense

  return (
    <div style={{ padding:'28px 32px', flex:1, overflowY:'auto' }}>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="lp-page-title">{t('reports.title')}</h1>
          <p className="lp-page-sub">{t('reports.subtitle')}</p>
        </div>
        {hasRun && !loading && (
          <div style={{ display:'flex', gap:8 }}>
            <button
              onClick={() => printToPDF(`${entityName} — ${t(REPORT_TITLES[report])} ${
                RANGE_REPORTS.has(report) ? `${from} to ${to}` : AS_OF_REPORTS.has(report) ? asOf : `${year}-${String(month).padStart(2,'0')}`}`)}
              className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}
            >
              ⬇ PDF
            </button>
            {report === 'pl' && plData && (
              <button
                onClick={() => {
                  const rows = plData.map(r => [r.code, r.name, r.type,
                    r.type === 'income' ? r.credit - r.debit : r.debit - r.credit])
                  downloadCSV(buildCSV(['Code','Account','Type','Amount'], rows), `pl-${from}-to-${to}.csv`)
                }}
                className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}
              >
                ⬇ CSV
              </button>
            )}
            {report === 'budget' && bvaData && (
              <button
                onClick={() => {
                  const rows: (string | number)[][] = bvaData.lines.map(l => [
                    l.code, l.name, l.budget, l.actual, l.remaining,
                    l.over_pct === null ? '' : `${l.over_pct}%`
                  ])
                  if (bvaData.period_budget > 0) {
                    rows.unshift(['', 'Monthly spending ceiling', bvaData.period_budget,
                      bvaData.total_actual, bvaData.period_budget - bvaData.total_actual, ''])
                  }
                  downloadCSV(buildCSV(['Code','Account','Budget','Actual','Remaining','Over'], rows),
                    `budget-vs-actual-${year}-${month}.csv`)
                }}
                className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}
              >
                ⬇ CSV
              </button>
            )}
            {report === 'trial_balance' && tbData && (
              <button
                onClick={() => downloadCSV(buildCSV(['Code','Account','Type','Debit','Credit'],
                  tbData.rows.map(r => [r.code, r.name, r.type, r.debit, r.credit])), `trial-balance-${tbData.as_of}.csv`)}
                className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}
              >
                ⬇ CSV
              </button>
            )}
            {report === 'general_ledger' && glData && (
              <button
                onClick={() => downloadCSV(buildCSV(['Code','Account','Date','Type','Description','Debit','Credit','Balance'],
                  glData.accounts.flatMap(a => a.lines.map(l => [a.code, a.name, l.date, l.kind, l.memo ?? '',
                    l.debit, l.credit, onNormalSide(a, Number(l.balance))]))), `general-ledger-${from}-to-${to}.csv`)}
                className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}
              >
                ⬇ CSV
              </button>
            )}
            {(report === 'ar_aging' || report === 'ap_aging') && agData && (
              <button
                onClick={() => downloadCSV(buildCSV(
                  [agData.kind === 'ar' ? 'Customer' : 'Vendor', ...AGING_BUCKETS.map(b => b.label), 'Total'],
                  agingByParty(agData).map(r => [r.party, ...AGING_BUCKETS.map(b => r.buckets[b.key]), r.total])),
                  `${agData.kind}-aging-${agData.as_of}.csv`)}
                className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}
              >
                ⬇ CSV
              </button>
            )}
            {report === 'balance_sheet' && bsData && (
              <button
                onClick={() => {
                  const sectionRows = (label: string, section: BSSection) =>
                    section.accounts.map(a => [label, a.code, a.name, a.balance])
                  const rows = [
                    ...sectionRows('Asset',      bsData.assets),
                    ...sectionRows('Liability',  bsData.liabilities),
                    ...sectionRows('Equity',     bsData.equity),
                    ['Net Income', '', 'Net Income (current period)', bsData.net_income],
                  ]
                  downloadCSV(buildCSV(['Section','Code','Account','Balance'], rows), `balance-sheet-${year}-${month}.csv`)
                }}
                className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}
              >
                ⬇ CSV
              </button>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="lp-card" style={{ marginBottom:20, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>{t('reports.controls.report')}</label>
          <div style={{ display:'flex', flexWrap:'wrap' }}>
            {/* Rounding is keyed on position, not on a report's name: with a
                fourth report the old name-based rule gave every button after
                the first a right-rounded edge. */}
            {tabs.map(([k,l], i) => (
              <button key={k} onClick={() => { setReport(k); setHasRun(false); setShowBudgetEditor(false) }} style={{
                padding:'8px 16px', cursor:'pointer', fontFamily:'inherit', fontSize:13,
                fontWeight: report===k ? 500 : 400,
                background: report===k ? 'var(--lp-accent)' : 'rgba(255,255,255,0.04)',
                color:      report===k ? '#fff'    : 'var(--lp-text-muted)',
                border:'0.5px solid var(--lp-border)', transition:'all 0.12s',
                borderRadius: i === 0 ? '7px 0 0 7px'
                            : i === tabs.length - 1 ? '0 7px 7px 0' : 0,
                borderLeft:   i === 0 ? undefined : 'none'
              }}>{t(l)}</button>
            ))}
          </div>
        </div>

        {RANGE_REPORTS.has(report) && (
          <>
            <div>
              <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>{t('reports.controls.period')}</label>
              <select className="lp-input" style={{ width:140 }} value={preset}
                onChange={e => choosePreset(e.target.value as RangePreset)}>
                {RANGE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>{t('reports.controls.from')}</label>
              <input type="date" className="lp-input" value={from}
                onChange={e => { setFrom(e.target.value); setPreset('custom') }} />
            </div>
            <div>
              <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>{t('reports.controls.to')}</label>
              <input type="date" className="lp-input" value={to}
                onChange={e => { setTo(e.target.value); setPreset('custom') }} />
            </div>
          </>
        )}

        {AS_OF_REPORTS.has(report) && (
          <div>
            <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>{t('reports.controls.asOf')}</label>
            <input type="date" className="lp-input" value={asOf} onChange={e => setAsOf(e.target.value)} />
          </div>
        )}

        {!RANGE_REPORTS.has(report) && !AS_OF_REPORTS.has(report) && (<>
        <div>
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>{t('reports.controls.year')}</label>
          <select className="lp-input" style={{ width:90 }} value={year}
            onChange={e => setYear(Number(e.target.value))}>
            {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y =>
              <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>
            {report === 'balance_sheet' ? t('reports.controls.asOfMonth')
              : report === 'budget' || report === 'cash_flow' ? t('reports.controls.month')
              : t('reports.controls.throughMonth')}
          </label>
          <select className="lp-input" style={{ width:130 }} value={month}
            onChange={e => setMonth(Number(e.target.value))}>
            {monthNames.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        </>)}

        <button onClick={handleRun} disabled={loading || (RANGE_REPORTS.has(report) && (!from || !to || from > to))}
          className="lp-btn lp-btn-primary"
          style={{ padding:'9px 24px' }}>
          {loading ? t('reports.controls.generating') : t('reports.controls.run')}
        </button>

        {report === 'budget' && canEditBudget && (
          <button onClick={() => setShowBudgetEditor(v => !v)} className="lp-btn lp-btn-ghost"
            style={{ padding:'9px 18px' }}>
            {showBudgetEditor ? t('reports.budget.hideEditor') : t('reports.budget.set')}
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding:'10px 14px', borderRadius:8, marginBottom:16, fontSize:13,
          background:'var(--sem-red-bg)', border:'0.5px solid var(--sem-red-border)', color:'var(--sem-red)' }}>
          ⚠ {error}
        </div>
      )}

      {report === 'budget' && showBudgetEditor && canEditBudget && (
        <BudgetEditor
          orgId={orgId} clientId={clientId} year={year} month={month}
          onSaved={() => { if (hasRun) runBudget() }}
          onClose={() => setShowBudgetEditor(false)}
        />
      )}

      {/* -- BUDGET VS ACTUAL ------------------------------------------------ */}
      {report === 'budget' && bvaData !== null && (
        <div style={{ maxWidth:700 }}>
          <ReportLetterhead
            entityName={entityName}
            reportTitle={t('reports.titles.budget')}
            period={`${monthNames[month-1]} ${year}`}
          />

          {bvaData.period_budget === 0 && bvaData.lines.every(l => !l.has_budget) ? (
            <div className="lp-card" style={{ textAlign:'center', padding:'32px 24px' }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--lp-text)', marginBottom:6 }}>
                {t('reports.budget.noneTitle', { month: monthNames[month-1], year })}
              </div>
              <div style={{ fontSize:13, color:'var(--lp-text-muted)' }}>
                {canEditBudget
                  ? t('reports.budget.noneCanEdit')
                  : t('reports.budget.noneAsk')}
              </div>
            </div>
          ) : (
            <>
              {/* The monthly ceiling leads: it is the one figure the assistant
                  checks a new expense against, and it is reported apart from
                  the per-account lines so the two are never added together. */}
              {bvaData.period_budget > 0 && (() => {
                const left = bvaData.period_budget - bvaData.total_actual
                const over = left < 0
                return (
                  <div style={{
                    background: over ? 'var(--sem-red-bg)' : 'var(--sem-green-bg)',
                    border: `0.5px solid ${over ? 'var(--sem-red-border)' : 'var(--sem-green-border)'}`,
                    borderRadius:10, padding:'14px 18px', marginBottom:18
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                      <span style={{ fontSize:13, fontWeight:700,
                        color: over ? 'var(--sem-red)' : 'var(--sem-green)' }}>
                        {over ? t('reports.budget.overCeiling') : t('reports.budget.withinCeiling')}
                      </span>
                      <span style={{ fontFamily:'monospace', fontSize:18, fontWeight:800,
                        color: over ? 'var(--sem-red)' : 'var(--sem-green)' }}>
                        {over ? t('reports.budget.amountOver', { amount: fmt(Math.abs(left)) }) : t('reports.budget.amountLeft', { amount: fmt(Math.abs(left)) })}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--lp-text-muted)', marginTop:6 }}>
                      {t('reports.budget.spentOf', { spent: fmt(bvaData.total_actual), budget: fmt(bvaData.period_budget) })}
                    </div>
                  </div>
                )
              })()}

              <div style={{ border:'0.5px solid var(--lp-border)', borderRadius:10, overflow:'hidden' }}>
                <div style={{
                  display:'grid', gridTemplateColumns:'1fr 100px 100px 110px',
                  padding:'9px 14px', background:'var(--lp-surface-2)',
                  fontSize:11, fontWeight:700, letterSpacing:0.5,
                  color:'var(--lp-text-muted)', textTransform:'uppercase'
                }}>
                  <span>{t('reports.budget.colAccount')}</span>
                  <span style={{ textAlign:'right' }}>{t('reports.budget.colBudget')}</span>
                  <span style={{ textAlign:'right' }}>{t('reports.budget.colActual')}</span>
                  <span style={{ textAlign:'right' }}>{t('reports.budget.colRemaining')}</span>
                </div>

                {bvaData.lines.map(l => {
                  // A line with no budget that nonetheless spent money is a real
                  // answer, not a blank: it is unbudgeted spending.
                  const over = l.has_budget && l.remaining < 0
                  return (
                    <div key={l.code} style={{
                      display:'grid', gridTemplateColumns:'1fr 100px 100px 110px',
                      padding:'7px 14px', fontSize:12.5,
                      borderTop:'0.5px solid var(--lp-border)', alignItems:'baseline'
                    }}>
                      <span style={{ color:'var(--lp-text-muted)' }}>
                        <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--lp-text-stronger)', marginRight:10 }}>
                          {l.code}
                        </span>
                        {l.name}
                        {!l.has_budget && (
                          <span style={{ marginLeft:8, fontSize:10.5, color:'var(--lp-text-muted)' }}>
                            {t('reports.budget.notBudgeted')}
                          </span>
                        )}
                      </span>
                      <span style={{ textAlign:'right', fontFamily:'monospace' }}>
                        {l.has_budget ? fmt(l.budget) : '--'}
                      </span>
                      <span style={{ textAlign:'right', fontFamily:'monospace' }}>{fmt(l.actual)}</span>
                      <span style={{ textAlign:'right', fontFamily:'monospace',
                        color: !l.has_budget ? 'var(--lp-text-muted)'
                             : over ? 'var(--sem-red)' : 'var(--sem-green)' }}>
                        {l.has_budget
                          ? (over ? t('reports.budget.amountOver', { amount: fmt(Math.abs(l.remaining)) }) : fmt(Math.abs(l.remaining)))
                          : '--'}
                        {l.has_budget && l.over_pct !== null && (
                          <span style={{ display:'block', fontSize:10.5, color:'var(--lp-text-muted)' }}>
                            {l.over_pct > 0 ? `+${l.over_pct}%` : `${l.over_pct}%`}
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}

                <div style={{
                  display:'grid', gridTemplateColumns:'1fr 100px 100px 110px',
                  padding:'10px 14px', borderTop:'0.5px solid var(--lp-border)',
                  background:'var(--lp-surface-2)', fontSize:13, fontWeight:700
                }}>
                  <span>{t('reports.budget.totals')}</span>
                  <span style={{ textAlign:'right', fontFamily:'monospace' }}>{fmt(bvaData.total_budget)}</span>
                  <span style={{ textAlign:'right', fontFamily:'monospace' }}>{fmt(bvaData.total_actual)}</span>
                  <span style={{ textAlign:'right', fontFamily:'monospace' }}>
                    {fmt(bvaData.total_budget - bvaData.total_actual)}
                  </span>
                </div>
              </div>

              <div style={{ marginTop:14, fontSize:11.5, color:'var(--lp-text-muted)' }}>
                {t('reports.budget.footnote')}
              </div>

              <ReportFooter />
            </>
          )}
        </div>
      )}

      {/* ── BALANCE SHEET ──────────────────────────────────────────────────── */}
      {report === 'balance_sheet' && bsData && (
        <div>
          <ReportLetterhead
            entityName={entityName}
            reportTitle="Balance Sheet"
            period={t('reports.asOfPeriod', { month: monthNames[Number(bsData.as_of.split('-')[1]) - 1], year: bsData.as_of.split('-')[0] })}
          />

          <div style={{
            padding:'10px 16px', borderRadius:8, marginBottom:20,
            display:'flex', alignItems:'center', justifyContent:'space-between',
            background: bsData.balanced ? 'var(--sem-green-bg)' : 'var(--sem-red-bg)',
            border: `0.5px solid ${bsData.balanced ? 'var(--sem-green-border)' : 'var(--sem-red-border)'}`
          }}>
            <span style={{ fontSize:13, fontWeight:500,
              color: bsData.balanced ? 'var(--sem-green)' : 'var(--sem-red)' }}>
              {bsData.balanced ? '✓ Balanced' : '⚠ Out of balance'}
            </span>
            {!bsData.balanced && (
              <span style={{ fontSize:13, color:'var(--sem-red)', fontFamily:'monospace' }}>
                Δ {fmt(bsData.difference)}
              </span>
            )}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <SectionBlock title="Assets"      section={bsData.assets}      color="var(--lp-accent)" bg="var(--sem-blue-bg)" />
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <SectionBlock title="Liabilities" section={bsData.liabilities} color="var(--sem-red)"  bg="var(--sem-red-bg)" />
              <SectionBlock title="Equity"      section={bsData.equity}      color="var(--sem-green)" bg="var(--sem-green-bg)" />
            </div>
          </div>

          {bsData.net_income !== 0 && (
            <div style={{
              padding:'12px 16px', borderRadius:8, marginBottom:16,
              background: bsData.net_income >= 0 ? 'var(--sem-green-bg)' : 'var(--sem-red-bg)',
              border:`0.5px solid ${bsData.net_income >= 0 ? 'var(--sem-green-border)' : 'var(--sem-red-border)'}`,
              display:'flex', justifyContent:'space-between', alignItems:'center'
            }}>
              <div>
                <div style={{ fontSize:13, fontWeight:500,
                  color: bsData.net_income >= 0 ? 'var(--sem-green)' : 'var(--sem-red-soft)' }}>
                  Net Income (current period)
                </div>
                <div style={{ fontSize:12, color:'var(--lp-text-muted)', marginTop:2 }}>
                  Flows from P&L into Retained Earnings
                </div>
              </div>
              <div style={{ fontSize:16, fontWeight:700, fontFamily:'monospace',
                color: bsData.net_income >= 0 ? 'var(--sem-green)' : 'var(--sem-red-soft)' }}>
                {fmt(bsData.net_income)}
              </div>
            </div>
          )}

          <div className="lp-card" style={{ display:'flex', gap:0 }}>
            {[
              { label:'Total Assets',              value:bsData.assets_total,      color:'var(--lp-accent)' },
              { label:'Total Liabilities',         value:bsData.liabilities_total, color:'var(--sem-red)' },
              { label:'Total Equity + Net Income', value:bsData.equity_total,      color:'var(--sem-green)' },
            ].map(({ label,value,color }, i) => (
              <div key={i} style={{ flex:1, padding:'0 16px',
                borderRight: i < 2 ? '0.5px solid var(--lp-border)' : 'none' }}>
                <div style={{ fontSize:11, color:'var(--lp-text-muted)', marginBottom:6 }}>{label}</div>
                <div style={{ fontSize:18, fontWeight:700, color, fontFamily:'monospace' }}>{fmt(value)}</div>
              </div>
            ))}
          </div>

          <ReportFooter />
        </div>
      )}

      {/* ── Cash Flow (indirect) ─────────────────────────────────────────── */}
      {report === 'cash_flow' && cfData !== null && (
        <div style={{ maxWidth:700 }}>
          <ReportLetterhead
            entityName={entityName}
            reportTitle="Statement of Cash Flows"
            period={`${monthNames[month-1]} ${year}`}
          />

          {/* The reconciliation leads, because it is the one thing that says
              whether the rest of this page can be trusted. */}
          {!cfData.reconciles && (
            <div style={{
              background:'var(--sem-amber-bg)', border:'0.5px solid var(--sem-amber)',
              borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12.5
            }}>
              <strong>This statement does not reconcile.</strong> The movements below
              explain {fmt(cfData.net_change)} but cash actually moved {fmt(cfData.actual_change)},
              a difference of {fmt(cfData.difference)}. Usually one account is
              classified wrongly — check which accounts are treated as cash below.
            </div>
          )}

          <div style={{ display:'grid', gap:8, marginBottom:20 }}>
            {[
              { label:'Net income',                      value: cfData.net_income, strong:false },
              { label:'Cash from operating activities',  value: cfData.operating,  strong:true  },
              { label:'Cash from investing activities',  value: cfData.investing,  strong:true  },
              { label:'Cash from financing activities',  value: cfData.financing,  strong:true  },
            ].map(r => (
              <div key={r.label} style={{
                display:'flex', justifyContent:'space-between',
                padding:'8px 12px', borderBottom:'0.5px solid var(--lp-border)',
                fontWeight: r.strong ? 600 : 400, fontSize:13
              }}>
                <span>{r.label}</span><span>{fmt(r.value)}</span>
              </div>
            ))}
            <div style={{
              display:'flex', justifyContent:'space-between', padding:'10px 12px',
              background:'var(--lp-surface-2)', borderRadius:8, fontWeight:700, fontSize:14
            }}>
              <span>Net change in cash</span><span>{fmt(cfData.net_change)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 12px', fontSize:12, color:'var(--lp-text-muted)' }}>
              <span>Cash at start of period</span><span>{fmt(cfData.cash_start)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 12px', fontSize:12, color:'var(--lp-text-muted)' }}>
              <span>Cash at end of period</span><span>{fmt(cfData.cash_end)}</span>
            </div>
          </div>

          {cfData.lines.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.6, color:'var(--lp-text-muted)', marginBottom:8 }}>
                WHAT MOVED
              </div>
              {cfData.lines.map(l => (
                <div key={`${l.bucket}-${l.code}`} style={{
                  display:'flex', justifyContent:'space-between',
                  padding:'6px 12px', fontSize:12.5, borderBottom:'0.5px solid var(--lp-border)'
                }}>
                  <span>
                    <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--lp-text-stronger)', marginRight:10 }}>{l.code}</span>
                    {l.name}
                    <span style={{ marginLeft:8, fontSize:10.5, color:'var(--lp-text-muted)' }}>({l.bucket})</span>
                  </span>
                  <span>{fmt(l.amount)}</span>
                </div>
              ))}
            </>
          )}

          <div style={{ marginTop:16, fontSize:11.5, color:'var(--lp-text-muted)' }}>
            Cash accounts:{' '}
            {cfData.cash_accounts.length === 0
              ? 'none identified — no account is marked as cash, so this statement cannot reconcile'
              : cfData.cash_accounts.map(a => `${a.code} ${a.name}`).join(', ')}
          </div>
        </div>
      )}

      {/* ── P&L ──────────────────────────────────────────────────────────── */}
      {report === 'pl' && plData !== null && (
        <div style={{ maxWidth:700 }}>
          <ReportLetterhead
            entityName={entityName}
            reportTitle="Profit & Loss Statement"
            period={formatRange(from, to)}
          />

          {[
            { title:'Income', rows:incomeRows, getAmt:(r:any)=>r.credit-r.debit, total:totalIncome, color:'var(--sem-green)', totalColor:'var(--sem-green)', bg:'var(--sem-green-bg)' },
            { title:'Expenses',rows:expenseRows,getAmt:(r:any)=>r.debit-r.credit,total:totalExpense,color:'var(--sem-red-soft)',totalColor:'var(--sem-red-soft)', bg:'var(--sem-red-bg)' }
          ].map(({ title,rows,getAmt,total,color,totalColor,bg }) => (
            <div key={title} style={{ background:'var(--lp-surface)',
              border:'0.5px solid var(--lp-border)', borderTop:`2px solid ${color}`,
              borderRadius:'0 0 10px 10px', overflow:'hidden', marginBottom:12 }}>
              <div style={{ padding:'10px 16px', background:bg,
                fontSize:12, fontWeight:600, color, textTransform:'uppercase', letterSpacing:'0.07em' }}>
                {title}
              </div>
              {rows.map(r => (
                <div key={r.code} style={{ display:'flex', justifyContent:'space-between',
                  padding:'7px 16px 7px 32px' }}>
                  <span style={{ fontSize:12.5, color:'var(--lp-text-muted)' }}>
                    <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--lp-text-stronger)', marginRight:10 }}>{r.code}</span>
                    {r.name}
                  </span>
                  <span style={{ fontFamily:'monospace', fontSize:12.5, color }}>{fmt(getAmt(r))}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 16px',
                borderTop:'0.5px solid var(--lp-border)', background:'var(--lp-surface-2)' }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--lp-text)' }}>Total {title}</span>
                <span style={{ fontFamily:'monospace', fontSize:14, fontWeight:700, color:totalColor }}>{fmt(total)}</span>
              </div>
            </div>
          ))}

          <div style={{
            padding:'16px 20px', borderRadius:10,
            background: netIncome >= 0 ? 'var(--sem-green-bg)' : 'var(--sem-red-bg)',
            border:`0.5px solid ${netIncome >= 0 ? 'var(--sem-green-border)' : 'var(--sem-red-border)'}`,
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <span style={{ fontSize:14, fontWeight:700,
              color: netIncome >= 0 ? 'var(--sem-green)' : 'var(--sem-red)' }}>
              Net {netIncome >= 0 ? 'Income' : 'Loss'}
            </span>
            <span style={{ fontSize:20, fontWeight:800, fontFamily:'monospace',
              color: netIncome >= 0 ? 'var(--sem-green)' : 'var(--sem-red)' }}>
              {fmt(Math.abs(netIncome))}
            </span>
          </div>

          <ReportFooter />
        </div>
      )}

      {/* ── Trial balance / General ledger / Aging ─────────────────────────── */}
      {report === 'trial_balance' && tbData && hasRun && (
        <div style={{ maxWidth:820 }}>
          <ReportLetterhead entityName={entityName} reportTitle="Trial Balance"
            period={`As of ${new Date(tbData.as_of + 'T12:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}`} />
          <TrialBalanceReport data={tbData} />
          <ReportFooter />
        </div>
      )}
      {report === 'general_ledger' && glData && hasRun && (
        <div style={{ maxWidth:980 }}>
          <ReportLetterhead entityName={entityName} reportTitle="General Ledger" period={formatRange(glData.from, glData.to)} />
          <GeneralLedgerReport data={glData} />
          <ReportFooter />
        </div>
      )}
      {(report === 'ar_aging' || report === 'ap_aging') && agData && agData.kind === (report === 'ar_aging' ? 'ar' : 'ap') && hasRun && (
        <div style={{ maxWidth:980 }}>
          <ReportLetterhead entityName={entityName} reportTitle={t(REPORT_TITLES[report])}
            period={`As of ${new Date(agData.as_of + 'T12:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}`} />
          <AgingReport data={agData} />
          <ReportFooter />
        </div>
      )}

      {!hasRun && !loading && (
        <div className="lp-card" style={{ textAlign:'center', padding:'48px 24px' }}>
          <div style={{ marginBottom: 12, color: 'var(--lp-text-muted)', display: 'flex', justifyContent: 'center' }}><Icon name="reports" size={36} strokeWidth={1.4} /></div>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--lp-text)', marginBottom:6 }}>
            {t('reports.empty.title')}
          </div>
          <div style={{ fontSize:13, color:'var(--lp-text-muted)' }}>
            {t('reports.empty.body')}
          </div>
        </div>
      )}
    </div>
  )
}
