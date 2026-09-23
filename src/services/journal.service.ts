// ── src/services/journal.service.ts ──────────────────────────────────────────
// Posts double-entry journal entries for a transaction.
// Enforces: debits === credits before any insert.
// Reversal creates a mirror entry, never edits existing rows.

import { db } from '../lib/supabase'
import { approveTransaction } from './transactions.service'
import { getExchangeRate } from './exchange-rate.service'
import type { JournalEntry, EntryTypeEnum } from '../types/database.types'
import { toSafeMessage } from '../lib/errors'

// ── Multi-currency: normalize every posted line to USD ──────────────────────
// journal_entries.amount/currency stay exactly as-transacted (audit fidelity
// -- never rewritten); amount_usd is the figure get_profit_and_loss/
// get_balance_sheet/compute_account_balance actually sum, added specifically
// so a EUR line and a USD line stop summing as if they were the same unit.
// Rate convention (exchange-rate.service.ts): usd_rate = "1 USD = N of this
// currency", so USD = foreign_amount / usd_rate.
async function toUsd(amount: number, currency: string): Promise<number> {
  const code = currency.toUpperCase()
  if (code === 'USD') return amount
  const rate = await getExchangeRate(code)
  if (!rate) {
    // Unknown/unsupported currency -- fail loudly rather than silently
    // mis-booking a foreign amount as if it were USD.
    throw new Error(`[Journal] No exchange rate available for ${code}`)
  }
  return Math.round((amount / rate) * 100) / 100
}

export interface JournalLine {
  accountId:   string
  entryType:   EntryTypeEnum
  amount:      number
  currency?:   string
  memo?:       string | null
}

// ── Post a set of journal entries for a transaction ──────────────────────────

export async function postJournalEntries(
  transactionId: string,
  lines:         JournalLine[],
  periodYear:    number,
  periodMonth:   number,
  currency = 'USD'
): Promise<JournalEntry[]> {
  // Validate balance before touching the DB
  validateBalance(lines)

  const inserts = await Promise.all(lines.map(async l => {
    const lineCurrency = (l.currency ?? currency).toUpperCase()
    return {
      transaction_id: transactionId,
      account_id:     l.accountId,
      entry_type:     l.entryType,
      amount:         l.amount,
      amount_usd:     await toUsd(l.amount, lineCurrency),
      currency:       lineCurrency,
      memo:           l.memo ?? null,
      period_year:    periodYear,
      period_month:   periodMonth
    }
  }))

  const { data, error } = await db
    .from('journal_entries')
    .insert(inserts)
    .select()

  if (error || !data) {
    throw new Error(`[Journal] Post failed: ${toSafeMessage(error, 'database error')}`)
  }

  return data
}

// ── Post one transaction straight to the ledger (bulk-posting building block) ─
//
// Mirrors AccountAssignment.tsx's handlePost() exactly (same two calls, same
// order: post the balanced entry, then approveTransaction to verify → blue
// through the canonical audit-hash-chained path) — just parameterized so
// Transactions.tsx can call it in a loop across a multi-select instead of one
// transaction at a time. Guards against double-posting itself (postJournalEntries
// has no such guard — it will happily insert a second entry pair if called
// twice; AccountAssignment.tsx only avoided that by hiding its own form once
// entries existed, which doesn't help a bulk caller).
//
// Uses the transaction's OWN date for the posting period (not "today") — the
// more correct choice for a bulk tool clearing a backlog of older
// transactions, so they land in the P&L period they actually occurred in.

export interface PostableTransaction {
  id:               string
  amount:           number
  currency:         string
  transaction_date: string   // ISO 'YYYY-MM-DD'
  description:      string | null
}

export async function postTransactionToLedger(
  tx:             PostableTransaction,
  debitAccountId:  string,
  creditAccountId: string,
  orgId:           string,
  approverId:      string
): Promise<void> {
  const existing = await getJournalEntries(tx.id)
  if (existing.some(e => !e.is_reversed)) {
    throw new Error('Already posted to the ledger')
  }

  const [year, month] = tx.transaction_date.split('-').map(Number) as [number, number]
  const amount = Math.abs(tx.amount)

  await postJournalEntries(
    tx.id,
    [
      { accountId: debitAccountId,  entryType: 'debit',  amount, currency: tx.currency, memo: tx.description },
      { accountId: creditAccountId, entryType: 'credit', amount, currency: tx.currency, memo: tx.description }
    ],
    year,
    month,
    tx.currency
  )

  await approveTransaction({ transactionId: tx.id, orgId, approverId })
}

// ── Reverse a set of entries (creates mirror rows, marks originals) ──────────

export async function reverseJournalEntries(
  originalEntryIds: string[],
  memo = 'Reversal entry'
): Promise<JournalEntry[]> {
  // Load originals
  const { data: originals, error: fetchErr } = await db
    .from('journal_entries')
    .select('*')
    .in('id', originalEntryIds)

  if (fetchErr || !originals?.length) {
    throw new Error(`[Journal] Originals not found: ${toSafeMessage(fetchErr, 'database error')}`)
  }

  // Check none are already reversed
  const alreadyReversed = originals.filter(e => e.is_reversed)
  if (alreadyReversed.length > 0) {
    throw new Error('[Journal] One or more entries are already reversed')
  }

  // Insert mirror entries (opposite entry_type). amount_usd is copied
  // straight from the original, not recomputed -- a reversal must offset
  // the exact USD figure that was actually posted, not whatever today's
  // exchange rate happens to be.
  const reversals = originals.map(e => ({
    transaction_id: e.transaction_id,
    account_id:     e.account_id,
    entry_type:     e.entry_type === 'debit' ? 'credit' : 'debit' as EntryTypeEnum,
    amount:         e.amount,
    amount_usd:     e.amount_usd,
    currency:       e.currency,
    memo:           `${memo} — ref: ${e.id.slice(0, 8)}`,
    period_year:    e.period_year,
    period_month:   e.period_month,
    is_reversed:    false
  }))

  const { data: reversalRows, error: insertErr } = await db
    .from('journal_entries')
    .insert(reversals)
    .select()

  if (insertErr || !reversalRows) {
    throw new Error(`[Journal] Reversal insert failed: ${toSafeMessage(insertErr, 'database error')}`)
  }

  // Mark originals as reversed and link to their reversal
  for (let i = 0; i < originals.length; i++) {
    await db
      .from('journal_entries')
      .update({
        is_reversed:       true,
        reversal_entry_id: reversalRows[i]?.id ?? null
      })
      .eq('id', originals[i]!.id)
  }

  return reversalRows
}

// ── Read entries for a transaction ───────────────────────────────────────────

export async function getJournalEntries(transactionId: string): Promise<JournalEntry[]> {
  const { data, error } = await db
    .from('journal_entries')
    .select('*')
    .eq('transaction_id', transactionId)
    .order('created_at')

  if (error) throw new Error(`[Journal] Fetch failed: ${toSafeMessage(error, 'database error')}`)
  return data ?? []
}

// ── Read balance totals for a transaction ────────────────────────────────────

export async function getJournalBalance(
  transactionId: string
): Promise<{ totalDebit: number; totalCredit: number; balanced: boolean }> {
  const { data, error } = await db
    .from('v_journal_balance_by_transaction')
    .select('total_debit, total_credit')
    .eq('transaction_id', transactionId)
    .single()

  if (error) throw new Error(`[Journal] Balance fetch failed: ${toSafeMessage(error, 'database error')}`)

  const totalDebit  = Number(data?.total_debit  ?? 0)
  const totalCredit = Number(data?.total_credit ?? 0)
  return { totalDebit, totalCredit, balanced: totalDebit === totalCredit }
}

// ── Get P&L summary for a period ─────────────────────────────────────────────

export async function getPeriodSummary(
  orgId:  string,
  year:   number,
  month?: number
) {
  let q = db
    .from('journal_entries')
    .select(`
      account_id,
      entry_type,
      amount,
      accounts!inner(code, name, type, org_id)
    `)
    .eq('accounts.org_id', orgId)
    .eq('period_year', year)
    .eq('is_reversed', false)

  if (month) q = q.eq('period_month', month)

  const { data, error } = await q
  if (error) throw new Error(`[Journal] Period summary failed: ${toSafeMessage(error, 'database error')}`)

  const map = new Map<string, {
    accountId:   string
    accountCode: string
    accountName: string
    accountType: string
    debit:  number
    credit: number
  }>()

  for (const row of (data ?? []) as any[]) {
    const acc = row.accounts
    if (!map.has(row.account_id)) {
      map.set(row.account_id, {
        accountId:   row.account_id,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        debit:  0,
        credit: 0
      })
    }
    const entry = map.get(row.account_id)!
    if (row.entry_type === 'debit') entry.debit  += Number(row.amount)
    else                            entry.credit += Number(row.amount)
  }

  return Array.from(map.values())
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
}

// ── Internal balance validator ───────────────────────────────────────────────

export function validateBalance(lines: JournalLine[]): void {
  if (lines.length < 2) {
    throw new Error('[Journal] Double-entry requires at least 2 lines')
  }

  // Sum in integer cents to avoid IEEE 754 accumulation errors.
  // Math.round converts each line's float dollars to the nearest cent
  // before accumulating, so e.g. 10 lines of $0.10 = exactly 100 cents.
  const totalDebitCents  = lines.filter(l => l.entryType === 'debit').reduce((s, l) => s + Math.round(l.amount * 100), 0)
  const totalCreditCents = lines.filter(l => l.entryType === 'credit').reduce((s, l) => s + Math.round(l.amount * 100), 0)

  if (totalDebitCents !== totalCreditCents) {
    const d = (totalDebitCents  / 100).toFixed(2)
    const c = (totalCreditCents / 100).toFixed(2)
    throw new Error(`[Journal] Unbalanced entry: debit $${d} ≠ credit $${c}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  MANUAL JOURNAL BATCHES (Controller / Accountant feature — v43)
// ═════════════════════════════════════════════════════════════════════════════

export type JournalEntryKind =
  | 'transaction_linked'
  | 'manual_adjustment'
  | 'closing_entry'
  | 'depreciation'
  | 'opening_balance'

export type BatchStatus = 'draft' | 'posted' | 'reversed'

export interface ManualJournalBatch {
  id:                   string
  org_id:               string
  // Nullable to match the DB: manual_journal_batches.client_id IS NULLABLE
  // (an org-level batch not scoped to a specific client).
  client_id:            string | null
  entry_kind:           Exclude<JournalEntryKind, 'transaction_linked'>
  effective_date:       string
  period_year:          number
  period_month:         number
  memo:                 string
  prepared_by:          string
  approved_by:          string | null
  approved_at:          string | null
  status:               BatchStatus
  posted_at:            string | null
  posted_by:            string | null
  reversed_by_batch_id: string | null
  reverses_batch_id:    string | null
  created_at:           string
  updated_at:           string
}

export interface CreateManualBatchInput {
  orgId:         string
  clientId:      string | null       // NULL = org-level batch (DB column is nullable)
  entryKind:     Exclude<JournalEntryKind, 'transaction_linked'>
  effectiveDate: string                 // ISO date 'YYYY-MM-DD'
  memo:          string                 // min 5 chars (DB enforced)
  lines:         JournalLine[]          // must balance debits=credits, >=2 lines
  preparedBy:    string                 // current user
}

// ── Helper: derive (year, month) from ISO date ──────────────────────────────
function parsePeriod(isoDate: string): { year: number; month: number } {
  const [y, m] = isoDate.split('-')
  return { year: parseInt(y!, 10), month: parseInt(m!, 10) }
}

/**
 * Create a manual journal batch (draft) and atomically post it.
 *
 * Flow:
 *   1. Service validates balance (UX layer — fail fast).
 *   2. INSERT batch as 'draft'.
 *   3. INSERT all journal_entries linked to that batch_id (entry_kind = batch's kind).
 *   4. UPDATE batch status='posted' → trigger validates balance + sets posted_at/by.
 *   5. Returns the posted batch row.
 *
 * The deferrable DB trigger validates balance at COMMIT. If lines don't balance,
 * the entire transaction is rolled back.
 *
 * Throws on:
 *   · unbalanced lines (caught by service before DB call)
 *   · period locked (caught by v45 trigger on batch INSERT)
 *   · DB-level balance mismatch (last line of defense, very rare if service check passed)
 */
export async function postManualJournalBatch(
  input: CreateManualBatchInput
): Promise<ManualJournalBatch> {
  // 1. Service-level balance check (defense-in-depth layer 1)
  validateBalance(input.lines)

  const { year, month } = parsePeriod(input.effectiveDate)

  // 2. INSERT batch (draft)
  const { data: batch, error: batchErr } = await db
    .from('manual_journal_batches')
    .insert({
      org_id:         input.orgId,
      client_id:      input.clientId,
      entry_kind:     input.entryKind,
      effective_date: input.effectiveDate,
      period_year:    year,
      period_month:   month,
      memo:           input.memo,
      prepared_by:    input.preparedBy,
      status:         'draft'
    })
    .select()
    .single()

  if (batchErr || !batch) {
    throw new Error(`[Journal] Batch create failed: ${toSafeMessage(batchErr, 'database error')}`)
  }

  // 3. INSERT all journal_entries with batch_id
  const lineInserts = await Promise.all(input.lines.map(async l => {
    const lineCurrency = (l.currency ?? 'USD').toUpperCase()
    return {
      transaction_id: null,
      batch_id:       batch.id,
      entry_kind:     input.entryKind,
      account_id:     l.accountId,
      entry_type:     l.entryType,
      amount:         l.amount,
      amount_usd:     await toUsd(l.amount, lineCurrency),
      currency:       lineCurrency,
      memo:           l.memo ?? null,
      period_year:    year,
      period_month:   month
    }
  }))

  const { error: linesErr } = await db
    .from('journal_entries')
    .insert(lineInserts)

  if (linesErr) {
    // Best-effort cleanup: drop the draft batch (CASCADE will handle any partial inserts)
    await db.from('manual_journal_batches').delete().eq('id', batch.id)
    throw new Error(`[Journal] Batch lines insert failed: ${toSafeMessage(linesErr, 'database error')}`)
  }

  // 4. UPDATE batch → posted (triggers run at COMMIT)
  const { data: posted, error: postErr } = await db
    .from('manual_journal_batches')
    .update({
      status:    'posted',
      posted_at: new Date().toISOString(),
      posted_by: input.preparedBy
    })
    .eq('id', batch.id)
    .select()
    .single()

  if (postErr || !posted) {
    throw new Error(`[Journal] Batch post failed: ${toSafeMessage(postErr, 'database error')}`)
  }

  return posted as ManualJournalBatch
}

/**
 * Reverse a posted batch by creating a new batch with mirror lines.
 * Sets `reverses_batch_id` on the new batch and `reversed_by_batch_id`
 * on the original. Original is moved to status='reversed'.
 */
export async function reverseManualJournalBatch(
  orgId:      string,
  batchId:    string,
  reverserId: string,
  memo:       string
): Promise<ManualJournalBatch> {
  // Load original
  const { data: original, error: fetchErr } = await db
    .from('manual_journal_batches')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', batchId)
    .single()

  if (fetchErr || !original) {
    throw new Error(`[Journal] Original batch not found: ${toSafeMessage(fetchErr, 'database error')}`)
  }

  if (original.status !== 'posted') {
    throw new Error(`[Journal] Only 'posted' batches can be reversed (current: ${original.status})`)
  }

  // Load original lines
  const { data: originalLines, error: linesErr } = await db
    .from('journal_entries')
    .select('*')
    .eq('batch_id', batchId)

  if (linesErr || !originalLines?.length) {
    throw new Error(`[Journal] Original lines not found: ${toSafeMessage(linesErr, 'database error')}`)
  }

  // Build mirror lines (flip entry_type)
  const mirrorLines: JournalLine[] = originalLines.map(l => ({
    accountId: l.account_id,
    entryType: l.entry_type === 'debit' ? 'credit' : 'debit',
    amount:    Number(l.amount),
    currency:  l.currency,
    memo:      `Reversal of batch ${batchId.slice(0, 8)}`
  }))

  // Post the reversal as a new batch
  const reversal = await postManualJournalBatch({
    orgId:         original.org_id,
    clientId:      original.client_id,
    // DB constraint manual_journal_batches_entry_kind_check guarantees
    // entry_kind <> 'transaction_linked' for every row in this table.
    entryKind:     original.entry_kind as Exclude<JournalEntryKind, 'transaction_linked'>,
    effectiveDate: original.effective_date,
    memo:          `REVERSAL — ${memo}`,
    lines:         mirrorLines,
    preparedBy:    reverserId
  })

  // Update reversal pointers (DB trigger allows posted → reversed when reversed_by_batch_id is set)
  await db
    .from('manual_journal_batches')
    .update({ reverses_batch_id: original.id })
    .eq('id', reversal.id)

  await db
    .from('manual_journal_batches')
    .update({
      status:               'reversed',
      reversed_by_batch_id: reversal.id
    })
    .eq('id', original.id)

  return reversal
}

/**
 * Approve a posted batch (segregation-of-duties sign-off).
 * Does NOT change `status` — approval is metadata layered on top of
 * 'posted', matching the BatchStatus model (draft | posted | reversed has
 * no separate 'approved' state). The UI's canApproveManualBatch flag
 * already restricts this to owner/admin in an accountant firm, and checks
 * prepared_by !== current user client-side — both checks are repeated here
 * server-side as defense in depth, same pattern as reverseManualJournalBatch
 * re-validating status.
 */
export async function approveManualJournalBatch(
  orgId:      string,
  batchId:    string,
  approverId: string
): Promise<ManualJournalBatch> {
  const { data: batch, error: fetchErr } = await db
    .from('manual_journal_batches')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', batchId)
    .single()

  if (fetchErr || !batch) {
    throw new Error(`[Journal] Batch not found: ${toSafeMessage(fetchErr, 'database error')}`)
  }
  if (batch.status !== 'posted') {
    throw new Error(`[Journal] Only 'posted' batches can be approved (current: ${batch.status})`)
  }
  if (batch.approved_by) {
    throw new Error('[Journal] Batch already approved')
  }
  if (batch.prepared_by === approverId) {
    throw new Error('[Journal] Preparer cannot approve their own batch (segregation of duties)')
  }

  const { data: approved, error: updateErr } = await db
    .from('manual_journal_batches')
    .update({
      approved_by: approverId,
      approved_at: new Date().toISOString()
    })
    .eq('id', batchId)
    .select()
    .single()

  if (updateErr || !approved) {
    throw new Error(`[Journal] Approval update failed: ${toSafeMessage(updateErr, 'database error')}`)
  }

  return approved as ManualJournalBatch
}

/**
 * Fetch manual batches for a (org, client) — newest first.
 * Filter by status / period optionally.
 */
export async function listManualJournalBatches(
  orgId:    string,
  clientId: string,
  options?: {
    status?:        BatchStatus
    periodYear?:    number
    periodMonth?:   number
    limit?:         number
  }
): Promise<ManualJournalBatch[]> {
  let q = db
    .from('manual_journal_batches')
    .select('*')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .order('effective_date', { ascending: false })
    .order('created_at',     { ascending: false })

  if (options?.status)      q = q.eq('status',       options.status)
  if (options?.periodYear)  q = q.eq('period_year',  options.periodYear)
  if (options?.periodMonth) q = q.eq('period_month', options.periodMonth)

  q = q.limit(options?.limit ?? 50)

  const { data, error } = await q
  if (error) throw new Error(`[Journal] List batches failed: ${toSafeMessage(error, 'database error')}`)
  return (data ?? []) as ManualJournalBatch[]
}
