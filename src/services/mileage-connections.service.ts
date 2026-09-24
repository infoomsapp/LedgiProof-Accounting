// PATH: src/services/mileage-connections.service.ts
//
// ControlMiles connection — lets an org generate a token that a connected
// ControlMiles account presents (as a bearer token) when pushing closed
// trips into supabase/functions/mileage-webhook. Same hash-only-at-rest
// pattern as api-keys.service.ts: the plaintext token only exists in the
// browser for the few seconds between generation and being shown once.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'
import type { MileageConnection } from '../types/database.types'

export type { MileageConnection }

const TOKEN_PREFIX = 'lp_mile_'

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

export async function listMileageConnections(orgId: string): Promise<MileageConnection[]> {
  const { data, error } = await db
    .from('mileage_connections')
    .select('id, org_id, provider, label, token_prefix, status, created_by, created_at, last_received_at, revoked_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw dbError(error, 'Failed to load ControlMiles connections')
  return (data ?? []) as MileageConnection[]
}

/** Returns the full plaintext token -- shown once, never retrievable again. */
export async function createMileageConnection(
  orgId: string,
  label: string
): Promise<{ token: string; record: MileageConnection }> {
  const plaintext = `${TOKEN_PREFIX}${randomHex(24)}`
  const tokenHash = await sha256Hex(plaintext)
  const prefix    = plaintext.slice(0, TOKEN_PREFIX.length + 6)

  const { data, error } = await db
    .from('mileage_connections')
    .insert({ org_id: orgId, provider: 'controlmiles', label, token_prefix: prefix, token_hash: tokenHash })
    .select('id, org_id, provider, label, token_prefix, status, created_by, created_at, last_received_at, revoked_at')
    .single()
  if (error) throw dbError(error, 'Failed to create the connection')

  return { token: plaintext, record: data as MileageConnection }
}

export async function revokeMileageConnection(id: string): Promise<void> {
  const { error } = await db
    .from('mileage_connections')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw dbError(error, 'Failed to revoke the connection')
}
