// PATH: src/services/onboarding.test.ts
// hasSeenOnboardingHints — pure logic, no mocking needed.
// markOnboardingHintsSeen — wraps a single RPC call; same db-mocking pattern
// as transactions.test.ts (the first file in this repo to mock the Supabase
// client), but calling `.rpc()` instead of `.from()`.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRpcResult, rpc } = vi.hoisted(() => {
  const mockRpcResult: { error: any } = { error: null }
  const rpc = vi.fn(() => Promise.resolve(mockRpcResult))
  return { mockRpcResult, rpc }
})

vi.mock('../lib/supabase', () => ({
  db: { rpc }
}))

import { hasSeenOnboardingHints, markOnboardingHintsSeen } from './onboarding.service'

beforeEach(() => {
  mockRpcResult.error = null
  rpc.mockClear()
})

describe('hasSeenOnboardingHints', () => {
  it('is false when the flags object is null', () => {
    expect(hasSeenOnboardingHints(null, 'accountant_dashboard')).toBe(false)
  })

  it('is false when the surface has never been marked', () => {
    expect(hasSeenOnboardingHints({ bookkeeper_dashboard: true }, 'accountant_dashboard')).toBe(false)
  })

  it('is true once the surface has been marked seen', () => {
    expect(hasSeenOnboardingHints({ accountant_dashboard: true }, 'accountant_dashboard')).toBe(true)
  })

  it('is false for a malformed (array) value rather than throwing', () => {
    expect(hasSeenOnboardingHints([1, 2, 3] as any, 'accountant_dashboard')).toBe(false)
  })
})

describe('markOnboardingHintsSeen', () => {
  it('calls the RPC with the given surface', async () => {
    await markOnboardingHintsSeen('bookkeeper_dashboard')
    expect(rpc).toHaveBeenCalledWith('mark_onboarding_hints_seen', { p_surface: 'bookkeeper_dashboard' })
  })

  it('throws when the RPC fails', async () => {
    mockRpcResult.error = { message: 'permission denied' }
    await expect(markOnboardingHintsSeen('accountant_dashboard')).rejects.toThrow(/permission denied/)
  })
})
