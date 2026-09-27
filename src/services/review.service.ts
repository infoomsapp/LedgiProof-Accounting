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

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'

export type SuggestionSource = 'rule' | 'learned' | 'vendor' | 'merchant' | 'income' | 'ai'

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
  items: { transaction_id: string; account_id: string; source?: string | null }[]
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
