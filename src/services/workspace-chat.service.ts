// PATH: src/services/workspace-chat.service.ts
// Wrappers around v25 RPCs for workspace-level chat (bookkeeper ↔ pyme_client).
// This is SEPARATE from transaction_messages (the per-tx chat).

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import type { Json } from '../types/database.types'
import { dbError } from '../lib/errors'

// ── Types ────────────────────────────────────────────────────────────────────

export type MessageSenderRole = 'bookkeeper' | 'client' | 'system'
export type MessageKind       = 'in' | 'out' | 'system' | 'ai'

export type ContextRefType = 'transaction' | 'account' | 'period'

export interface ContextRef {
  type:      ContextRefType
  id:        string
  label:     string
  client_id: string
}

export interface WorkspaceConversation {
  id:                          string
  org_id:                      string
  client_id:                   string
  client_name:                 string
  client_email:                string | null
  last_message_at:             string | null
  last_message_preview:        string | null
  last_message_sender_role:    MessageSenderRole | null
  last_message_kind:           MessageKind | null
  my_unread_count:             number
  is_archived:                 boolean
  archived_at:                 string | null
  archived_by_role:            MessageSenderRole | null
  created_at:                  string
}

export interface WorkspaceInboxResponse {
  org_id:        string
  archived:      boolean
  role:          'bookkeeper' | 'client'
  total:         number
  unread_total:  number
  conversations: WorkspaceConversation[]
}

export interface WorkspaceMessage {
  id:                  string
  conversation_id:     string
  sender_id:           string | null
  sender_role:         MessageSenderRole
  body:                string | null
  document_id:         string | null
  channels:            string[]
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
  context_ref:         ContextRef | null
}

export interface WorkspaceMessagesResponse {
  conversation_id: string
  has_more:        boolean
  oldest_at:       string | null
  role:            'bookkeeper' | 'client'
  messages:        WorkspaceMessage[]
}

// ── RPCs ─────────────────────────────────────────────────────────────────────

export async function getWorkspaceInbox(
  orgId:    string,
  archived = false,
  limit    = 50
): Promise<WorkspaceInboxResponse> {
  const { data, error } = await db.rpc('get_workspace_inbox', {
    p_org_id:   orgId,
    p_archived: archived,
    p_limit:    limit
  })
  if (error) throw dbError(error, 'Failed to load the inbox')
  return data as unknown as WorkspaceInboxResponse
}

export async function getWorkspaceMessages(
  conversationId: string,
  limit  = 50,
  before?: string | null
): Promise<WorkspaceMessagesResponse> {
  const { data, error } = await db.rpc('get_workspace_messages', pruneRpcArgs({
    p_conversation_id: conversationId,
    p_limit:           limit,
    p_before:          before ?? undefined
  }))
  if (error) throw dbError(error, 'Failed to load messages')
  return data as unknown as WorkspaceMessagesResponse
}

export interface SendWorkspaceMessageInput {
  orgId:           string
  clientId:        string
  body?:           string
  documentId?:     string
  messageKind?:    MessageKind
  clientVisible?:  boolean
  contextRef?:     ContextRef
}

export async function sendWorkspaceMessage(input: SendWorkspaceMessageInput): Promise<{
  message_id:          string
  conversation_id:     string
  is_new_conversation: boolean
  sender_role:         MessageSenderRole
  client_visible:      boolean
}> {
  // The DB has two overloads that differ only in the presence of p_context_ref (7th param).
  // When p_context_ref is omitted, PostgreSQL cannot choose between them because overload 2
  // matches with p_context_ref defaulting to NULL. Fixing this by always passing p_context_ref
  // (even as null) so the call unambiguously targets overload 2.
  const args = {
    p_org_id:         input.orgId,
    p_client_id:      input.clientId,
    ...(input.body ? { p_body: input.body } : {}),           // omitted when falsy → DB DEFAULT NULL
    ...(input.documentId ? { p_document_id: input.documentId } : {}),  // omitted when absent → DB DEFAULT NULL
    p_message_kind:   input.messageKind   ?? 'in',
    p_client_visible: input.clientVisible ?? true,
    // ContextRef is a plain string-valued interface without a declared index
    // signature, so it isn't nominally a Json (jsonb payload) even though every
    // field it has is jsonb-safe — cast at this RPC boundary, not the type itself.
    p_context_ref:    (input.contextRef as unknown as Json | undefined) ?? null,  // always present → uniquely picks overload 2
  }

  const { data, error } = await db.rpc('send_workspace_message', args)
  if (error) throw dbError(error, 'Failed to send the message')
  return data as unknown as {
    message_id:          string
    conversation_id:     string
    is_new_conversation: boolean
    sender_role:         MessageSenderRole
    client_visible:      boolean
  }
}

export async function markWorkspaceMessagesRead(
  conversationId: string
): Promise<{ conversation_id: string; marked_read: number }> {
  const { data, error } = await db.rpc('mark_workspace_messages_read', {
    p_conversation_id: conversationId
  })
  if (error) throw dbError(error, 'Failed to mark messages as read')
  return data as unknown as { conversation_id: string; marked_read: number }
}

export async function markWorkspaceConversationUnread(
  conversationId: string
): Promise<void> {
  const { error } = await db.rpc('mark_workspace_conversation_unread', {
    p_conversation_id: conversationId
  })
  if (error) throw dbError(error, 'Failed to mark the conversation as unread')
}

export async function archiveWorkspaceConversation(
  conversationId: string
): Promise<void> {
  const { error } = await db.rpc('archive_workspace_conversation', {
    p_conversation_id: conversationId
  })
  if (error) throw dbError(error, 'Failed to archive the conversation')
}

export async function restoreWorkspaceConversation(
  conversationId: string
): Promise<void> {
  const { error } = await db.rpc('restore_workspace_conversation', {
    p_conversation_id: conversationId
  })
  if (error) throw dbError(error, 'Failed to restore the conversation')
}