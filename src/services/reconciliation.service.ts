// PATH: src/services/reconciliation.service.ts
// Reconciliation engine — matches bank transactions to accounting records.
// Auto-match logic: amount + date proximity + reference similarity.
// Sessions track the reconciliation period and closing balance.

import { db } from '../lib/supabase'
import type { Transaction } from '../types/database.types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReconciliationSession {
  id:                         string
  org_id:                     string
  client_id:                  string | null
  bank_connection_id:         string | null
  period_start:               string
  period_end:                 string
  statement_opening_balance:  number
  statement_closing_balance:  number
  cleared_balance:            number | null
  difference:                 number | null
  status:                     'open' | 'closed' | 'discrepancy'
  opened_by:                  string
  closed_by:                  string | null
  opened_at:                  string
  closed_at:                  string | null
  notes:                      string | null
}

export interface ReconciliationItem {
  id:             string
  session_id:     string
  transaction_id: string
  is_cleared:     boolean
  cleared_at:     string | null
}

export interface ReconciliationSummary {
  session_id:                string
  org_id:                    string
  client_id:                 string | null
  period_start:              string
  period_end:                string
  statement_opening_balance: number
  statement_closing_balance: number
  status:                    string
  total_items:               number
  cleared_items:             number
  uncleared_items:           number
  cleared_total:             number
  difference:                number
}

// ── Session management ───────────────────────────────────────────────────────

export async function createSession(input: {
  orgId:            string
  userId:           string
  periodStart:      string
  periodEnd:        string
  openingBalance:   number
  closingBalance:   number
  bankConnectionId?: string
  clientId?:        string | null
  notes?:           string
}): Promise<ReconciliationSession> {
  const { data, error } = await db
    .from('reconciliation_sessions')
    .insert({
      org_id:                    input.orgId,
      client_id:                 input.clientId ?? null,
      bank_connection_id:        input.bankConnectionId ?? null,
      period_start:              input.periodStart,
      period_end:                input.periodEnd,
      statement_opening_balance: input.openingBalance,
      statement_closing_balance: input.closingBalance,
      status:                    'open',
      opened_by:                 input.userId,
      notes:                     input.notes ?? null
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Session creation failed')
  return data as ReconciliationSession
}

export async function getSessions(
  orgId: string,
  clientId?: string | null
): Promise<ReconciliationSummary[]> {
  let q = db
    .from('v_reconciliation_summary')
    .select('*')
    .eq('org_id', orgId)
  q = clientId ? q.eq('client_id', clientId) : q.is('client_id', null)
  const { data, error } = await q.order('period_end', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ReconciliationSummary[]
}

export async function getSession(sessionId: string): Promise<ReconciliationSummary | null> {
  const { data } = await db
    .from('v_reconciliation_summary')
    .select('*')
    .eq('session_id', sessionId)
    .single()
  return data as ReconciliationSummary | null
}

export async function closeSession(
  sessionId: string,
  userId:    string
): Promise<{ balanced: boolean; difference: number }> {
  const { data, error } = await db.rpc('close_reconciliation_session', {
    p_session_id: sessionId,
    p_user_id:    userId
  })
  if (error) throw new Error(error.message)
  return {
    balanced:   (data as any).balanced,
    difference: (data as any).difference
  }
}

// ── Transaction loading ──────────────────────────────────────────────────────

export async function loadSessionTransactions(
  sessionId: string,
  orgId:     string
): Promise<Array<Transaction & { is_cleared: boolean; item_id: string }>> {
  const { data, error } = await db
    .from('reconciliation_items')
    .select('id, is_cleared, transaction_id, transactions(*)')
    .eq('session_id', sessionId)
    .eq('org_id', orgId)
    .order('created_at')

  if (error) throw new Error(error.message)

  return (data ?? []).map((item: any) => ({
    ...item.transactions,
    is_cleared: item.is_cleared,
    item_id:    item.id
  }))
}

export async function loadUnreconciledTransactions(
  orgId:       string,
  periodStart: string,
  periodEnd:   string,
  clientId?:   string | null
): Promise<Transaction[]> {
  let q = db
    .from('transactions')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_current', true)
    .is('reconciled_at', null)
    .gte('transaction_date', periodStart)
    .lte('transaction_date', periodEnd)
  q = clientId ? q.eq('client_id', clientId) : q.is('client_id', null)
  const { data, error } = await q.order('transaction_date', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Transaction[]
}

// ── Add transactions to session ──────────────────────────────────────────────

export async function addTransactionsToSession(
  sessionId:      string,
  transactionIds: string[],
  orgId:          string
): Promise<void> {
  const inserts = transactionIds.map(id => ({
    session_id:     sessionId,
    transaction_id: id,
    org_id:         orgId,
    is_cleared:     false
  }))

  const { error } = await db
    .from('reconciliation_items')
    .upsert(inserts, { onConflict: 'session_id,transaction_id' })

  if (error) throw new Error(error.message)
}

// ── Toggle cleared state ─────────────────────────────────────────────────────

export async function toggleCleared(
  itemId:    string,
  isCleared: boolean
): Promise<void> {
  const { error } = await db
    .from('reconciliation_items')
    .update({
      is_cleared: isCleared,
      cleared_at: isCleared ? new Date().toISOString() : null
    })
    .eq('id', itemId)

  if (error) throw new Error(error.message)
}

export async function clearAll(sessionId: string): Promise<void> {
  const { error } = await db
    .from('reconciliation_items')
    .update({ is_cleared: true, cleared_at: new Date().toISOString() })
    .eq('session_id', sessionId)

  if (error) throw new Error(error.message)
}

export async function unclearAll(sessionId: string): Promise<void> {
  const { error } = await db
    .from('reconciliation_items')
    .update({ is_cleared: false, cleared_at: null })
    .eq('session_id', sessionId)

  if (error) throw new Error(error.message)
}

// ── Auto-match ───────────────────────────────────────────────────────────────
// Current rule (v1): a session item auto-clears when its transaction came from
// the bank feed (source = 'bank_api') AND carries a bank reference. These are
// already-confirmed bank lines, so clearing them is safe.
//
// NOTE: earlier docs claimed "amount + date proximity + reference similarity";
// that fuzzy matcher does not exist yet. shouldAutoClear() is the real rule,
// isolated as a pure predicate so it can be unit-tested and later extended.

/** Pure auto-clear predicate — see autoMatch(). Testable without the DB. */
export function shouldAutoClear(
  tx: { source?: string | null; reference?: string | null } | null | undefined
): boolean {
  if (!tx) return false
  return tx.source === 'bank_api' && !!tx.reference
}

export async function autoMatch(sessionId: string, orgId: string): Promise<number> {
  // Load all items in this session
  const { data: items, error: iErr } = await db
    .from('reconciliation_items')
    .select('id, transaction_id, transactions(reference, amount, transaction_date, source)')
    .eq('session_id', sessionId)
    .eq('is_cleared', false)

  if (iErr) throw new Error(iErr.message)
  if (!items?.length) return 0

  let matched = 0
  const toUpdate: string[] = []

  for (const item of items as any[]) {
    const tx = item.transactions
    if (!tx) continue

    if (shouldAutoClear(tx)) {
      toUpdate.push(item.id)
      matched++
    }
  }

  if (toUpdate.length > 0) {
    const now = new Date().toISOString()
    const { error } = await db
      .from('reconciliation_items')
      .update({ is_cleared: true, cleared_at: now })
      .in('id', toUpdate)

    if (error) throw new Error(error.message)
  }

  return matched
}