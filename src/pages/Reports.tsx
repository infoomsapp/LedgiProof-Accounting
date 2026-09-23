// PATH: src/pages/Reports.tsx
import { useState, useCallback } from 'react'
import { useScope }     from '../hooks/useScope'
import { useOrgStore }  from '../store/org.store'
import { db }           from '../lib/supabase'
import { printToPDF, downloadCSV, buildCSV } from '../services/export.service'
import { formatCurrency } from '../lib/currency'
import { formatDate }     from '../lib/dates'
import { toSafeMessage } from '../lib/errors'

const fmt = (n: number) => formatCurrency(n)

interface BSAccount { id: string; code: string; name: string; level: number; balance: number }
interface BSSection  { accounts: BSAccount[]; total: number }
interface BalanceSheetData {
  as_of: string
  assets: BSSection; liabilities: BSSection; equity: BSSection
  net_income: number; assets_total: number; liabilities_total: number
  equity_total: number; difference: number; balanced: boolean
}

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

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
  // Letterhead identity: the specific client when scoped to one (a firm's
  // report is for THAT client, not the firm itself), otherwise the org's
  // own name (solo/pyme, or a firm's own org-level view).
  const entityName = entityNameOverride || scope.client?.company_name || scope.client?.display_name
    || activeOrg?.name || 'Financial Reports'
  const now    = new Date()

  const [year,    setYear]   = useState(now.getFullYear())
  const [month,   setMonth]  = useState(now.getMonth() + 1)
  const [report,  setReport] = useState<'balance_sheet'|'pl'>('balance_sheet')
  const [bsData,  setBsData] = useState<BalanceSheetData | null>(null)
  const [plData,  setPlData] = useState<any[] | null>(null)
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

  const runPL = useCallback(async () => {
    setLoading(true); setError(null)
    // Server-side RPC (SECURITY DEFINER, auth-checked for org staff or the
    // matching client_portal_users member) — replaces a direct journal_entries
    // table read, which had no client-portal-aware RLS and would have
    // silently returned zero rows for an invited client instead of erroring.
    const { data: rows, error: err } = await db.rpc('get_profit_and_loss', {
      p_org_id: orgId, p_year: year, p_month: month,
      ...(clientId ? { p_client_id: clientId } : {})
    })

    if (err) { setError(toSafeMessage(err, 'Could not run the profit and loss report')); setLoading(false); return }

    type PlRow = {
      account_id: string
      code:       string
      name:       string
      type:       string
      debit:      number
      credit:     number
    }

    // The RPC already aggregates debit/credit per account server-side —
    // just filter to income/expense and hand the rows straight through.
    const map = new Map<string, { code:string; name:string; type:string; debit:number; credit:number }>()
    for (const row of (rows ?? []) as unknown as PlRow[]) {
      if (!['income','expense'].includes(row.type)) continue
      map.set(row.account_id, { code:row.code, name:row.name, type:row.type, debit:Number(row.debit), credit:Number(row.credit) })
    }
    setPlData(Array.from(map.values()).sort((a,b) => a.code.localeCompare(b.code)))
    setLoading(false); setHasRun(true)
  }, [orgId, clientId, year, month])

  function handleRun() {
    report === 'balance_sheet' ? runBalanceSheet() : runPL()
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
          <h1 className="lp-page-title">Financial Reports</h1>
          <p className="lp-page-sub">Balance Sheet & Profit and Loss</p>
        </div>
        {hasRun && !loading && (
          <div style={{ display:'flex', gap:8 }}>
            <button
              onClick={() => printToPDF(`${entityName} — ${report === 'balance_sheet' ? 'Balance Sheet' : 'P&L'} ${year}-${String(month).padStart(2,'0')}`)}
              className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}
            >
              ⬇ PDF
            </button>
            {report === 'pl' && plData && (
              <button
                onClick={() => {
                  const rows = plData.map(r => [r.code, r.name, r.type,
                    r.type === 'income' ? r.credit - r.debit : r.debit - r.credit])
                  downloadCSV(buildCSV(['Code','Account','Type','Amount'], rows), `pl-${year}-${month}.csv`)
                }}
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
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>Report</label>
          <div style={{ display:'flex' }}>
            {[['balance_sheet','Balance Sheet'],['pl','P&L']] .map(([k,l]) => (
              <button key={k} onClick={() => { setReport(k as any); setHasRun(false) }} style={{
                padding:'8px 16px', cursor:'pointer', fontFamily:'inherit', fontSize:13,
                fontWeight: report===k ? 500 : 400,
                background: report===k ? 'var(--lp-accent)' : 'rgba(255,255,255,0.04)',
                color:      report===k ? '#fff'    : 'var(--lp-text-muted)',
                border:'0.5px solid var(--lp-border)', transition:'all 0.12s',
                borderRadius: k==='balance_sheet' ? '7px 0 0 7px' : '0 7px 7px 0',
                borderLeft:   k==='pl' ? 'none' : undefined
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>Year</label>
          <select className="lp-input" style={{ width:90 }} value={year}
            onChange={e => setYear(Number(e.target.value))}>
            {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y =>
              <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize:12, color:'var(--lp-text-muted)', display:'block', marginBottom:5 }}>
            {report === 'balance_sheet' ? 'As of month' : 'Through month'}
          </label>
          <select className="lp-input" style={{ width:130 }} value={month}
            onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>

        <button onClick={handleRun} disabled={loading} className="lp-btn lp-btn-primary"
          style={{ padding:'9px 24px' }}>
          {loading ? 'Generating…' : 'Run report'}
        </button>
      </div>

      {error && (
        <div style={{ padding:'10px 14px', borderRadius:8, marginBottom:16, fontSize:13,
          background:'var(--sem-red-bg)', border:'0.5px solid var(--sem-red-border)', color:'var(--sem-red)' }}>
          ⚠ {error}
        </div>
      )}

      {/* ── BALANCE SHEET ──────────────────────────────────────────────────── */}
      {report === 'balance_sheet' && bsData && (
        <div>
          <ReportLetterhead
            entityName={entityName}
            reportTitle="Balance Sheet"
            period={`As of ${MONTHS[Number(bsData.as_of.split('-')[1]) - 1]} ${bsData.as_of.split('-')[0]}`}
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

      {/* ── P&L ──────────────────────────────────────────────────────────── */}
      {report === 'pl' && plData !== null && (
        <div style={{ maxWidth:700 }}>
          <ReportLetterhead
            entityName={entityName}
            reportTitle="Profit & Loss Statement"
            period={`January – ${MONTHS[month-1]} ${year}`}
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

      {!hasRun && !loading && (
        <div className="lp-card" style={{ textAlign:'center', padding:'48px 24px' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📊</div>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--lp-text)', marginBottom:6 }}>
            Select a period and run the report
          </div>
          <div style={{ fontSize:13, color:'var(--lp-text-muted)' }}>
            Reports are generated from your journal entries.
          </div>
        </div>
      )}
    </div>
  )
}
