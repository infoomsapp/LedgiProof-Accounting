// ── src/services/transactions.service.ts ─────────────────────────────────────
// The only correct way to write a transaction into LedgiProof.
// Every insert flows through:
//   1. buildRawHash        → raw_hash  (pre-human fingerprint)
//   2. Brain.evaluate      → semaphore assignment  (+ user_patterns learning)
//   3. CGC.evaluate        → Proof-of-Decision     (governance layer)
//   4. db.insert           → transaction row
//   5. Brain.persist       → rule_evaluations row
//   6. CGC.persist         → audit_events cgc_proof
//   7. Audit.append        → audit_events chain entry

import { db } from '../lib/supabase'
import { buildRawHash, buildFinalHash, buildAuditHash } from '../lib/hash'
import { evaluateTransaction, persistEvaluation } from './brain.service'
import { appendAuditEvent, getLatestAuditHash } from './audit.service'
import { getCurrentUserId } from '../lib/supabase'
import { createNotification } from '../hooks/useNotifications'
import { cgcEvaluate } from './cgc.service'
import { autoAssignLearnedVendor } from './vendor.service'
import { markReadModelDirty } from '../lib/read-model'
import { formatCurrency } from '../lib/currency'
import type {
  Transaction,
  InsertTransaction,
  TxSource,
  SemaphoreStatus,
  PaymentMethodType,
  Json
} from '../types/database.types'
import { toSafeMessage } from '../lib/errors'

// `transaction_group_id` has no column-level DEFAULT, so the generated
// Insert type marks it required — but trg_default_transaction_group_id
// (BEFORE INSERT) always fills it when omitted, so it's optional in practice.
type NewTransactionRow = Omit<InsertTransaction, 'transaction_group_id'> & {
  transaction_group_id?: string
}

// ── Input shape for creating a new transaction ───────────────────────────────

export interface CreateTransactionInput {
  orgId:            string
  bankImportId?:    string | null
  source:           TxSource
  amount:           number
  currency?:        string
  reference?:       string | null
  description?:     string | null
  transactionDate:  string     // ISO date: '2024-06-15'
  metadata?:        Record<string, unknown>
  /**
   * 🆕 Client Switcher Sprint 3 — Scope binding.
   * Set this in firm-client mode (bookkeeper working inside a client workspace).
   * Leave undefined in self mode (solo / pyme / personal).
   */
  clientId?:        string | null
  /**
   * 🆕 1099 Fase 2 — Payment instrument. Drives 1099 reportability
   * (card / third-party → excluded from 1099-NEC). Derived at ingest from the
   * funding account type; defaults to 'unknown' when the instrument is unknown.
   */
  paymentMethod?:   PaymentMethodType
}

// ── Input shape for editing an existing transaction (creates new version) ────

export interface EditTransactionInput {
  transactionGroupId: string
  orgId:              string
  amount?:            number
  currency?:          string
  reference?:         string | null
  description?:       string | null
  transactionDate?:   string
  metadata?:          Record<string, unknown>
  editReason:         string    // required — stored in audit diff
}

// ── Input shape for approving an amber/red transaction ───────────────────────

export interface ApproveTransactionInput {
  transactionId: string
  orgId:         string
  approverId:    string
  note?:         string
}

// ═════════════════════════════════════════════════════════════════════════════
//  CREATE — insert a brand-new transaction (version 1)
// ═════════════════════════════════════════════════════════════════════════════

export async function createTransaction(
  input: CreateTransactionInput
): Promise<Transaction> {
  const actorId = await getCurrentUserId()
  if (!actorId) throw new Error('[Transactions] User not authenticated')

  const currency = input.currency ?? 'USD'

  // 1. Build raw_hash — fingerprint of the raw data before any human touch
  const rawHash = await buildRawHash({
    orgId:           input.orgId,
    amount:          input.amount,
    currency,
    reference:       input.reference ?? null,
    transactionDate: input.transactionDate,
    source:          input.source
  })

  // 2. Run Brain — evaluate rules and assign semaphore
  const brainResult = await evaluateTransaction({
    orgId:           input.orgId,
    clientId:        input.clientId ?? null,
    amount:          input.amount,
    currency,
    reference:       input.reference ?? null,
    description:     input.description ?? null,
    transactionDate: input.transactionDate,
    source:          input.source,
    metadata:        input.metadata ?? {}
  })

  // 3. Get last audit entry hash for chain continuity
  const previousHash = await getLatestAuditHash(input.orgId)

  // 4. Insert transaction row
  const newRow: NewTransactionRow = {
    org_id:               input.orgId,
    client_id:            input.clientId ?? null,   // 🆕 Client Switcher Sprint 3
    bank_import_id:       input.bankImportId ?? null,
    version:              1,
    source:               input.source,
    amount:               input.amount,
    currency,
    reference:            input.reference ?? null,
    description:          input.description ?? null,
    transaction_date:     input.transactionDate,
    semaphore:            brainResult.finalStatus,
    status_reason:        brainResult.explanation ?? null,
    raw_hash:             rawHash,
    previous_hash:        previousHash,
    metadata:             (input.metadata ?? {}) as Json,
    payment_method:       input.paymentMethod ?? 'unknown',   // 🆕 1099 Fase 2
    created_by:           actorId
  }

  const { data, error } = await db
    .from('transactions')
    // transaction_group_id intentionally omitted — trg_default_transaction_group_id
    // (BEFORE INSERT) generates it via gen_random_uuid(). The generated Insert type
    // doesn't know about trigger-backed defaults (only column-level DEFAULT), so it
    // marks the field required; this cast reflects the actual DB contract, not a bypass.
    .insert(newRow as InsertTransaction)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[Transactions] Insert failed: ${toSafeMessage(error, 'database error')}`)
  }

  // 5. Persist Brain evaluation
  await persistEvaluation(data.id, data.version, brainResult)

  // 5b. 1099 normalization — auto-assign the learned vendor (payee) for this
  // merchant, if a confirmed pattern exists. Best-effort and non-blocking:
  // classification must never fail because vendor resolution failed. Covers
  // every ingest path (CSV/OFX import, Plaid, manual) from a single point.
  autoAssignLearnedVendor({
    id:            data.id,
    org_id:        data.org_id,
    description:   data.description,
    merchant_name: data.merchant_name
  }).catch(() => {})

  // 6. CGC Core governance evaluation — Proof-of-Decision
  // Non-blocking: runs in background, never fails transaction creation.
  // cgcEvaluate() already persists the result internally (both the remote
  // and embedded-fallback paths call persistCGCValidation before returning),
  // so there's nothing further to do with the result here. The previous
  // version of this call used snake_case field names that don't exist on
  // CGCEvaluationInput at all (transaction_id vs transactionId, etc.) and
  // then piped the result into persistCGCProof — an unfinished stub
  // ("// TODO: Implement...") that also required a 4-argument call it never
  // had and would have failed cgc_validations' NOT NULL org_id constraint
  // even if the arity were right. This governance/proof-of-decision path
  // had never actually persisted a real evaluation for a newly created
  // transaction.
  cgcEvaluate({
    transactionId: data.id,
    orgId:         input.orgId,
    amount:        input.amount,
    currency,
    description:   input.description ?? null,
    reference:     input.reference ?? null,
    date:          input.transactionDate,
    source:        input.source,
    semaphore:     brainResult.finalStatus,
    confidence:    brainResult.ruleScore,
    metadata:      input.metadata ?? {}
  }).catch(() => {}) // CGC failure never blocks the transaction

  // 7. Append audit event
  const entryHash = await buildAuditHash({
    previousHash:       previousHash,
    transactionId:      data.id,
    transactionVersion: data.version,
    eventType:          'created',
    timestamp:          data.created_at,
    actorId
  })

  await appendAuditEvent({
    orgId:              input.orgId,
    transactionId:      data.id,
    transactionGroupId: data.transaction_group_id,
    transactionVersion: data.version,
    eventType:          'created',
    actorId,
    previousHash,
    entryHash,
    metadata: {
      raw_hash:       rawHash,
      brain_result:   brainResult,
      semaphore:      brainResult.finalStatus
    }
  })

  // Fire notification for amber/red transactions
  if (['amber','red'].includes(brainResult.finalStatus)) {
    createNotification({
      orgId:         input.orgId,
      userId:        actorId,
      type:          'review_requested',
      title:         brainResult.finalStatus === 'red'
                       ? '🔴 Transaction needs immediate review'
                       : '🟡 Transaction flagged for review',
      body:          `${input.description ?? input.reference ?? 'Transaction'} · ${
                       formatCurrency(Math.abs(input.amount), input.currency ?? 'USD')
                     }`,
      transactionId: data.id
    }).catch(() => {}) // non-blocking — never fail the transaction
  }

  // CQRS: mark read models that depend on transaction data as dirty.
  // Fire-and-forget — never awaited; the Realtime signal triggers client
  // cache invalidation without any additional round-trips on this path.
  markReadModelDirty(input.orgId, [
    'accountant_dashboard', 'bookkeeper_dashboard',
    'firm_insights', 'solo_dashboard', 'pyme_dashboard',
  ])

  return data
}

// ═════════════════════════════════════════════════════════════════════════════
//  EDIT — create a new version of an existing transaction
// ═════════════════════════════════════════════════════════════════════════════

export async function editTransaction(
  input: EditTransactionInput
): Promise<Transaction> {
  const actorId = await getCurrentUserId()
  if (!actorId) throw new Error('[Transactions] User not authenticated')

  // Load the current version
  const { data: current, error: fetchErr } = await db
    .from('transactions')
    .select('*')
    .eq('org_id', input.orgId)
    .eq('transaction_group_id', input.transactionGroupId)
    .eq('is_current', true)
    .single()

  if (fetchErr || !current) {
    throw new Error(`[Transactions] Current version not found: ${toSafeMessage(fetchErr, 'database error')}`)
  }

  if (current.locked_at) {
    throw new Error('[Transactions] Cannot edit a locked transaction')
  }

  // Build merged data for new version
  const newAmount   = input.amount          ?? current.amount
  const newCurrency = input.currency        ?? current.currency
  const newRef      = input.reference       !== undefined ? input.reference   : current.reference
  const newDesc     = input.description     !== undefined ? input.description : current.description
  const newDate     = input.transactionDate ?? current.transaction_date
  const newMeta     = input.metadata        ?? (current.metadata as Record<string, unknown>)

  // Raw hash of the new data
  const rawHash = await buildRawHash({
    orgId:           input.orgId,
    amount:          newAmount,
    currency:        newCurrency,
    reference:       newRef ?? null,
    transactionDate: newDate,
    source:          current.source
  })

  // Re-evaluate with Brain
  const brainResult = await evaluateTransaction({
    orgId:           input.orgId,
    clientId:        current.client_id ?? null,
    amount:          newAmount,
    currency:        newCurrency,
    reference:       newRef ?? null,
    description:     newDesc ?? null,
    transactionDate: newDate,
    source:          current.source,
    metadata:        newMeta
  })

  const previousHash = await getLatestAuditHash(input.orgId)
  const newVersion   = current.version + 1

  // Insert new version row (DB trigger marks old version as is_current=false)
  const { data, error } = await db
    .from('transactions')
    .insert({
      org_id:               input.orgId,
      bank_import_id:       current.bank_import_id,
      transaction_group_id: input.transactionGroupId,
      version:              newVersion,
      parent_version_id:    current.id,
      source:               current.source,
      amount:               newAmount,
      currency:             newCurrency,
      reference:            newRef,
      description:          newDesc,
      transaction_date:     newDate,
      semaphore:            brainResult.finalStatus,
      status_reason:        brainResult.explanation ?? null,
      raw_hash:             rawHash,
      previous_hash:        previousHash,
      metadata:             newMeta as Json,
      created_by:           actorId
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[Transactions] Edit insert failed: ${toSafeMessage(error, 'database error')}`)
  }

  await persistEvaluation(data.id, data.version, brainResult)

  // Build diff for audit trail
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  if (input.amount          !== undefined) diff['amount']           = { before: current.amount,           after: newAmount }
  if (input.currency        !== undefined) diff['currency']         = { before: current.currency,         after: newCurrency }
  if (input.reference       !== undefined) diff['reference']        = { before: current.reference,        after: newRef }
  if (input.description     !== undefined) diff['description']      = { before: current.description,      after: newDesc }
  if (input.transactionDate !== undefined) diff['transaction_date'] = { before: current.transaction_date, after: newDate }

  const prevSemaphore = current.semaphore as SemaphoreStatus
  if (prevSemaphore !== brainResult.finalStatus) {
    diff['semaphore'] = { before: prevSemaphore, after: brainResult.finalStatus }
  }

  const entryHash = await buildAuditHash({
    previousHash:       previousHash,
    transactionId:      data.id,
    transactionVersion: data.version,
    eventType:          'edited',
    timestamp:          data.created_at,
    actorId
  })

  await appendAuditEvent({
    orgId:              input.orgId,
    transactionId:      data.id,
    transactionGroupId: input.transactionGroupId,
    transactionVersion: data.version,
    eventType:          'edited',
    actorId,
    previousHash,
    entryHash,
    diff,
    metadata: {
      edit_reason:  input.editReason,
      raw_hash:     rawHash,
      brain_result: brainResult
    }
  })

  return data
}

// ═════════════════════════════════════════════════════════════════════════════
//  APPROVE — human approval for amber/red transactions
// ═════════════════════════════════════════════════════════════════════════════

export async function approveTransaction(
  input: ApproveTransactionInput
): Promise<Transaction> {
  const { data: tx, error: fetchErr } = await db
    .from('transactions')
    .select('*')
    .eq('id', input.transactionId)
    .eq('org_id', input.orgId)
    .single()

  if (fetchErr || !tx) {
    throw new Error(`[Transactions] Transaction not found: ${toSafeMessage(fetchErr, 'database error')}`)
  }

  if (tx.locked_at) throw new Error('[Transactions] Transaction already locked')
  if (tx.semaphore === 'blue') throw new Error('[Transactions] Transaction already verified')

  const now = new Date().toISOString()

  const { data, error } = await db
    .from('transactions')
    .update({
      semaphore:     'blue',
      approved_by:   input.approverId,
      approved_at:   now,
      review_status: 'confirmed'
    })
    .eq('id', input.transactionId)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[Transactions] Approval update failed: ${toSafeMessage(error, 'database error')}`)
  }

  const previousHash = await getLatestAuditHash(input.orgId)
  const entryHash    = await buildAuditHash({
    previousHash,
    transactionId:      data.id,
    transactionVersion: data.version,
    eventType:          'approved',
    timestamp:          now,
    actorId:            input.approverId
  })

  await appendAuditEvent({
    orgId:              input.orgId,
    transactionId:      data.id,
    transactionGroupId: data.transaction_group_id,
    transactionVersion: data.version,
    eventType:          'approved',
    actorId:            input.approverId,
    previousHash,
    entryHash,
    metadata: {
      note:         input.note ?? null,
      prev_semaphore: tx.semaphore
    }
  })

  return data
}

// ═════════════════════════════════════════════════════════════════════════════
//  LOCK — seal a blue transaction (final_hash computed here)
// ═════════════════════════════════════════════════════════════════════════════

export async function lockTransaction(
  transactionId: string,
  orgId: string
): Promise<Transaction> {
  const actorId = await getCurrentUserId()
  if (!actorId) throw new Error('[Transactions] User not authenticated')

  const { data: tx, error: fetchErr } = await db
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('org_id', orgId)
    .single()

  if (fetchErr || !tx) throw new Error(`[Transactions] Not found: ${toSafeMessage(fetchErr, 'database error')}`)
  if (tx.locked_at)      throw new Error('[Transactions] Already locked')
  if (tx.semaphore !== 'blue') {
    throw new Error('[Transactions] Only blue (verified) transactions can be locked')
  }

  const now          = new Date().toISOString()
  const previousHash = await getLatestAuditHash(orgId)

  const finalHash = await buildFinalHash({
    previousHash,
    transactionData: {
      id:               tx.id,
      org_id:           tx.org_id,
      version:          tx.version,
      amount:           tx.amount,
      currency:         tx.currency,
      reference:        tx.reference,
      transaction_date: tx.transaction_date,
      semaphore:        tx.semaphore
    },
    timestamp: now,
    actorId
  })

  // DB trigger enforce_balanced_journal_before_lock validates debit === credit
  const { data, error } = await db
    .from('transactions')
    .update({ locked_at: now, final_hash: finalHash })
    .eq('id', transactionId)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[Transactions] Lock failed: ${toSafeMessage(error, 'database error')}`)
  }

  const entryHash = await buildAuditHash({
    previousHash,
    transactionId:      data.id,
    transactionVersion: data.version,
    eventType:          'locked',
    timestamp:          now,
    actorId
  })

  await appendAuditEvent({
    orgId,
    transactionId:      data.id,
    transactionGroupId: data.transaction_group_id,
    transactionVersion: data.version,
    eventType:          'locked',
    actorId,
    previousHash,
    entryHash,
    metadata: { final_hash: finalHash }
  })

  return data
}

// ═════════════════════════════════════════════════════════════════════════════
//  CERTIFY — professional certification queue (Accountant/Bookkeeper firms)
//
//  `approveTransaction` above already jumps straight to semaphore:'blue' —
//  that's the informal/legacy path `Transactions.tsx` bulk-approve uses today.
//  This is the OTHER, formal path: a green transaction (client already
//  confirmed it, or Brain auto-cleared it) waiting for a firm professional to
//  certify it closed. It wraps the `resolve-transaction` Edge Function
//  (resolution:'certify') — that function already exists and already enforces
//  org-membership + role checks server-side, but had zero frontend callers.
// ═════════════════════════════════════════════════════════════════════════════

export interface CertificationQueueItem extends Transaction {
  clients: { display_name: string | null } | null
}

export async function getCertificationQueue(orgId: string): Promise<CertificationQueueItem[]> {
  const { data, error } = await db
    .from('transactions')
    .select('*, clients(display_name)')
    .eq('org_id', orgId)
    .eq('is_current', true)
    .eq('semaphore', 'green')
    .order('transaction_date', { ascending: false })

  if (error) {
    throw new Error(`[Transactions] Certification queue fetch failed: ${toSafeMessage(error, 'database error')}`)
  }
  return (data ?? []) as CertificationQueueItem[]
}

export async function certifyTransaction(transactionId: string): Promise<void> {
  const { data, error } = await db.functions.invoke('resolve-transaction', {
    body: { transaction_id: transactionId, resolution: 'certify' }
  })

  if (error) {
    const serverMessage = (data as { error?: string } | null)?.error
    throw new Error(`[Transactions] Certification failed: ${serverMessage ?? toSafeMessage(error, 'database error')}`)
  }
  if (!data?.success) {
    throw new Error(`[Transactions] Certification failed: ${data?.error ?? 'Unknown error'}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  READ helpers
// ═════════════════════════════════════════════════════════════════════════════

export async function getTransactions(
  orgId: string,
  options?: {
    semaphore?: SemaphoreStatus
    dateFrom?:  string
    dateTo?:    string
    amountMin?: number
    amountMax?: number
    search?:    string
    limit?:     number
    offset?:    number
    /**
     * 🆕 Client Switcher Sprint 3 — Scope filter.
     * · undefined / null → NO filter (legacy behavior, returns all rows for org)
     * · string UUID      → .eq('client_id', X) — scoped to that client
     * · 'none'           → .is('client_id', null) — orphan rows only
     */
    client_id?: string | null | 'none'
  }
) {
  let q = db
    .from('transactions')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_current', true)
    .order('transaction_date', { ascending: false })

  if (options?.semaphore) q = q.eq('semaphore', options.semaphore)
  if (options?.dateFrom)  q = q.gte('transaction_date', options.dateFrom)
  if (options?.dateTo)    q = q.lte('transaction_date', options.dateTo)
  if (options?.amountMin != null) q = q.gte('amount', options.amountMin)
  if (options?.amountMax != null) q = q.lte('amount', options.amountMax)
  if (options?.search) {
    const term = `%${options.search}%`
    q = q.or(`description.ilike.${term},reference.ilike.${term}`)
  }

  // Client scope filter — backward compatible: only filters when explicitly set.
  if (options?.client_id === 'none') {
    q = q.is('client_id', null)
  } else if (options?.client_id) {
    q = q.eq('client_id', options.client_id)
  }

  q = q.range(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 500) - 1)

  const { data, error } = await q
  if (error) throw new Error(`[Transactions] Fetch failed: ${toSafeMessage(error, 'database error')}`)
  return (data ?? []) as Transaction[]
}

export async function getTransactionHistory(transactionGroupId: string): Promise<Transaction[]> {
  const { data, error } = await db
    .from('transactions')
    .select('*')
    .eq('transaction_group_id', transactionGroupId)
    .order('version', { ascending: true })

  if (error) throw new Error(`[Transactions] History fetch failed: ${toSafeMessage(error, 'database error')}`)
  return (data ?? []) as Transaction[]
}
