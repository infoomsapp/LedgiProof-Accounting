// PATH: src/services/transactions.test.ts
// Certification queue + certify action — the two new functions backing the
// Accountant dashboard's Certification Queue and the Bookkeeper's Certify
// chip. Everything else in transactions.service.ts writes real ledger rows
// and has no existing test coverage (see other *.test.ts files in this repo:
// all pure-logic, zero DB mocking) — these two are the first to touch the
// Supabase client, so this file introduces a minimal thenable query-builder
// mock rather than reaching for a heavier test-DB setup.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above top-level consts, so anything the
// factory closes over has to be declared through vi.hoisted.
const { mockResult, mockInvokeResult, invoke } = vi.hoisted(() => {
  const mockResult:       { data: any; error: any } = { data: null, error: null }
  const mockInvokeResult: { data: any; error: any } = { data: null, error: null }
  const invoke = vi.fn(() => Promise.resolve(mockInvokeResult))
  return { mockResult, mockInvokeResult, invoke }
})

// A chainable, thenable stand-in for PostgrestFilterBuilder — every filter
// method returns itself, and awaiting it (at any point in the chain, just
// like the real supabase-js builder) resolves to the configured result.
function makeQueryBuilder() {
  const builder: any = {
    select: () => builder,
    eq:     () => builder,
    order:  () => builder,
    then:   (resolve: any) => Promise.resolve(mockResult).then(resolve)
  }
  return builder
}

vi.mock('../lib/supabase', () => ({
  db: {
    from:      vi.fn(() => makeQueryBuilder()),
    functions: { invoke }
  },
  getCurrentUserId: vi.fn(async () => 'user-1')
}))

import { getCertificationQueue, certifyTransaction } from './transactions.service'

beforeEach(() => {
  mockResult.data  = null
  mockResult.error = null
  mockInvokeResult.data  = null
  mockInvokeResult.error = null
  invoke.mockClear()
})

describe('getCertificationQueue', () => {
  it('returns the rows the query resolves to', async () => {
    mockResult.data = [
      { id: 'tx-1', semaphore: 'green', amount: 100, clients: { display_name: 'Acme' } }
    ]
    const rows = await getCertificationQueue('org-1')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('tx-1')
  })

  it('returns an empty array when there is nothing to certify', async () => {
    mockResult.data = []
    expect(await getCertificationQueue('org-1')).toEqual([])
  })

  it('throws when the query fails, without leaking the raw database error text', async () => {
    mockResult.data  = null
    // Shaped like a real PostgrestError — the raw message names an internal
    // relation, which must never reach the user.
    mockResult.error = {
      message: 'permission denied for relation transactions_v',
      code:    '42501',
      details: null,
      hint:    null
    }
    const err = await getCertificationQueue('org-1').then(() => null, (e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).not.toContain('transactions_v')
    expect(err!.message).toContain("You don't have permission to do that.")
  })
})

describe('certifyTransaction', () => {
  it('resolves silently on a successful certification', async () => {
    mockInvokeResult.data = { success: true, resolution: 'certify', confidence: 95, newSemaphore: 'blue' }
    await expect(certifyTransaction('tx-1')).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('resolve-transaction', {
      body: { transaction_id: 'tx-1', resolution: 'certify' }
    })
  })

  it('surfaces the server-provided message on a permission rejection', async () => {
    mockInvokeResult.data  = { error: 'Only firm members may certify transactions' }
    mockInvokeResult.error = { message: 'Edge Function returned a non-2xx status code' }
    await expect(certifyTransaction('tx-1')).rejects.toThrow(/Only firm members may certify transactions/)
  })

  it('throws when the function call itself fails with no server message', async () => {
    mockInvokeResult.data  = null
    // supabase-js yields a real Error subclass (FunctionsError) here, not a
    // PostgrestError — it carries no database detail, so it passes through intact.
    mockInvokeResult.error = new Error('network error')
    await expect(certifyTransaction('tx-1')).rejects.toThrow(/network error/)
  })

  it('throws when the function returns 200 but success is false', async () => {
    mockInvokeResult.data  = { success: false, error: 'Transaction already verified' }
    mockInvokeResult.error = null
    await expect(certifyTransaction('tx-1')).rejects.toThrow(/Transaction already verified/)
  })
})
