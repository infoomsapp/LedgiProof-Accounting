// Who gets a payment reminder today. A wrong answer here either emails a
// client twice, nags them about a long-dead invoice, or never reminds at all.

import { describe, it, expect } from 'vitest'
import {
  daysPastDue, localDate, pickReminder, reminderSubject, wasAutoSent,
  type ReminderSettings,
} from '../../supabase/functions/_shared/invoice-reminder-logic'

const defaults: ReminderSettings = { days_before: 3, on_due: true, overdue_days: [3, 7, 14] }
const none = new Set<string>()

describe('daysPastDue', () => {
  it('is signed: negative before the due date, positive after', () => {
    expect(daysPastDue('2026-10-10', '2026-10-07')).toBe(-3)
    expect(daysPastDue('2026-10-10', '2026-10-10')).toBe(0)
    expect(daysPastDue('2026-10-10', '2026-10-17')).toBe(7)
  })
  it('crosses month and year ends and ignores a time suffix', () => {
    expect(daysPastDue('2026-12-30', '2027-01-02')).toBe(3)
    expect(daysPastDue('2026-10-10T00:00:00+00:00', '2026-10-11')).toBe(1)
  })
})

describe('localDate', () => {
  it('uses the firm calendar day, not UTC', () => {
    // 02:30 UTC on the 10th is still the evening of the 9th in New York.
    expect(localDate(new Date('2026-10-10T02:30:00Z'))).toBe('2026-10-09')
    expect(localDate(new Date('2026-10-10T14:00:00Z'))).toBe('2026-10-10')
  })
})

describe('pickReminder', () => {
  it('sends the coming-due reminder N days out', () => {
    expect(pickReminder(-3, defaults, none)).toEqual({ kind: 'before_due', day_offset: 3 })
  })
  it('stays quiet in between', () => {
    expect(pickReminder(-10, defaults, none)).toBeNull()
    expect(pickReminder(6, defaults, none)).toBeNull()
    expect(pickReminder(20, defaults, none)).toBeNull()
  })
  it('due day, and each overdue milestone', () => {
    expect(pickReminder(0, defaults, none)).toEqual({ kind: 'on_due', day_offset: 0 })
    expect(pickReminder(3, defaults, none)).toEqual({ kind: 'overdue', day_offset: 3 })
    expect(pickReminder(7, defaults, none)).toEqual({ kind: 'overdue', day_offset: 7 })
    expect(pickReminder(14, defaults, none)).toEqual({ kind: 'overdue', day_offset: 14 })
  })
  it('a missed run still sends within the short window, then gives up', () => {
    expect(pickReminder(8, defaults, none)).toEqual({ kind: 'overdue', day_offset: 7 })
    expect(pickReminder(9, defaults, none)).toEqual({ kind: 'overdue', day_offset: 7 })
    expect(pickReminder(10, defaults, none)).toBeNull()
  })
  it('never repeats what the log says was sent', () => {
    const sent = new Set(['overdue:7'])
    expect(pickReminder(7, defaults, sent)).toBeNull()
    expect(pickReminder(8, defaults, sent)).toBeNull()
  })
  it('does not flood: enabling on a very old invoice sends nothing', () => {
    expect(pickReminder(120, defaults, none)).toBeNull()
  })
  it('one email per run when windows overlap: the latest milestone wins', () => {
    const tight: ReminderSettings = { days_before: 1, on_due: true, overdue_days: [1] }
    // -1..1 (before), 0..2 (due), 1..3 (overdue): at day 1 all three qualify.
    expect(pickReminder(1, tight, none)).toEqual({ kind: 'overdue', day_offset: 1 })
    // once that is logged the next run does not send an older one late
    expect(pickReminder(1, tight, new Set(['overdue:1']))).toEqual({ kind: 'on_due', day_offset: 0 })
  })
  it('honours switches', () => {
    expect(pickReminder(-3, { ...defaults, days_before: 0 }, none)).toBeNull()
    expect(pickReminder(0, { ...defaults, on_due: false }, none)).toBeNull()
    expect(pickReminder(7, { ...defaults, overdue_days: [] }, none)).toBeNull()
  })
})

describe('wording', () => {
  it('subjects read naturally', () => {
    expect(reminderSubject('INV-1', 'Acme', 'before_due', -3)).toBe('Reminder: invoice INV-1 is due in 3 days')
    expect(reminderSubject('INV-1', 'Acme', 'before_due', -1)).toBe('Reminder: invoice INV-1 is due tomorrow')
    expect(reminderSubject('INV-1', 'Acme', 'on_due', 0)).toBe('Invoice INV-1 is due today')
    expect(reminderSubject('INV-1', 'Acme', 'overdue', 1)).toBe('Overdue: invoice INV-1 is 1 day past due')
    expect(reminderSubject('INV-1', 'Acme', 'overdue', 8)).toBe('Overdue: invoice INV-1 is 8 days past due')
  })
})

describe('wasAutoSent', () => {
  it('an invoice generated already sent is auto-sent', () => {
    expect(wasAutoSent('2026-10-01T06:00:00.100Z', '2026-10-01T06:00:00.100Z')).toBe(true)
  })
  it('a draft a person sent later is not', () => {
    expect(wasAutoSent('2026-10-01T06:00:00Z', '2026-10-03T15:00:00Z')).toBe(false)
    expect(wasAutoSent('2026-10-01T06:00:00Z', null)).toBe(false)
  })
})
