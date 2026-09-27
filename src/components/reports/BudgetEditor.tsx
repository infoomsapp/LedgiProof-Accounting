// PATH: src/components/reports/BudgetEditor.tsx
//
// Where a budget is actually set. Until this existed the `budgets` table was
// unreachable from the app, which made both things that read it — the Budget
// vs Actual report and the Brain's budget_variance rule — permanently inert.
//
// Deliberately a panel inside Reports and not its own route: budgets are
// scoped exactly like every report on that page (org for solo/pyme, the
// specific client inside a firm workspace), and Reports already resolves that
// scope correctly for all four of its callers. A separate /budgets route would
// have had to re-derive it, which is where scope bugs come from.
//
// TWO KINDS OF LINE, both editable here:
//   · the period ceiling (account_id NULL) — the one the Brain compares a
//     transaction against, so it is presented first and on its own;
//   · one line per expense account — what the report breaks down.

import type { CSSProperties } from 'react'
import { useState, useEffect, useCallback } from 'react'
import {
  getBudgetableAccounts, getBudgets, saveBudgetLines, getActualsByAccount,
  type BudgetableAccount
} from '../../services/budget.service'
import { formatCurrency } from '../../lib/currency'
import { toSafeMessage } from '../../lib/errors'

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

interface BudgetEditorProps {
  orgId:     string
  clientId?: string | null
  year:      number
  month:     number
  /** Lets Reports re-run the report as soon as the numbers behind it change. */
  onSaved?:  () => void
  onClose?:  () => void
}

/** Blank, stray symbols and '1,200' all have to mean something sane while typing. */
function parseAmount(raw: string): number {
  const n = Number(raw.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export default function BudgetEditor({
  orgId, clientId, year, month, onSaved, onClose
}: BudgetEditorProps) {
  const [accounts, setAccounts] = useState<BudgetableAccount[]>([])
  // Held as strings, not numbers: a half-typed field must not snap to 0.
  const [amounts,  setAmounts]  = useState<Record<string, string>>({})
  const [ceiling,  setCeiling]  = useState('')
  const [note,     setNote]     = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [notice,   setNotice]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null); setNotice(null)
    try {
      const [accs, rows] = await Promise.all([
        getBudgetableAccounts(orgId, clientId),
        getBudgets({ orgId, clientId, year, month })
      ])
      setAccounts(accs)
      const next: Record<string, string> = {}
      let ceil = ''
      let ceilNote = ''
      for (const r of rows) {
        if (r.account_id === null) { ceil = String(r.amount); ceilNote = r.note ?? '' }
        else next[r.account_id] = String(r.amount)
      }
      setAmounts(next); setCeiling(ceil); setNote(ceilNote)
    } catch (e) {
      setError(toSafeMessage(e, 'Could not load the budget'))
    }
    setLoading(false)
  }, [orgId, clientId, year, month])

  useEffect(() => { load() }, [load])

  const total = accounts.reduce((s, a) => s + parseAmount(amounts[a.id] ?? ''), 0)
  const ceilingValue = parseAmount(ceiling)
  // A per-account plan that already exceeds the ceiling is a contradiction the
  // person should see while editing, not a month later in the report.
  const overCeiling = ceilingValue > 0 && total > ceilingValue

  async function copyFrom(source: 'budget' | 'actuals') {
    setError(null); setNotice(null)
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear  = month === 1 ? year - 1 : year
    const prevLabel = `${MONTHS[prevMonth-1]} ${prevYear}`
    try {
      if (source === 'budget') {
        const rows = await getBudgets({ orgId, clientId, year: prevYear, month: prevMonth })
        if (rows.length === 0) {
          setNotice(`${prevLabel} has no budget to copy.`); return
        }
        const next: Record<string, string> = {}
        for (const r of rows) {
          if (r.account_id === null) setCeiling(String(r.amount))
          else next[r.account_id] = String(r.amount)
        }
        setAmounts(next)
        setNotice(`Copied from ${prevLabel}. Nothing is saved until you save.`)
      } else {
        const actuals = await getActualsByAccount({ orgId, clientId, year: prevYear, month: prevMonth })
        if (actuals.size === 0) {
          setNotice(`${prevLabel} has no expenses to copy.`); return
        }
        const next: Record<string, string> = {}
        let sum = 0
        for (const a of accounts) {
          const spent = actuals.get(a.id) ?? 0
          // A credit-net account (a refund month) would seed a negative
          // budget, which set_budget_lines rejects outright — skip it.
          if (spent > 0) { next[a.id] = spent.toFixed(2); sum += spent }
        }
        setAmounts(next)
        if (sum > 0) setCeiling(sum.toFixed(2))
        setNotice(`Filled in from what ${prevLabel} actually cost. Nothing is saved until you save.`)
      }
    } catch (e) {
      setError(toSafeMessage(e, 'Could not read the previous period'))
    }
  }

  async function handleSave() {
    setSaving(true); setError(null); setNotice(null)
    try {
      const lines = [
        { account_id: null, amount: ceilingValue, note: note || null },
        ...accounts.map(a => ({ account_id: a.id, amount: parseAmount(amounts[a.id] ?? '') }))
      ]
      const res = await saveBudgetLines({ orgId, clientId, year, month }, lines)
      setNotice(
        res.saved === 0
          ? `Budget cleared for ${MONTHS[month-1]} ${year}.`
          : `Saved ${res.saved} budget ${res.saved === 1 ? 'line' : 'lines'} for ${MONTHS[month-1]} ${year}.`
      )
      onSaved?.()
    } catch (e) {
      setError(toSafeMessage(e, 'Could not save the budget'))
    }
    setSaving(false)
  }

  const label: CSSProperties = {
    fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5
  }

  return (
    <div className="lp-card" style={{ marginBottom: 20, maxWidth: 700 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)' }}>
            Set the budget — {MONTHS[month-1]} {year}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            Leave an amount blank or at 0 to remove its budget.
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="lp-btn lp-btn-ghost" style={{ fontSize: 12.5 }}>
            Done
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13,
          background:'var(--sem-red-bg)', border:'0.5px solid var(--sem-red-border)', color:'var(--sem-red)' }}>
          {error}
        </div>
      )}
      {notice && !error && (
        <div style={{ padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13,
          background:'var(--sem-green-bg)', border:'0.5px solid var(--sem-green-border)', color:'var(--sem-green)' }}>
          {notice}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', padding: '12px 0' }}>Loading…</div>
      ) : (
        <>
          {/* ── The period ceiling ───────────────────────────────────────────
              First and on its own, because this is the number the assistant
              checks a transaction against. Without it, budget_variance never
              fires no matter how many per-account lines exist. */}
          <div style={{
            background:'var(--lp-surface-2)', border:'0.5px solid var(--lp-border)',
            borderRadius:8, padding:'12px 14px', marginBottom:16
          }}>
            <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
              <div>
                <label style={label}>Total spending ceiling for the month</label>
                <input className="lp-input" style={{ width: 150 }} inputMode="decimal"
                  placeholder="0.00" value={ceiling}
                  onChange={e => setCeiling(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={label}>Note (optional)</label>
                <input className="lp-input" style={{ width: '100%' }} value={note}
                  placeholder="Why this ceiling"
                  onChange={e => setNote(e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color:'var(--lp-text-muted)', marginTop: 8 }}>
              This is the figure the assistant warns against when a new expense
              would push the month over budget. Per-account amounts below are
              reported, but only this ceiling triggers the warning.
            </div>
          </div>

          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
            <button onClick={() => copyFrom('budget')} className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}>
              Copy last month&rsquo;s budget
            </button>
            <button onClick={() => copyFrom('actuals')} className="lp-btn lp-btn-ghost" style={{ fontSize:12.5 }}>
              Use last month&rsquo;s actuals
            </button>
          </div>

          {accounts.length === 0 ? (
            <div style={{ fontSize: 13, color:'var(--lp-text-muted)', padding:'12px 0' }}>
              This entity has no expense accounts yet, so there is nothing to
              budget per account. The monthly ceiling above still works on its own.
            </div>
          ) : (
            <div style={{ border:'0.5px solid var(--lp-border)', borderRadius:8, overflow:'hidden' }}>
              {accounts.map((a, i) => (
                <div key={a.id} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'7px 12px', gap:12,
                  borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)'
                }}>
                  <span style={{ fontSize:12.5, color:'var(--lp-text-muted)' }}>
                    <span style={{ fontFamily:'monospace', fontSize:11, color:'var(--lp-text-stronger)', marginRight:10 }}>
                      {a.code}
                    </span>
                    {a.name}
                  </span>
                  <input className="lp-input" style={{ width:120, textAlign:'right' }}
                    inputMode="decimal" placeholder="0.00"
                    value={amounts[a.id] ?? ''}
                    onChange={e => setAmounts(p => ({ ...p, [a.id]: e.target.value }))} />
                </div>
              ))}
              <div style={{
                display:'flex', justifyContent:'space-between', padding:'10px 12px',
                borderTop:'0.5px solid var(--lp-border)', background:'var(--lp-surface-2)',
                fontSize:13, fontWeight:600
              }}>
                <span>Total of the lines above</span>
                <span style={{ fontFamily:'monospace' }}>{formatCurrency(total)}</span>
              </div>
            </div>
          )}

          {overCeiling && (
            <div style={{
              background:'var(--sem-amber-bg)', border:'0.5px solid var(--sem-amber)',
              borderRadius:8, padding:'10px 14px', marginTop:12, fontSize:12.5
            }}>
              The per-account lines add up to {formatCurrency(total)}, more than the{' '}
              {formatCurrency(ceilingValue)} ceiling. Both save fine — but the month
              is planned over its own limit.
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button onClick={handleSave} disabled={saving} className="lp-btn lp-btn-primary"
              style={{ padding:'9px 24px' }}>
              {saving ? 'Saving…' : 'Save budget'}
            </button>
            <button onClick={load} disabled={saving} className="lp-btn lp-btn-ghost">
              Discard changes
            </button>
          </div>
        </>
      )}
    </div>
  )
}
