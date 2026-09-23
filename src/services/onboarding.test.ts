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

  it('throws when the RPC fails, without leaking the raw database error text', async () => {
    // Shaped like a real PostgrestError: details/hint are what mark it DB-originated,
    // and the raw message names an internal table — exactly what must not reach a user.
    mockRpcResult.error = {
      message: 'permission denied for table user_onboarding',
      code:    '42501',
      details: null,
      hint:    null
    }
    const err = await markOnboardingHintsSeen('accountant_dashboard').then(() => null, (e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).not.toContain('user_onboarding')
    expect(err!.message).toBe("You don't have permission to do that.")
  })

  it('falls back to the caller-supplied description for an unrecognized DB error', async () => {
    mockRpcResult.error = {
      message: 'null value in column "surface" of relation "user_onboarding" violates not-null constraint',
      code:    '23502',
      details: null,
      hint:    null
    }
    const err = await markOnboardingHintsSeen('accountant_dashboard').then(() => null, (e: Error) => e)
    expect(err!.message).not.toContain('user_onboarding')
    expect(err!.message).toBe('Failed to save your onboarding progress')
  })
})
