// PATH: src/services/chat-tx.service.ts
//
// Wrappers around v28 RPCs for the per-transaction chat:
//   - open_or_get_transaction_conversation
//   - send_transaction_message              (v28)
//   - mark_transaction_messages_read        (v28)
//   - get_transaction_messages              (v28)
//   - open_review_with_message              (existing, for question workflow)
//
// All writes flow through SECURITY DEFINER RPCs. No direct INSERTs.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import type { ReviewQuestionType } from '../types/reviews'
import { dbError } from '../lib/errors'

// ── Shared types (kept compatible with workspace-chat.service.ts) ───────────

export type MessageSenderRole = 'bookkeeper' | 'client' | 'system'
export type MessageKind       = 'in' | 'out' | 'system' | 'ai'
export type MessageChannel    = 'chat' | 'sms' | 'email'

export interface TransactionMessage {
  id:                  string
  conversation_id:     string
  transaction_id:      string
  sender_id:           string | null
  sender_role:         MessageSenderRole
  body:                string | null
  document_id:         string | null
  channels:            MessageChannel[]
  message_kind:        MessageKind
  event_type:          string | null
  ai_generated:        boolean
  client_visible:      boolean
  read_by_bookkeeper:  boolean
  read_by_client:      boolean
  read_at:             string | null
  created_at:          string
  sender_name:         string | null
  sender_lp_code:      string | null
}

export interface TransactionMessagesResponse {
  conversation_id: string
  transaction_id:  string
  status:          string         // 'open' | 'closed' | 'resolved' | ...
  has_more:        boolean
  oldest_at:       string | null
  role:            'bookkeeper' | 'client'
  messages:        TransactionMessage[]
}

export interface SendMessageResult {
  message_id:       string
  conversation_id:  string
  sender_role:      MessageSenderRole
  message_kind:     MessageKind
  client_visible:   boolean
}

// ── RPC: open_or_get_transaction_conversation ──────────────────────────────
// Returns a conversation_id for the given transaction. Creates if doesn't exist.

export async function openOrGetTransactionConversation(
  transactionId: string,
  reviewId?:     string | null
): Promise<string> {
  const { data, error } = await db.rpc(
    'open_or_get_transaction_conversation',
    pruneRpcArgs({
      p_transaction_id: transactionId,
      p_review_id:      reviewId ?? undefined
    })
  )
  if (error) throw dbError(error, 'Failed to open the conversation')
  return data as string   // returns UUID
}

// ── RPC: send_transaction_message (v28) ─────────────────────────────────────

export async function sendTransactionMessage(input: {
  conversationId:  string
  body?:           string
  channels?:       MessageChannel[]
  documentId?:     string
  messageKind?:    MessageKind
  clientVisible?:  boolean
}): Promise<SendMessageResult> {
  const { data, error } = await db.rpc('send_transaction_message', pruneRpcArgs({
    p_conversation_id: input.conversationId,
    p_body:            input.body          ?? undefined,
    p_channels:        input.channels      ?? ['chat'],
    p_document_id:     input.documentId    ?? undefined,
    p_message_kind:    input.messageKind   ?? undefined,    // undefined lets RPC infer
    p_client_visible:  input.clientVisible ?? true
  }))
  if (error) throw dbError(error, 'Failed to send the message')
  return data as unknown as SendMessageResult
}

// ── RPC: mark_transaction_messages_read (v28) ──────────────────────────────

export async function markTransactionMessagesRead(
  conversationId: string
): Promise<{ conversation_id: string; marked_read: number; as_role: string }> {
  const { data, error } = await db.rpc('mark_transaction_messages_read', {
    p_conversation_id: conversationId
  })
  if (error) throw dbError(error, 'Failed to mark messages as read')
  return data as unknown as { conversation_id: string; marked_read: number; as_role: string }
}

// ── RPC: get_transaction_messages (v28) ─────────────────────────────────────

export async function getTransactionMessages(
  conversationId: string,
  limit  = 50,
  before?: string | null
): Promise<TransactionMessagesResponse> {
  const { data, error } = await db.rpc('get_transaction_messages', pruneRpcArgs({
    p_conversation_id: conversationId,
    p_limit:           Math.min(Math.max(limit, 1), 200),
    p_before:          before ?? undefined
  }))
  if (error) throw dbError(error, 'Failed to load messages')
  return data as unknown as TransactionMessagesResponse
}

// ── RPC: open_review_with_message (existing) ───────────────────────────────
// Opens a formal review AND sends the first question in one call.
// Use when the bookkeeper is making an inquiry that needs a deadline.

export async function openReviewWithMessage(input: {
  transactionId:   string
  orgId:           string
  question:        string
  questionType?:   ReviewQuestionType
  assignedTo?:     string         // user_id of the client to ask
  /**
   * Kept for API compatibility only — the RPC now requires this to match
   * the authenticated caller (or be omitted) and no longer lets a caller
   * attribute the review to anyone else. See migration
   * fix_open_review_with_message_auth.
   */
  openedBy?:       string
  expiresHours?:   number         // default 72
}): Promise<{ review_id: string }> {
  const { data, error } = await db.rpc('open_review_with_message', pruneRpcArgs({
    p_transaction_id: input.transactionId,
    p_org_id:         input.orgId,
    p_question:       input.question,
    p_question_type:  input.questionType ?? 'personal_vs_business',
    p_assigned_to:    input.assignedTo   ?? undefined,
    p_opened_by:      input.openedBy     ?? undefined,
    p_expires_hours:  input.expiresHours ?? 72
  }))
  if (error) throw dbError(error, 'Failed to open the review')
  // RPC returns just the review_id (uuid). The old declared return type
  // (conversation_id/message_id) was never actually produced by the RPC.
  return { review_id: data as unknown as string }
}
