// PATH: src/services/document-requests.service.ts
// Solicitudes — staff asks a client for a specific document; the client
// fulfills it by uploading (reusing uploadDocument from upload.service.ts),
// then staff reviews it. Status: pending → uploaded → approved | rejected.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'

export interface DocumentRequest {
  id:              string
  org_id:          string
  client_id:       string
  conversation_id: string | null
  requested_by:    string
  title:           string
  description:     string | null
  is_sensitive:    boolean
  due_at:          string | null
  status:          'pending' | 'uploaded' | 'approved' | 'rejected'
  document_id:     string | null
  reviewed_by:     string | null
  reviewed_at:     string | null
  created_at:      string
  updated_at:      string
}

export async function listDocumentRequests(orgId: string, clientId: string): Promise<DocumentRequest[]> {
  const { data, error } = await db
    .from('document_requests')
    .select('*')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as DocumentRequest[]
}

export interface CreateDocumentRequestInput {
  orgId:           string
  clientId:        string
  title:           string
  description?:    string
  dueAt?:          string
  isSensitive?:    boolean
  conversationId?: string
}

export async function createDocumentRequest(input: CreateDocumentRequestInput): Promise<{ request_id: string }> {
  const args = pruneRpcArgs({
    p_org_id:          input.orgId,
    p_client_id:       input.clientId,
    p_title:           input.title,
    p_description:     input.description,
    p_due_at:          input.dueAt,
    p_is_sensitive:    input.isSensitive ?? false,
    p_conversation_id: input.conversationId,
  })
  const { data, error } = await db.rpc('create_document_request', args)
  if (error) throw new Error(error.message)
  return data as unknown as { request_id: string }
}

export async function fulfillDocumentRequest(requestId: string, documentId: string): Promise<void> {
  const { error } = await db.rpc('fulfill_document_request', {
    p_request_id: requestId,
    p_document_id: documentId,
  })
  if (error) throw new Error(error.message)
}

export async function reviewDocumentRequest(requestId: string, approve: boolean): Promise<void> {
  const { error } = await db.rpc('review_document_request', {
    p_request_id: requestId,
    p_approve: approve,
  })
  if (error) throw new Error(error.message)
}
