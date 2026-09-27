// PATH: src/services/budget.service.ts
//
// Budgets: the ceiling a period is measured against, and the only reason the
// Brain's `budget_variance` rule has anything to compare a transaction to.
//
// SCOPE MODEL — the one thing to get right here. get_budget_vs_actual and
// check_budget_variance both match rows with `client_id IS NOT DISTINCT FROM
// p_client_id`, so a budget saved with the wrong scope is a budget no report
// will ever read. Everything below therefore passes clientId through
// unchanged (null included) instead of "defaulting" it.
//
// TWO KINDS OF LINE:
//   · account_id = NULL → the whole-period ceiling. This is the one the Brain
//     reads, because create-transaction evaluates rules before the journal
//     rows exist and its input carries no account.
//   · account_id set    → a per-account budget, reported line by line.
//
// `as any` on the rpc/from names: database.types.ts is generated and predates
// this table, exactly as Reports.tsx already does for get_cash_flow.
// Regenerating it here would pull in every unrelated schema change since.

import { db } from '../lib/supabase'
import { toSafeMessage } from '../lib/errors'

export interface BudgetRow {
  id:         string
  account_id: string | null
  amount:     number
  note:       string | null
}

export interface BudgetLineInput {
  account_id: string | null
  /** 0 removes the line. That is the documented way to withdraw a budget. */
  amount:     number
  note?:      string | null
}

export interface BudgetableAccount {
  id:   string
  code: string
  name: string
}

export interface BudgetVsActualLine {
  code:       string
  name:       string
  budget:     number
  actual:     number
  remaining:  number
  has_budget: boolean
  /** null when there is no budget to be over. */
  over_pct:   number | null
}

export interface BudgetVsActualData {
  period:        string
  total_budget:  number
  total_actual:  number
  /** The whole-period ceiling, reported apart so it is never double-counted. */
  period_budget: number
  lines:         BudgetVsActualLine[]
}

interface Scope {
  orgId:     string
  // Explicitly undefined-able: exactOptionalPropertyTypes is on, and callers
  // pass a clientId that is legitimately absent (org-level books).
  clientId?: string | null | undefined
  year:      number
  month:     number
}

/** The expense accounts a budget can be set on, in this exact scope. */
export async function getBudgetableAccounts(
  orgId: string, clientId?: string | null
): Promise<BudgetableAccount[]> {
  let q = db.from('accounts')
    .select('id, code, name')
    .eq('org_id', orgId)
    .eq('type', 'expense')
    .eq('is_active', true)
    .order('code')

  // `.is(null)` and `.eq(id)` are NOT interchangeable here: an org-level
  // budget and a client's budget are different rows and different reports.
  q = clientId ? q.eq('client_id', clientId) : q.is('client_id', null)

  const { data, error } = await q
  if (error) throw new Error(toSafeMessage(error, 'Could not load the accounts'))
  return (data ?? []) as BudgetableAccount[]
}

/** Every budget line already saved for one period, in this exact scope. */
export async function getBudgets({ orgId, clientId, year, month }: Scope): Promise<BudgetRow[]> {
  let q = (db as any).from('budgets')
    .select('id, account_id, amount, note')
    .eq('org_id', orgId)
    .eq('period_year', year)
    .eq('period_month', month)

  q = clientId ? q.eq('client_id', clientId) : q.is('client_id', null)

  const { data, error } = await q
  if (error) throw new Error(toSafeMessage(error, 'Could not load the budget'))
  return ((data ?? []) as any[]).map(r => ({
    id: r.id, account_id: r.account_id, amount: Number(r.amount), note: r.note
  }))
}

/**
 * Save a whole period at once. The RPC is what enforces "0 means remove" and
 * that every account belongs to this scope — see set_budget_lines.
 */
export async function saveBudgetLines(
  { orgId, clientId, year, month }: Scope, lines: BudgetLineInput[]
): Promise<{ saved: number; cleared: number }> {
  const { data, error } = await (db as any).rpc('set_budget_lines', {
    p_org_id: orgId, p_year: year, p_month: month,
    p_lines: lines,
    ...(clientId ? { p_client_id: clientId } : {})
  })
  if (error) throw new Error(toSafeMessage(error, 'Could not save the budget'))
  return { saved: Number(data?.saved ?? 0), cleared: Number(data?.cleared ?? 0) }
}

export async function getBudgetVsActual(
  { orgId, clientId, year, month }: Scope
): Promise<BudgetVsActualData> {
  const { data, error } = await (db as any).rpc('get_budget_vs_actual', {
    p_org_id: orgId, p_year: year, p_month: month,
    ...(clientId ? { p_client_id: clientId } : {})
  })
  if (error) throw new Error(toSafeMessage(error, 'Could not run the budget report'))
  return data as BudgetVsActualData
}

/**
 * What a month actually spent per expense account — the basis for "budget
 * this month on what last month cost", which is how a first budget normally
 * gets set. Reuses get_profit_and_loss rather than reading journal_entries
 * directly: that RPC is already the auth-checked, client-portal-aware path.
 */
export async function getActualsByAccount(
  { orgId, clientId, year, month }: Scope
): Promise<Map<string, number>> {
  const { data, error } = await db.rpc('get_profit_and_loss', {
    p_org_id: orgId, p_year: year, p_month: month,
    ...(clientId ? { p_client_id: clientId } : {})
  })
  if (error) throw new Error(toSafeMessage(error, 'Could not load last period'))
  const out = new Map<string, number>()
  for (const row of (data ?? []) as any[]) {
    if (row.type !== 'expense') continue
    // Expenses are debit-heavy; same pair of signs the P&L renders with.
    out.set(row.account_id, Number(row.debit) - Number(row.credit))
  }
  return out
}
