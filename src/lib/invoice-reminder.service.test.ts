// The reminder policy the web and the mobile app both edit: what is sent to the
// database must be what the database accepts, and the sentence shown to the
// user must say what will actually happen.

import { describe, it, expect } from 'vitest'
import { normalizeOverdueDays, summarizePolicy, DEFAULT_REMINDER_POLICY } from '../services/invoice-reminder.service'

describe('normalizeOverdueDays', () => {
  it('sorts, dedupes, keeps 1-90, caps at six', () => {
    expect(normalizeOverdueDays([14, 3, 7, 3])).toEqual([3, 7, 14])
    expect(normalizeOverdueDays([0, -2, 91, 5, 2.5])).toEqual([5])
    expect(normalizeOverdueDays([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 2, 3, 4, 5, 6])
    expect(normalizeOverdueDays([])).toEqual([])
  })
})

describe('summarizePolicy', () => {
  it('reads as a sentence', () => {
    expect(summarizePolicy(DEFAULT_REMINDER_POLICY))
      .toBe('3 days before it is due, on the due date, and 3, 7 and 14 days after.')
    expect(summarizePolicy({ enabled: true, days_before: 1, on_due: false, overdue_days: [7] }))
      .toBe('1 day before it is due, and 7 days after.')
    expect(summarizePolicy({ enabled: true, days_before: 0, on_due: true, overdue_days: [] }))
      .toBe('On the due date.')
    expect(summarizePolicy({ enabled: true, days_before: 0, on_due: false, overdue_days: [] }))
      .toBe('No reminders selected.')
  })
})
