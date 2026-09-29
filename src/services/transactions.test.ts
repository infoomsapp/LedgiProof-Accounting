// PATH: src/services/transactions.test.ts
// Certification queue + certify action -- the two functions backing the
// Accountant dashboard's Certification Queue and the Bookkeeper's Certify
// chip. Both now go through the database's one verification path
// (get_verification_queue / verify_transactions, semaphore_v2.sql), so the
// mock is a minimal db.rpc stand-in.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above top-level consts, so anything the
// factory closes over has to be declared through vi.hoisted.
const { rpcResult, rpc } = vi.hoisted(() => {
  const rpcResult: { data: any; error: any } = { data: null, error: null }
  const rpc = vi.fn(() => Promise.resolve(rpcResult))
  return { rpcResult, rpc }
})

vi.mock('../lib/supabase', () => ({
  db: { rpc, from: vi.fn(), functions: { invoke: vi.fn() } },
  getCurrentUserId: vi.fn(async () => 'user-1')
}))

import { getCertificationQueue, certifyTransaction } from './transactions.service'

beforeEach(() => {
  rpcResult.data  = null
  rpcResult.error = null
  rpc.mockClear()
})

describe('getCertificationQueue', () => {
  it('asks for the whole firm and returns the items', async () => {
    rpcResult.data = {
      total: 1,
      items: [{ id: 'tx-1', semaphore: 'green', amount: 100, client_name: 'Acme', auto: true }]
    }
    const rows = await getCertificationQueue('org-1')
    expect(rpc).toHaveBeenCalledWith('get_verification_queue', { p_org_id: 'org-1', p_all_clients: true })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.client_name).toBe('Acme')
  })

  it('returns an empty array when there is nothing to certify', async () => {
    rpcResult.data = { total: 0, items: [] }
    expect(await getCertificationQueue('org-1')).toEqual([])
  })

  it('throws when the query fails, without leaking the raw database error text', async () => {
    // Shaped like a real PostgrestError -- the raw message names an internal
    // relation, which must never reach the user.
    rpcResult.error = {
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
  it('verifies through verify_transactions and resolves', async () => {
    rpcResult.data = { verified: ['tx-1'], failed: [], rule_prompts: [] }
    await expect(certifyTransaction('org-1', 'tx-1')).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('verify_transactions', { p_org_id: 'org-1', p_transaction_ids: ['tx-1'] })
  })

  it('surfaces the reason the database refused it (not categorized yet)', async () => {
    rpcResult.data = {
      verified: [],
      failed: [{ transaction_id: 'tx-1', error: 'Categorize this transaction before verifying it', code: 'LV005' }],
      rule_prompts: []
    }
    await expect(certifyTransaction('org-1', 'tx-1')).rejects.toThrow(/Categorize this transaction before verifying it/)
  })

  it('throws a friendly message when the call itself is refused', async () => {
    rpcResult.error = { message: 'unauthorized: no access to this organization', code: '42501', details: null, hint: null }
    await expect(certifyTransaction('org-1', 'tx-1')).rejects.toThrow("You don't have permission to do that.")
  })
})
