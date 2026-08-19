// PATH: tests/integration/db.ts
//
// Integration-test harness for the SQL money/reconciliation logic (RPCs +
// triggers) that unit tests can't reach. Each test runs inside a transaction
// that is ALWAYS rolled back, so the database is never mutated.
//
// Requires a direct Postgres connection string in DATABASE_URL (the Supabase
// "Direct connection" / session-pooler URI, which includes the DB password).
// Without it, these suites SKIP cleanly — so CI without a DB stays green and
// the unit suite (`npm test`) is unaffected.

import { Pool, type PoolClient } from 'pg'
import { describe } from 'vitest'

const url = process.env.DATABASE_URL
export const hasDb = !!url

// `describeDb(...)` runs the block only when DATABASE_URL is set; otherwise skips.
export const describeDb: typeof describe = (hasDb ? describe : describe.skip) as typeof describe

let pool: Pool | null = null
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: url, max: 3 })
  return pool
}

/**
 * Runs `fn` inside a transaction and ALWAYS rolls back — assertions see real
 * RPC/trigger behavior, nothing is persisted.
 */
export async function withRollback<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    return await fn(client)
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }
}

/** Grab an existing org + client + a member user id to attach test rows to. */
export async function seedRefs(c: PoolClient): Promise<{ orgId: string; clientId: string; userId: string }> {
  const { rows } = await c.query(
    `SELECT c.org_id, c.id AS client_id,
            (SELECT user_id FROM organization_memberships m WHERE m.org_id = c.org_id LIMIT 1) AS user_id
       FROM clients c
      LIMIT 1`
  )
  if (!rows.length) throw new Error('No clients in the database to attach test rows to')
  return { orgId: rows[0].org_id, clientId: rows[0].client_id, userId: rows[0].user_id }
}

export const num = (v: unknown): number => Number(v)
