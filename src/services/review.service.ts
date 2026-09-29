// PATH: src/services/review.service.ts
//
// "For review" inbox: categorize bank transactions in one click.
//
//   getReviewQueue()      -> get_review_queue(): uncategorized transactions,
//                            each with a suggested category (rule / learned /
//                            vendor / known merchant / income).
//   suggestWithAi()       -> suggest-categories edge function: fills in the
//                            ones nothing else could suggest.
//   postReviewed()        -> post_reviewed_transactions(): posts the balanced
//                            entry (bank side implied), marks it blue/verified
//                            with the audit hash chain, learns the merchant.
//   setCategorizationRule -> set_categorization_rule(): "always put X in Y".
//
// The semaphore (derived in the database, semaphore_v2.sql):
//   blue  verified by a person        green ready: in the books, to verify
//   amber needs your eyes             red   problem (flagged / rejected)
// Automation (auto_categorize_transactions) posts only what is certain --
// a rule, a merchant confirmed 3 times in a row, an exact unique match --
// and those arrive green. A person verifies them (verifyTransactions) or
// removes the category (uncategorizeTransaction), which sends the merchant
// back to "ask me".

import { db } from '../lib/supabase'
import { dbError, LP_ERROR_CODE } from '../lib/errors'

export type SuggestionSource =
  | 'rule' | 'learned' | 'vendor' | 'merchant' | 'bank_category' | 'income' | 'ai'
  | 'invoice' | 'deposit' | 'bill' | 'bill_payment'

/** A deposit whose amount is exactly an open invoice's balance. */
export interface InvoiceMatch {
  invoice_id:     string
  invoice_number: string
  client_name:    string | null
  balance_due:    number
}

/** A deposit that brings in a payment already recorded on an invoice. */
export interface DepositMatch {
  payment_id:     string
  invoice_number: string
  payment_date:   string
  method:         string | null
}

/**
 * A withdrawal that pays a bill: 'open' = an unpaid bill for exactly this
 * amount (confirming marks it paid); 'in_transit' = a bill already marked paid
 * whose money this withdrawal is (confirming clears Bill Payments in Transit).
 */
export interface BillMatch {
  bill_id:     string
  bill_number: string | null
  vendor_name: string
  kind:        'open' | 'in_transit'
}

export interface ReviewItem {
  id:                     string
  transaction_date:       string
  description:            string | null
  merchant_name:          string | null
  amount:                 number
  currency:               string
  semaphore:              'blue' | 'green' | 'amber' | 'red'
  status_reason:          string | null
  merchant_key:           string
  suggested_account_id:   string | null
  suggestion_source:      SuggestionSource | null
  suggestion_confidence:  number | null
  suggested_account_code: string | null
  suggested_account_name: string | null
  has_receipt:            boolean
  invoice_match:          InvoiceMatch | null
  deposit_match:          DepositMatch | null
  bill_match:             BillMatch | null
}

export interface ReviewQueue {
  items:        ReviewItem[]
  total:        number
  /** The account the bank side posts to; null = the chart has none yet. */
  bank_account: string | null
}

export interface RulePrompt {
  merchant_key: string
  client_id:    string | null
  account_id:   string
  account_name: string
  example:      string
}

export interface PostResult {
  posted:       string[]
  failed:       { transaction_id: string; error: string }[]
  rule_prompts: RulePrompt[]
}

export async function getReviewQueue(orgId: string, clientId: string | null): Promise<ReviewQueue> {
  const { data, error } = await db.rpc('get_review_queue', {
    p_org_id: orgId,
    p_limit:  100,
    ...(clientId ? { p_client_id: clientId } : {})
  })
  if (error) throw dbError(error, 'Could not load the transactions to review')
  return data as unknown as ReviewQueue
}

export async function suggestWithAi(
  orgId: string,
  clientId: string | null,
  transactionIds: string[]
): Promise<{ transaction_id: string; account_id: string; account_code: string; account_name: string; confidence: number }[]> {
  if (transactionIds.length === 0) return []
  const { data, error } = await db.functions.invoke('suggest-categories', {
    body: { org_id: orgId, client_id: clientId, transaction_ids: transactionIds.slice(0, 25) }
  })
  // AI suggestions are a bonus: any failure just leaves those rows to the user.
  if (error || !data?.suggestions) return []
  return data.suggestions
}

export async function postReviewed(
  orgId: string,
  items: {
    transaction_id: string
    account_id:     string
    source?:        string | null
    /** The deposit pays this invoice (records the payment). */
    invoice_id?:    string
    /** The deposit brings in this recorded payment. */
    payment_id?:    string
    /** The withdrawal pays (or clears the recorded payment of) this bill. */
    bill_id?:       string
  }[]
): Promise<PostResult> {
  const { data, error } = await db.rpc('post_reviewed_transactions', {
    p_org_id: orgId,
    p_items:  items
  })
  if (error) throw dbError(error, 'Could not verify the transactions')
  return data as unknown as PostResult
}

export async function setCategorizationRule(
  orgId: string,
  clientId: string | null,
  merchantKey: string,
  accountId: string,
  isRule = true
): Promise<void> {
  const { error } = await db.rpc('set_categorization_rule', {
    p_org_id:       orgId,
    p_client_id:    clientId as string,
    p_merchant_key: merchantKey,
    p_account_id:   accountId,
    p_is_rule:      isRule
  })
  if (error) throw dbError(error, 'Could not save the rule')
}

// ── Verify: green (ready) -> blue (verified) ────────────────────────────────

/** In the books, not verified yet: what a person checks and verifies. */
export interface VerificationItem {
  id:                    string
  transaction_date:      string
  description:           string | null
  merchant_name:         string | null
  amount:                number
  currency:              string
  semaphore:             'blue' | 'green' | 'amber' | 'red'
  status_reason:         string | null
  client_id:             string | null
  client_name:           string | null
  category_account_id:   string | null
  category_account_code: string | null
  category_account_name: string | null
  /** true = LedgiProof categorized it by itself (rule / learned / exact match). */
  auto:                  boolean
  source:                SuggestionSource | null
  /** "invoice INV-0012" / "bill B-7" when it settles a document. */
  matched_to:            string | null
}

export interface VerificationQueue {
  items: VerificationItem[]
  total: number
}

export async function getVerificationQueue(
  orgId: string,
  scope: { clientId: string | null } | { allClients: true }
): Promise<VerificationQueue> {
  const { data, error } = await db.rpc('get_verification_queue', {
    p_org_id: orgId,
    ...('allClients' in scope
      ? { p_all_clients: true }
      : scope.clientId ? { p_client_id: scope.clientId } : {})
  })
  if (error) throw dbError(error, 'Could not load the transactions to verify')
  return data as unknown as VerificationQueue
}

export interface VerifyResult {
  verified:     string[]
  failed:       { transaction_id: string; error: string; code?: string }[]
  rule_prompts: RulePrompt[]
}

/** A per-row failure from verify_transactions, as an Error (LedgiProof codes translated). */
export function rowFailure(f: { error: string; code?: string }): Error {
  return f.code && LP_ERROR_CODE.test(f.code)
    ? dbError({ code: f.code, message: f.error, details: null, hint: null })
    : new Error(f.error)
}

export async function verifyTransactions(orgId: string, transactionIds: string[]): Promise<VerifyResult> {
  const { data, error } = await db.rpc('verify_transactions', {
    p_org_id:          orgId,
    p_transaction_ids: transactionIds
  })
  if (error) throw dbError(error, 'Could not verify the transactions')
  return data as unknown as VerifyResult
}

/** Take the category off (back to For review). The merchant goes back to "ask me". */
export async function uncategorizeTransaction(orgId: string, transactionId: string): Promise<void> {
  const { error } = await db.rpc('uncategorize_transaction', {
    p_org_id:         orgId,
    p_transaction_id: transactionId
  })
  if (error) throw dbError(error, 'Could not remove the category')
}

/** Imported bank lines: post the ones that are certain. Best effort -- the rest wait in For review. */
export async function autoCategorize(
  orgId: string,
  transactionIds: string[]
): Promise<{ posted: string[]; failed: { transaction_id: string; error: string }[]; skipped: number }> {
  if (transactionIds.length === 0) return { posted: [], failed: [], skipped: 0 }
  const { data, error } = await db.rpc('auto_categorize_transactions', {
    p_org_id:          orgId,
    p_transaction_ids: transactionIds
  })
  if (error) throw dbError(error, 'Could not categorize the imported transactions')
  return data as unknown as { posted: string[]; failed: { transaction_id: string; error: string }[]; skipped: number }
}
