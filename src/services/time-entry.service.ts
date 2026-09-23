// PATH: src/services/time-entry.service.ts
//
// Time tracking — Entrepreneur/Bookkeeper/Accountant plan feature.
//
// The #1 gap the competitive audit surfaced: FreshBooks and Xero both ship
// a timer on every plan; LedgiProof had none. A running timer is just a
// row with started_at set and ended_at/duration_minutes null — stopping it
// computes and stores the duration so later queries never have to derive
// elapsed time from "now," which would make the numbers keep moving after
// the fact for anything already saved.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'
import type { TimeEntry, InsertTimeEntry } from '../types/database.types'

export type { TimeEntry }

export interface StartTimerInput {
  orgId:       string
  userId:      string
  clientId?:   string | null
  description?: string | null
  hourlyRate?: number
}

export interface AddManualEntryInput {
  orgId:       string
  userId:      string
  clientId?:   string | null
  description?: string | null
  date:        string   // ISO 'YYYY-MM-DD'
  minutes:     number
  hourlyRate?: number
  isBillable?: boolean
}

/** Starts a running timer. Only one running timer per user is meaningful --
 *  callers should stop (or check for) an existing one first; this doesn't
 *  enforce it server-side since a user working across two browser tabs is
 *  a real, harmless case, not a bug. */
export async function startTimer(input: StartTimerInput): Promise<TimeEntry> {
  const payload: InsertTimeEntry = {
    org_id:      input.orgId,
    user_id:     input.userId,
    client_id:   input.clientId ?? null,
    description: input.description ?? null,
    started_at:  new Date().toISOString(),
    hourly_rate: input.hourlyRate ?? 0
  }
  const { data, error } = await db.from('time_entries').insert(payload).select().single()
  if (error) throw dbError(error, 'Failed to start the timer')
  return data
}

/** Stops a running timer, computing and storing its duration. */
export async function stopTimer(id: string): Promise<TimeEntry> {
  const { data: entry, error: fetchErr } = await db.from('time_entries').select('started_at').eq('id', id).single()
  if (fetchErr) throw dbError(fetchErr, 'Failed to load the timer')
  if (!entry.started_at) throw new Error('This entry was never started as a timer.')

  const minutes = Math.max(1, Math.round((Date.now() - new Date(entry.started_at).getTime()) / 60000))

  const { data, error } = await db
    .from('time_entries')
    .update({ ended_at: new Date().toISOString(), duration_minutes: minutes })
    .eq('id', id)
    .select()
    .single()
  if (error) throw dbError(error, 'Failed to stop the timer')
  return data
}

/** The caller's own currently-running timer for this org, if any. */
export async function getRunningTimer(orgId: string, userId: string): Promise<TimeEntry | null> {
  const { data, error } = await db
    .from('time_entries')
    .select('*')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .is('ended_at', null)
    .not('started_at', 'is', null)
    .maybeSingle()
  if (error) throw dbError(error, 'Failed to check for a running timer')
  return data
}

export async function addManualEntry(input: AddManualEntryInput): Promise<TimeEntry> {
  const payload: InsertTimeEntry = {
    org_id:           input.orgId,
    user_id:          input.userId,
    client_id:        input.clientId ?? null,
    description:      input.description ?? null,
    entry_date:       input.date,
    duration_minutes: input.minutes,
    hourly_rate:      input.hourlyRate ?? 0,
    is_billable:      input.isBillable ?? true
  }
  const { data, error } = await db.from('time_entries').insert(payload).select().single()
  if (error) throw dbError(error, 'Failed to save the time entry')
  return data
}

export interface ListTimeEntriesOptions {
  clientId?:   string | null
  unbilledOnly?: boolean
}

export async function listTimeEntries(
  orgId: string,
  opts: ListTimeEntriesOptions = {}
): Promise<TimeEntry[]> {
  let q = db.from('time_entries').select('*').eq('org_id', orgId)
  if (opts.clientId !== undefined) {
    q = opts.clientId === null ? q.is('client_id', null) : q.eq('client_id', opts.clientId)
  }
  if (opts.unbilledOnly) q = q.is('invoice_id', null).eq('is_billable', true).not('ended_at', 'is', null)
  const { data, error } = await q.order('entry_date', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw dbError(error, 'Failed to load time entries')
  return data ?? []
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const { error } = await db.from('time_entries').delete().eq('id', id)
  if (error) throw dbError(error, 'Failed to delete the time entry')
}

/** Marks a batch of entries as billed once their hours have been pulled into an invoice. */
export async function markEntriesBilled(ids: string[], invoiceId: string): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db.from('time_entries').update({ invoice_id: invoiceId }).in('id', ids)
  if (error) throw dbError(error, 'Failed to mark time entries as billed')
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function durationToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}
