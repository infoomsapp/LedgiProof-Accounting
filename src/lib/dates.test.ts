import { describe, it, expect } from 'vitest'
import { toDate, formatDateShort } from './dates'

describe('date-only strings are calendar days', () => {
  it('reads YYYY-MM-DD as the local day, not midnight UTC', () => {
    const d = toDate('2026-08-31')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 31])
    expect(formatDateShort('2026-08-31')).toBe('Aug 31, 2026')
  })
  it('keeps timestamps as instants', () => {
    expect(toDate('2026-08-31T12:00:00Z').toISOString()).toBe('2026-08-31T12:00:00.000Z')
  })
})
