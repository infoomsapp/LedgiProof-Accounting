// PATH: src/types/reviews.ts
//
// Types for the transaction review workflow.
// Mirrors the open_review_with_message RPC contract.
//
// If your DB enum values differ from these literals, edit ONLY this file —
// every consumer reads from here.

// ── Question type ────────────────────────────────────────────────────────────
// Categories of "formal inquiry" a bookkeeper can open on a transaction.
export type ReviewQuestionType =
  | 'personal_vs_business'   // "Was this for personal or business use?"
  | 'missing_receipt'         // "Can you send me the receipt?"
  | 'category'                // "What category should this go under?"
  | 'amount_discrepancy'      // "Why is the amount different from expected?"
  | 'merchant_unknown'        // "Who is this merchant? I don't recognize it."
  | 'other'                   // Free-form question

// ── Question metadata for UI ────────────────────────────────────────────────
export interface ReviewQuestionTypeConfig {
  key:          ReviewQuestionType
  label:        string
  description:  string
  icon:         string
  defaultBody:  string         // suggested message body
}

export const REVIEW_QUESTION_TYPES: ReviewQuestionTypeConfig[] = [
  {
    key:         'personal_vs_business',
    label:       'Personal vs Business',
    description: 'Verify if this expense is for business or personal use.',
    icon:        '💼',
    defaultBody:
      'Hi! 👋 I noticed this transaction and want to confirm — was this purchase for business or personal use? '+
      'If it was for business, please share a quick note about the purpose (e.g., client meeting, supplies, travel).'
  },
  {
    key:         'missing_receipt',
    label:       'Missing receipt',
    description: 'Request a receipt or invoice for this transaction.',
    icon:        '🧾',
    defaultBody:
      'Hi! Could you please send me the receipt or invoice for this transaction? '+
      'You can upload it directly through the chat or your portal.'
  },
  {
    key:         'category',
    label:       'Category question',
    description: 'Ask the client to help categorize this expense.',
    icon:        '🏷️',
    defaultBody:
      'Hi! I\'m categorizing your expenses for this period. '+
      'Could you tell me what this transaction was for? It will help me classify it correctly.'
  },
  {
    key:         'amount_discrepancy',
    label:       'Amount discrepancy',
    description: 'Question about the amount of the transaction.',
    icon:        '⚠️',
    defaultBody:
      'Hi! The amount on this transaction looks different from what I expected. '+
      'Could you confirm the correct amount, and let me know if there were any adjustments?'
  },
  {
    key:         'merchant_unknown',
    label:       'Unknown merchant',
    description: 'You don\'t recognize the merchant — ask the client to identify.',
    icon:        '❓',
    defaultBody:
      'Hi! I see a charge from a merchant I don\'t recognize. '+
      'Could you tell me what this purchase was for, and confirm it was authorized?'
  },
  {
    key:         'other',
    label:       'Other question',
    description: 'Custom inquiry not covered by the categories above.',
    icon:        '💬',
    defaultBody: ''
  }
]

// ── Review status (matches v25 conversation_status, but for reviews) ─────────
export type ReviewStatus = 'open' | 'awaiting_response' | 'resolved' | 'expired'

// ── Result of opening a review ───────────────────────────────────────────────
export interface OpenReviewResult {
  review_id:        string
  conversation_id:  string
  message_id:       string
}

// ── Helper: default expiration ──────────────────────────────────────────────
export const REVIEW_EXPIRY_OPTIONS = [
  { hours: 24,  label: '24 hours (urgent)' },
  { hours: 48,  label: '48 hours' },
  { hours: 72,  label: '72 hours (recommended)' },
  { hours: 168, label: '1 week' }
] as const

export const DEFAULT_REVIEW_EXPIRY_HOURS = 72