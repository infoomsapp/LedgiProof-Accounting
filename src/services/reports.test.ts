import { describe, it, expect } from 'vitest'
import { presetRange, isoDate, formatRange, type Aging } from './reports.service'
import { agingByParty } from '../components/reports/AgingReport'
import { onNormalSide } from '../components/reports/GeneralLedgerReport'

describe('date range presets', () => {
  const today = new Date(2026, 8, 28) // Sep 28, 2026

  it('this / last month', () => {
    expect(presetRange('this_month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetRange('last_month', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('this / last quarter', () => {
    expect(presetRange('this_quarter', today)).toEqual({ from: '2026-07-01', to: '2026-09-30' })
    expect(presetRange('last_quarter', today)).toEqual({ from: '2026-04-01', to: '2026-06-30' })
  })

  it('crosses the year boundary', () => {
    const jan = new Date(2027, 0, 15)
    expect(presetRange('last_month', jan)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(presetRange('last_quarter', jan)).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(presetRange('last_year', jan)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('leap years and local dates', () => {
    expect(presetRange('this_month', new Date(2028, 1, 10))).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('formats a range', () => {
    expect(formatRange('2026-01-01', '2026-03-31')).toBe('Jan 1 – Mar 31, 2026')
    expect(formatRange('2025-12-01', '2026-01-31')).toBe('Dec 1, 2025 – Jan 31, 2026')
  })
})

describe('aging by party', () => {
  it('sums each party across buckets, largest first', () => {
    const data = {
      kind: 'ar', as_of: '2026-09-28', ledger_balance: 350, unapplied: 0, total_documents: 350,
      buckets: { current: 100, d1_30: 200, d31_60: 50, d61_90: 0, d90_plus: 0 },
      bucket_counts: { current: 1, d1_30: 1, d31_60: 1, d61_90: 0, d90_plus: 0 },
      documents: [
        { id: '1', number: 'INV-1', party: 'Acme', date: '2026-09-01', due_date: '2026-09-30', amount: 100, days_past_due: -2, bucket: 'current' },
        { id: '2', number: 'INV-2', party: 'Acme', date: '2026-08-01', due_date: '2026-08-31', amount: 200, days_past_due: 28, bucket: 'd1_30' },
        { id: '3', number: 'INV-3', party: 'Bolt', date: '2026-07-01', due_date: '2026-07-31', amount: 50, days_past_due: 59, bucket: 'd31_60' },
      ],
    } as Aging
    const rows = agingByParty(data)
    expect(rows.map(r => [r.party, r.total])).toEqual([['Acme', 300], ['Bolt', 50]])
    expect(rows[0]!.buckets).toMatchObject({ current: 100, d1_30: 200 })
  })
})

describe('general ledger balances', () => {
  it('shows a credit-normal balance as positive', () => {
    expect(onNormalSide({ normal_balance: 'credit' }, -75)).toBe(75)
    expect(onNormalSide({ normal_balance: 'debit' }, 950)).toBe(950)
    expect(Object.is(onNormalSide({ normal_balance: 'credit' }, 0), -0)).toBe(false)
  })
})
