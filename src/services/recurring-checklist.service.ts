// PATH: src/services/recurring-checklist.service.ts
//
// Recurring monthly close checklist -- the competitive-audit gap where
// neither QuickBooks nor Xero do this natively (Karbon/Canopy/Financial
// Cents exist as a separate paid category, $59-89/user/mo, bolted on top
// of them). Structurally mirrors recurring-invoice.service.ts exactly: a
// schedule/template (recurring_checklists + recurring_checklist_items) that
// generates real instances (checklist_runs + checklist_run_items) on a
// cadence, via a daily cron (cron_generate_all_recurring_checklists) and
// an on-demand "Generate now" RPC (generate_due_recurring_checklists).

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'
import type {
  RecurringChecklist, RecurringChecklistItem, ChecklistRun, ChecklistRunItem
} from '../types/database.types'

export type { RecurringChecklist, RecurringChecklistItem, ChecklistRun, ChecklistRunItem }
export type ChecklistFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
export type ChecklistStatus    = 'active' | 'paused' | 'ended'

export interface RecurringChecklistWithClient extends RecurringChecklist {
  clients?: { display_name: string } | null
}

export type ChecklistItemDraft = Pick<RecurringChecklistItem, 'title' | 'description'>

// ── Templates (the recurring schedule) ───────────────────────────────────────

export async function getRecurringChecklists(orgId: string): Promise<RecurringChecklistWithClient[]> {
  const { data, error } = await db
    .from('recurring_checklists')
    .select('*, clients(display_name)')
    .eq('org_id', orgId)
    .order('next_run_date')
  if (error) throw dbError(error, 'Failed to load recurring checklists')
  return (data ?? []) as unknown as RecurringChecklistWithClient[]
}

export async function getRecurringChecklistItems(recurringId: string): Promise<RecurringChecklistItem[]> {
  const { data, error } = await db
    .from('recurring_checklist_items')
    .select('*')
    .eq('recurring_id', recurringId)
    .order('sort_order')
  if (error) throw dbError(error, 'Failed to load the checklist steps')
  return data ?? []
}

export interface RecurringChecklistInput {
  orgId:     string
  clientId?: string | null
  userId:    string
  title:     string
  frequency: ChecklistFrequency
  startDate: string   // also seeds next_run_date
  endDate?:  string | null
  maxOccurrences?: number | null
}

export async function createRecurringChecklist(
  input: RecurringChecklistInput,
  steps: ChecklistItemDraft[]
): Promise<RecurringChecklist> {
  const { data, error } = await db.from('recurring_checklists').insert({
    org_id:          input.orgId,
    client_id:       input.clientId ?? null,
    created_by:      input.userId,
    title:           input.title,
    frequency:       input.frequency,
    next_run_date:   input.startDate,
    end_date:        input.endDate ?? null,
    max_occurrences: input.maxOccurrences ?? null
  }).select().single()
  if (error) throw dbError(error, 'Failed to create the recurring checklist')

  const rec = data as RecurringChecklist
  await replaceRecurringChecklistItems(rec.id, input.orgId, steps)
  return rec
}

export async function replaceRecurringChecklistItems(
  recurringId: string,
  orgId:       string,
  steps:       ChecklistItemDraft[]
): Promise<void> {
  await db.from('recurring_checklist_items').delete().eq('recurring_id', recurringId)
  if (steps.length === 0) return
  const rows = steps.map((s, i) => ({
    recurring_id: recurringId,
    org_id:       orgId,
    sort_order:   i,
    title:        s.title,
    description:  s.description
  }))
  const { error } = await db.from('recurring_checklist_items').insert(rows)
  if (error) throw dbError(error, 'Failed to save the checklist steps')
}

export async function setRecurringChecklistStatus(id: string, status: ChecklistStatus): Promise<void> {
  const { error } = await db.from('recurring_checklists')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw dbError(error, 'Failed to update the checklist status')
}

export async function deleteRecurringChecklist(id: string): Promise<void> {
  const { error } = await db.from('recurring_checklists').delete().eq('id', id)
  if (error) throw dbError(error, 'Failed to delete the recurring checklist')
}

/** Runs the due-now generator for this org (the "Generate now" button). */
export async function generateDueRecurringChecklists(orgId: string): Promise<number> {
  const { data, error } = await db.rpc('generate_due_recurring_checklists', { p_org_id: orgId })
  if (error) throw dbError(error, 'Failed to generate the due checklists')
  const res = data as unknown as { generated?: number; error?: string }
  if (res?.error) throw new Error(res.error)
  return res?.generated ?? 0
}

export const CHECKLIST_FREQUENCY_LABELS: Record<ChecklistFrequency, string> = {
  weekly:    'Weekly',
  biweekly:  'Every 2 weeks',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  yearly:    'Yearly'
}

// ── Runs (the generated instances a firm actually works through) ────────────

export interface ChecklistRunWithClient extends ChecklistRun {
  clients?: { display_name: string } | null
}

export async function listChecklistRuns(
  orgId: string,
  opts: { clientId?: string | null; status?: 'open' | 'completed' } = {}
): Promise<ChecklistRunWithClient[]> {
  let q = db.from('checklist_runs').select('*, clients(display_name)').eq('org_id', orgId)
  if (opts.clientId !== undefined) {
    q = opts.clientId === null ? q.is('client_id', null) : q.eq('client_id', opts.clientId)
  }
  if (opts.status) q = q.eq('status', opts.status)
  const { data, error } = await q.order('run_date', { ascending: false })
  if (error) throw dbError(error, 'Failed to load checklist runs')
  return (data ?? []) as unknown as ChecklistRunWithClient[]
}

export async function getChecklistRunItems(runId: string): Promise<ChecklistRunItem[]> {
  const { data, error } = await db
    .from('checklist_run_items')
    .select('*')
    .eq('run_id', runId)
    .order('sort_order')
  if (error) throw dbError(error, 'Failed to load the checklist tasks')
  return data ?? []
}

/** One-off checklist run not tied to any recurring schedule (e.g. a single client onboarding). */
export async function createChecklistRun(
  orgId: string, userId: string, title: string, runDate: string,
  steps: ChecklistItemDraft[], clientId?: string | null
): Promise<ChecklistRun> {
  const { data, error } = await db.from('checklist_runs').insert({
    org_id: orgId, client_id: clientId ?? null, created_by: userId, title, run_date: runDate
  }).select().single()
  if (error) throw dbError(error, 'Failed to create the checklist')

  const run = data as ChecklistRun
  if (steps.length > 0) {
    const rows = steps.map((s, i) => ({
      run_id: run.id, org_id: orgId, sort_order: i, title: s.title, description: s.description
    }))
    const { error: itemsErr } = await db.from('checklist_run_items').insert(rows)
    if (itemsErr) throw dbError(itemsErr, 'Failed to save the checklist tasks')
  }
  return run
}

export async function toggleChecklistItem(itemId: string, completedBy: string | null): Promise<ChecklistRunItem> {
  const { data, error } = await db.from('checklist_run_items')
    .update(completedBy ? { completed_at: new Date().toISOString(), completed_by: completedBy } : { completed_at: null, completed_by: null })
    .eq('id', itemId)
    .select()
    .single()
  if (error) throw dbError(error, 'Failed to update the task')
  return data
}

export async function completeChecklistRun(runId: string): Promise<void> {
  const { error } = await db.from('checklist_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) throw dbError(error, 'Failed to complete the checklist')
}

export async function deleteChecklistRun(runId: string): Promise<void> {
  const { error } = await db.from('checklist_runs').delete().eq('id', runId)
  if (error) throw dbError(error, 'Failed to delete the checklist')
}
