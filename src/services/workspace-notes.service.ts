// PATH: src/services/workspace-notes.service.ts
// Nota Contable — a note attached to a client's workspace, optionally
// requiring a second person's approval (segregation of duties, same idea as
// journal.service.ts's approveManualJournalBatch) and optionally carrying a
// due date that the workspace-note-reminders pg_cron job turns into a real
// notification once it passes.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import type { Json } from '../types/database.types'
import type { ContextRef } from './workspace-chat.service'

export interface WorkspaceNote {
  id:                 string
  org_id:             string
  client_id:          string
  conversation_id:    string | null
  context_ref:        ContextRef | null
  body:               string
  created_by:         string
  requires_approval:  boolean
  approved_by:        string | null
  approved_at:        string | null
  due_at:             string | null
  reminder_sent_at:   string | null
  completed_at:       string | null
  created_at:         string
  updated_at:         string
}

export type WorkspaceNoteStatus = 'approved' | 'done' | 'pending_approval' | 'open'

export function getWorkspaceNoteStatus(note: WorkspaceNote): WorkspaceNoteStatus {
  if (note.approved_at)  return 'approved'
  if (note.completed_at) return 'done'
  if (note.requires_approval) return 'pending_approval'
  return 'open'
}

// Shared status pill styling — single source of truth for both the chat
// tab (WorkspaceNotesTab.tsx) and the firm-wide sidebar page (Notes.tsx),
// so the two surfaces never drift apart on what a status looks like.
export const NOTE_STATUS_STYLE: Record<WorkspaceNoteStatus, { label: string; color: string; bg: string; border: string }> = {
  approved:          { label: '✓ Approved',      color: 'var(--sem-green)', bg: 'var(--sem-green-bg)', border: 'var(--sem-green-border)' },
  done:              { label: '✓ Done',          color: 'var(--sem-green)', bg: 'var(--sem-green-bg)', border: 'var(--sem-green-border)' },
  pending_approval:  { label: 'Pending approval', color: 'var(--sem-amber)', bg: 'var(--sem-amber-bg)', border: 'var(--sem-amber-border)' },
  open:              { label: 'Open',             color: 'var(--lp-text-muted)', bg: 'var(--lp-surface-2)', border: 'var(--lp-border)' },
}

export async function listWorkspaceNotes(orgId: string, clientId: string): Promise<WorkspaceNote[]> {
  const { data, error } = await db
    .from('workspace_notes')
    .select('*')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as WorkspaceNote[]
}

export interface WorkspaceNoteWithClient extends WorkspaceNote {
  clients: { display_name: string | null; company_name: string | null } | null
}

// Firm-wide list across every client — the RLS policy's staff branch has no
// client_id restriction (verified against workspace_notes_select_member),
// so this is a plain scoped select, no new RPC needed. Sorted for a task
// list, not a raw table dump: open notes with a due date soonest-first,
// then everything else newest-first.
export async function listAllWorkspaceNotesForOrg(orgId: string): Promise<WorkspaceNoteWithClient[]> {
  const { data, error } = await db
    .from('workspace_notes')
    .select('*, clients(display_name, company_name)')
    .eq('org_id', orgId)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as WorkspaceNoteWithClient[]

  return rows.sort((a, b) => {
    const aOpenDue = getWorkspaceNoteStatus(a) === 'open' && a.due_at
    const bOpenDue = getWorkspaceNoteStatus(b) === 'open' && b.due_at
    if (aOpenDue && bOpenDue) return new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()
    if (aOpenDue) return -1
    if (bOpenDue) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

export interface CreateWorkspaceNoteInput {
  orgId:            string
  clientId:         string
  body:             string
  requiresApproval?: boolean
  dueAt?:           string
  contextRef?:      ContextRef
  conversationId?:  string
}

export async function createWorkspaceNote(input: CreateWorkspaceNoteInput): Promise<{ note_id: string }> {
  const args = pruneRpcArgs({
    p_org_id:            input.orgId,
    p_client_id:         input.clientId,
    p_body:              input.body,
    p_requires_approval: input.requiresApproval ?? false,
    p_due_at:            input.dueAt,
    p_context_ref:       (input.contextRef as unknown as Json | undefined),
    p_conversation_id:   input.conversationId,
  })
  const { data, error } = await db.rpc('create_workspace_note', args)
  if (error) throw new Error(error.message)
  return data as unknown as { note_id: string }
}

export async function approveWorkspaceNote(noteId: string): Promise<void> {
  const { error } = await db.rpc('approve_workspace_note', { p_note_id: noteId })
  if (error) throw new Error(error.message)
}

export async function completeWorkspaceNote(noteId: string): Promise<void> {
  const { error } = await db.rpc('complete_workspace_note', { p_note_id: noteId })
  if (error) throw new Error(error.message)
}
