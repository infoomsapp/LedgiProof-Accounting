// PATH: src/services/api-keys.service.ts
//
// API access — Accountant/Enterprise plan feature. Lets a firm generate a
// key for programmatic read access to their own org's data (see
// supabase/functions/api-v1 for what the key can actually call).
//
// The plaintext key only ever exists in the browser for the few seconds
// between generation and being shown to the user once — only its SHA-256
// hash and a short display prefix are stored. There is no way to recover
// a lost key; it has to be revoked and a new one generated.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'
import type { ApiKey } from '../types/database.types'

export type { ApiKey }

const KEY_PREFIX = 'lp_live_'

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

export async function listApiKeys(orgId: string): Promise<ApiKey[]> {
  const { data, error } = await db
    .from('api_keys')
    .select('id, org_id, name, key_prefix, created_by, created_at, last_used_at, revoked_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw dbError(error, 'Failed to load API keys')
  return (data ?? []) as ApiKey[]
}

/** Returns the full plaintext key -- shown once, never retrievable again. */
export async function createApiKey(orgId: string, name: string): Promise<{ key: string; record: ApiKey }> {
  const plaintext = `${KEY_PREFIX}${randomHex(24)}`
  const keyHash   = await sha256Hex(plaintext)
  const prefix    = plaintext.slice(0, KEY_PREFIX.length + 6)

  const { data, error } = await db
    .from('api_keys')
    .insert({ org_id: orgId, name, key_prefix: prefix, key_hash: keyHash })
    .select('id, org_id, name, key_prefix, created_by, created_at, last_used_at, revoked_at')
    .single()
  if (error) throw dbError(error, 'Failed to create the API key')

  return { key: plaintext, record: data as ApiKey }
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await db
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw dbError(error, 'Failed to revoke the API key')
}
