// PATH: src/services/learning.service.ts
// The learning layer of LedgiProof.
//
// Every time a bookkeeper:
//   - Assigns an account to a transaction (journal entry)
//   - Approves a transaction
//   - Corrects a Brain classification
//   - Answers a review question
//
// We store that decision in user_patterns.
// Next time a similar transaction arrives, Brain matches the pattern
// and pre-fills the classification with a confidence boost.
//
// This is the foundation that makes LedgiProof smarter over time.

import { db, getCurrentUserId } from '../lib/supabase'
import type { Transaction } from '../types/database.types'

// ── Pattern matching helpers ─────────────────────────────────────────────────

// Normalize a merchant name for pattern matching
function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')   // remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

// Extract keywords from description
function extractKeywords(description: string): string[] {
  const stop = new Set(['the','a','an','and','or','in','on','at','to','for','of','with','by'])
  return description.toLowerCase()
    .split(/[\s\-_,./]+/)
    .filter(w => w.length > 2 && !stop.has(w))
    .slice(0, 3)
}

// ── Learn from account assignment ────────────────────────────────────────────
// Called after AccountAssignment posts a journal entry.
// Records: merchant keyword → debit account + credit account

export async function learnFromJournalEntry(input: {
  orgId:          string
  transaction:    Transaction
  debitAccountId: string
  creditAccountId: string
}): Promise<void> {
  const { orgId, transaction: tx, debitAccountId, creditAccountId } = input
  if (!tx.description) return

  const actorId = await getCurrentUserId()
  if (!actorId) return   // no authenticated user — nothing to attribute the pattern to

  const keyword       = normalizeMerchant(tx.description)
  const keywords      = extractKeywords(tx.description)
  const primaryKw     = keywords[0] ?? keyword.slice(0, 50)

  // Check if pattern already exists for this keyword + account combo
  const { data: existing } = await db
    .from('user_patterns')
    .select('id, match_count, confidence_boost')
    .eq('org_id', orgId)
    .eq('keyword', primaryKw)
    .eq('account_id', debitAccountId)
    .single()

  if (existing) {
    // Reinforce existing pattern — increase match count and confidence.
    // (last_seen_at isn't a real column — updated_at is auto-stamped by
    // trg_user_patterns_updated_at and already covers "last touched".)
    const newBoost = Math.min((existing.confidence_boost ?? 20) + 5, 50)
    const { error } = await db.from('user_patterns').update({
      match_count:      (existing.match_count ?? 1) + 1,
      confidence_boost: newBoost
    }).eq('id', existing.id)
    if (error) console.warn('[learning] Failed to reinforce pattern (non-fatal):', error.message)
  } else {
    // Create new pattern
    const { error } = await db.from('user_patterns').insert({
      org_id:           orgId,
      created_by:       actorId,
      keyword:          primaryKw,
      merchant_name:    keyword.slice(0, 200),
      account_id:       debitAccountId,
      category:         'learned',
      confidence_boost: 20,
      match_count:      1
    }).select().single()
    if (error) console.warn('[learning] Failed to create pattern (non-fatal):', error.message)
  }
}

// ── Learn from review answer ──────────────────────────────────────────────────
// Called when bookkeeper confirms or rejects a transaction review.

export async function learnFromReviewAnswer(input: {
  orgId:        string
  transaction:  Transaction
  answer:       'personal' | 'business' | 'split'
  accountId?:   string
}): Promise<void> {
  const { orgId, transaction: tx, answer, accountId } = input
  if (!tx.description) return

  const actorId = await getCurrentUserId()
  if (!actorId) return

  const keyword = normalizeMerchant(tx.description)

  const { data: existing } = await db
    .from('user_patterns')
    .select('id, match_count, confidence_boost')
    .eq('org_id', orgId)
    .eq('keyword', keyword.slice(0, 50))
    .eq('review_answer', answer)
    .single()

  if (existing) {
    const { error } = await db.from('user_patterns').update({
      match_count:      (existing.match_count ?? 1) + 1,
      confidence_boost: Math.min((existing.confidence_boost ?? 20) + 3, 50)
    }).eq('id', existing.id)
    if (error) console.warn('[learning] Failed to reinforce pattern (non-fatal):', error.message)
  } else {
    const { error } = await db.from('user_patterns').insert({
      org_id:           orgId,
      created_by:       actorId,
      keyword:          keyword.slice(0, 50),
      merchant_name:    keyword.slice(0, 200),
      review_answer:    answer,
      account_id:       accountId ?? null,
      category:         answer === 'business' ? 'Business expense' : 'Personal expense',
      confidence_boost: 15,
      match_count:      1
    })
    if (error) console.warn('[learning] Failed to create pattern (non-fatal):', error.message)
  }
}

// ── Learn merchant → vendor (payee) ───────────────────────────────────────────
// Called when a human confirms which vendor a merchant maps to (once).
// Next time a similar transaction arrives, lookupPattern returns the vendorId
// so the ingest flow can auto-assign transactions.vendor_id. This is the core
// of the 1099 merchant→vendor normalization.

export async function learnVendorPattern(input: {
  orgId:       string
  transaction: Transaction
  vendorId:    string
}): Promise<void> {
  const { orgId, transaction: tx, vendorId } = input
  const src = tx.merchant_name ?? tx.description
  if (!src) return

  const actorId = await getCurrentUserId()
  if (!actorId) return

  const keyword   = normalizeMerchant(src)
  const primaryKw = extractKeywords(src)[0] ?? keyword.slice(0, 50)

  const { data: existing } = await db
    .from('user_patterns')
    .select('id, match_count, confidence_boost')
    .eq('org_id', orgId)
    .eq('keyword', primaryKw)
    .eq('vendor_id', vendorId)
    .maybeSingle()

  if (existing) {
    const { error } = await db.from('user_patterns').update({
      match_count:      (existing.match_count ?? 1) + 1,
      confidence_boost: Math.min((existing.confidence_boost ?? 20) + 5, 50)
    }).eq('id', existing.id)
    if (error) console.warn('[learning] Failed to reinforce vendor pattern (non-fatal):', error.message)
  } else {
    const { error } = await db.from('user_patterns').insert({
      org_id:           orgId,
      created_by:       actorId,
      keyword:          primaryKw,
      merchant_name:    keyword.slice(0, 200),
      vendor_id:        vendorId,
      category:         'vendor-map',
      confidence_boost: 25,
      match_count:      1
    })
    if (error) console.warn('[learning] Failed to create vendor pattern (non-fatal):', error.message)
  }
}

// ── Look up learned patterns for a transaction ────────────────────────────────
// Called by Brain BEFORE rules evaluation.
// Returns the best matching pattern if found.

export async function lookupPattern(input: {
  orgId:       string
  description: string
  amount?:     number
}): Promise<{
  accountId?:    string
  vendorId?:     string
  reviewAnswer?: string
  category?:     string
  boost:         number
} | null> {
  if (!input.description) return null

  const keyword  = normalizeMerchant(input.description)
  const keywords = extractKeywords(input.description)

  // Try exact keyword match first, then partial
  const queries = [
    ...keywords.map(k => `keyword.ilike.%${k}%`),
    `merchant_name.ilike.%${keyword.slice(0, 30)}%`
  ]

  const { data: patterns } = await db
    .from('user_patterns')
    .select('*')
    .eq('org_id', input.orgId)
    .or(queries.join(','))
    .order('match_count', { ascending: false })
    .limit(1)

  if (!patterns?.length) return null

  const p = patterns[0]
  if (!p) return null
  return {
    ...(p.account_id     != null ? { accountId:    p.account_id }     : {}),
    ...(p.vendor_id      != null ? { vendorId:     p.vendor_id }      : {}),
    ...(p.review_answer  != null ? { reviewAnswer: p.review_answer }  : {}),
    ...(p.category       != null ? { category:     p.category }      : {}),
    boost: p.confidence_boost ?? 15
  }
}

// ── AI-powered transaction categorization ────────────────────────────────────
// Uses Anthropic API to suggest category + account when patterns don't match.
// Non-blocking — called in background after transaction creation.

export async function aiCategorizeSuggestion(input: {
  description: string
  amount:      number
  date:        string
  orgId:       string
}): Promise<{
  category:    string
  accountCode: string
  reason:      string
} | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: `You are an expert accounting AI. Categorize this transaction and suggest the best US GAAP account code.
Available codes: 1020 Checking, 4010 Service Revenue, 4020 Product Sales, 5000 COGS, 6010 Payroll, 6020 Rent, 6030 Utilities, 6040 Office Supplies, 6050 Advertising, 6060 Professional Services, 6070 Insurance, 6090 Bank Fees, 6100 Meals, 6110 Travel, 6120 Software/Subscriptions, 6130 Taxes.
Respond with ONLY valid JSON: {"category": "string", "account_code": "string", "reason": "string (max 10 words)"}`,
        messages: [{
          role: 'user',
          content: `Transaction: "${input.description}" Amount: $${Math.abs(input.amount)} Date: ${input.date}`
        }]
      })
    })
    const data = await res.json()
    const text = data.content?.[0]?.text?.trim() ?? '{}'
    const parsed = JSON.parse(text.replace(/```json|```/g, ''))
    return {
      category:    parsed.category    ?? 'Uncategorized',
      accountCode: parsed.account_code ?? '6999',
      reason:      parsed.reason      ?? 'AI suggestion'
    }
  } catch {
    return null
  }
}