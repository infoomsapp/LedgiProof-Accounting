// PATH: src/services/member-chat.service.ts
//
// P4 Fase 2.B.2 — Wrappers for v34 member-to-member chat RPCs.
//
// Mirror of workspace-chat.service.ts but for the ISOLATED member chat
// tables (workspace_member_conversations + workspace_member_messages).
//
// Architectural rationale (memoria #18):
//   AL chose isolated tables instead of extending workspace_conversations
//   to guarantee zero regression risk on the existing bookkeeper↔client chat.
//   This service is the only TS surface that talks to those tables.
//
// All RPCs are SECURITY DEFINER with auth.uid() verification, so we don't
// need to pass user_id from the client — it's resolved server-side.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MemberConversationSummary {
  id:                      string
  org_id:                  string
  other_user_id:           string
  other_user_name:         string | null
  other_user_email:        string | null
  last_message_at:         string | null
  last_message_preview:    string | null
  last_message_sender_id:  string | null
  unread_count:            number
  is_archived:             boolean
  created_at:              string
}

export interface MemberInbox {
  viewer:        string | null
  conversations: MemberConversationSummary[]
}

export interface MemberMessage {
  id:           string
  sender_id:    string
  sender_name:  string | null
  body:         string | null
  document_id:  string | null
  created_at:   string
  hash:         string | null
}

// ── openOrGetMemberConversation ─────────────────────────────────────────────

/**
 * Idempotently get-or-create the conversation between auth.uid() and another user.
 *
 * @returns conversation_id (UUID)
 */
export async function openOrGetMemberConversation(
  orgId:       string,
  otherUserId: string
): Promise<string> {
  const { data, error } = await db.rpc('open_or_get_member_conversation', {
    p_org_id:        orgId,
    p_other_user_id: otherUserId
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('RPC returned no conversation_id')
  return data as string
}

// ── getMemberInbox ──────────────────────────────────────────────────────────

export async function getMemberInbox(
  orgId:           string,
  includeArchived = false
): Promise<MemberInbox> {
  const { data, error } = await db.rpc('get_member_inbox', {
    p_org_id:           orgId,
    p_include_archived: includeArchived
  })
  if (error) throw new Error(error.message)

  // Defensive coercion — the RPC returns JSONB which TS sees as `any`
  const result = (data as Partial<MemberInbox> | null) ?? {}
  return {
    viewer:        result.viewer        ?? null,
    conversations: result.conversations ?? []
  }
}

// ── getMemberMessages ───────────────────────────────────────────────────────

export async function getMemberMessages(
  conversationId: string,
  limit          = 50,
  before?:       string
): Promise<MemberMessage[]> {
  const { data, error } = await db.rpc('get_member_messages', pruneRpcArgs({
    p_conversation_id: conversationId,
    p_limit:           limit,
    p_before:          before ?? undefined
  }))
  if (error) throw new Error(error.message)
  return (data as MemberMessage[] | null) ?? []
}

// ── sendMemberMessage ───────────────────────────────────────────────────────

export async function sendMemberMessage(input: {
  conversationId: string
  body?:          string
  documentId?:    string
}): Promise<string> {
  if (!input.body && !input.documentId) {
    throw new Error('Message must have either body or documentId')
  }
  const { data, error } = await db.rpc('send_member_message', pruneRpcArgs({
    p_conversation_id: input.conversationId,
    p_body:            input.body        ?? undefined,
    p_document_id:     input.documentId  ?? undefined
  }))
  if (error) throw new Error(error.message)
  if (!data) throw new Error('RPC returned no message_id')
  return data as string
}

// ── markMemberMessagesRead ──────────────────────────────────────────────────

export async function markMemberMessagesRead(
  conversationId: string
): Promise<number> {
  const { data, error } = await db.rpc('mark_member_messages_read', {
    p_conversation_id: conversationId
  })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

// ── archive / restore ───────────────────────────────────────────────────────

export async function archiveMemberConversation(
  conversationId: string
): Promise<void> {
  const { error } = await db.rpc('archive_member_conversation', {
    p_conversation_id: conversationId
  })
  if (error) throw new Error(error.message)
}

export async function restoreMemberConversation(
  conversationId: string
): Promise<void> {
  const { error } = await db.rpc('restore_member_conversation', {
    p_conversation_id: conversationId
  })
  if (error) throw new Error(error.message)
}