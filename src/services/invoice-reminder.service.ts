// PATH: src/services/invoice-reminder.service.ts
//
// Payment-reminder policy: when clients with an unpaid invoice get an email.
// Off until a firm turns it on. The emails themselves are sent by the
// invoice-scheduler edge function (daily, from pg_cron); this file only reads
// and writes the policy, and the write goes through set_invoice_reminder_settings
// so the role and the values are checked in the database.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'

export interface ReminderPolicy {
  enabled:      boolean
  days_before:  number     // 0 = no "coming due" reminder
  on_due:       boolean
  overdue_days: number[]   // days after the due date
}

export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  enabled: false, days_before: 3, on_due: true, overdue_days: [3, 7, 14]
}

export const DAYS_BEFORE_CHOICES = [0, 1, 3, 5, 7]
export const OVERDUE_CHOICES     = [1, 3, 5, 7, 14, 21, 30]

/** Sorted, unique, 1-90, at most six -- exactly what the database accepts. */
export function normalizeOverdueDays(days: number[]): number[] {
  const set = Array.from(new Set(days.filter(d => Number.isInteger(d) && d >= 1 && d <= 90)))
  return set.sort((a, b) => a - b).slice(0, 6)
}

/** "3 days before it is due, on the due date, and 3, 7 and 14 days after." */
export function summarizePolicy(p: ReminderPolicy): string {
  const parts: string[] = []
  if (p.days_before > 0) parts.push(`${p.days_before} day${p.days_before === 1 ? '' : 's'} before it is due`)
  if (p.on_due) parts.push('on the due date')
  const od = normalizeOverdueDays(p.overdue_days)
  if (od.length > 0) {
    const list = od.length === 1 ? `${od[0]}` : `${od.slice(0, -1).join(', ')} and ${od[od.length - 1]}`
    parts.push(`${list} days after`)
  }
  if (parts.length === 0) return 'No reminders selected.'
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  if (parts.length === 1) return `${cap(parts[0]!)}.`
  return `${cap(parts.slice(0, -1).join(', '))}, and ${parts[parts.length - 1]}.`
}

// The generated database types predate these objects, so the client is used untyped
// here (same as exchange-rate.service.ts) until the types are regenerated.
const untyped = db as any

export async function getReminderPolicy(orgId: string): Promise<ReminderPolicy> {
  const { data, error } = await untyped
    .from('invoice_reminder_settings')
    .select('enabled, days_before, on_due, overdue_days')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw dbError(error, 'Failed to load the reminder settings')
  if (!data) return DEFAULT_REMINDER_POLICY
  const row = data as unknown as ReminderPolicy
  return { ...row, overdue_days: normalizeOverdueDays(row.overdue_days ?? []) }
}

export async function saveReminderPolicy(orgId: string, p: ReminderPolicy): Promise<void> {
  const { error } = await untyped.rpc('set_invoice_reminder_settings', {
    p_org_id:       orgId,
    p_enabled:      p.enabled,
    p_days_before:  p.days_before,
    p_on_due:       p.on_due,
    p_overdue_days: normalizeOverdueDays(p.overdue_days)
  })
  if (error) throw dbError(error, 'Failed to save the reminder settings')
}
