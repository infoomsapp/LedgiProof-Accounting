// ── src/services/audit.service.ts ────────────────────────────────────────────
// Writes to audit_events (append-only table).
// Never updates or deletes — enforced at DB level via triggers.

import { db } from '../lib/supabase'
import { verifyHashChain } from '../lib/hash'
import type { AuditEventType, AuditEvent } from '../types/database.types'
import type { AuditActivityItem } from '../types/audit'

// ── Append a single event to the chain ───────────────────────────────────────

export interface AppendAuditEventInput {
  orgId:              string
  transactionId:      string
  transactionGroupId: string
  transactionVersion: number
  eventType:          AuditEventType
  actorId:            string | null
  previousHash:       string | null
  entryHash:          string
  diff?:              Record<string, { before: unknown; after: unknown }>
  metadata?:          Record<string, unknown>
}

export async function appendAuditEvent(input: AppendAuditEventInput): Promise<AuditEvent> {
  const { data, error } = await db
    .from('audit_events')
    .insert({
      org_id:               input.orgId,
      transaction_id:       input.transactionId,
      transaction_group_id: input.transactionGroupId,
      transaction_version:  input.transactionVersion,
      event_type:           input.eventType,
      actor_id:             input.actorId,
      actor_role:           null,   // set by caller if needed
      previous_hash:        input.previousHash,
      entry_hash:           input.entryHash,
      diff:                 input.diff     ? (input.diff as any)     : null,
      metadata:             input.metadata ? (input.metadata as any) : null
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[Audit] Append failed: ${error?.message}`)
  }

  return data
}

// ── Read full audit trail for a transaction group ────────────────────────────

export async function getAuditTrail(
  transactionGroupId: string,
  orgId: string
): Promise<AuditEvent[]> {
  const { data, error } = await db
    .from('audit_events')
    .select('*')
    .eq('transaction_group_id', transactionGroupId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[Audit] Fetch failed: ${error.message}`)
  return data ?? []
}

// ── Verify the hash chain for an org (integrity check) ───────────────────────
// Returns { valid: true } or { valid: false, brokenAt: index }

export async function verifyOrgChain(
  orgId:  string,
  limit = 1000
): Promise<{ valid: boolean; brokenAt?: number; checked: number }> {
  const { data, error } = await db
    .from('audit_events')
    .select('entry_hash, previous_hash')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`[Audit] Chain fetch failed: ${error.message}`)

  const entries = data ?? []
  const valid   = await verifyHashChain(entries)

  if (valid) return { valid: true, checked: entries.length }

  // Find the exact broken link
  for (let i = 1; i < entries.length; i++) {
    if (entries[i]?.previous_hash !== entries[i - 1]?.entry_hash) {
      return { valid: false, brokenAt: i, checked: entries.length }
    }
  }

  return { valid: false, checked: entries.length }
}

// ── Get the most recent entry_hash for an org (chain continuation) ───────────
// Used by transactions.service.ts as `previousHash` when building the next
// link in the hash chain (create / edit / approve / lock). Returns null when
// the org has no audit_events yet (first-ever entry in the chain).

export async function getLatestAuditHash(orgId: string): Promise<string | null> {
  const { data, error } = await db
    .from('audit_events')
    .select('entry_hash')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`[Audit] Latest hash fetch failed: ${error.message}`)
  return data?.entry_hash ?? null
}

// ── Read recent events for an org (dashboard / activity feed) ───────────────

export async function getRecentEvents(
  orgId:  string,
  limit = 20
): Promise<AuditEvent[]> {
  const { data, error } = await db
    .from('audit_events')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`[Audit] Recentevents failed: ${error.message}`)
  return data ?? []
}

// ── Enriched activity feed (dashboard widgets) ───────────────────────────
// Unlike getRecentEvents (raw audit_events rows — no human-readable fields),
// this joins actor name + transaction description server-side via the
// get_org_activity_feed RPC, matching the AuditActivityItem shape the
// dashboard widgets actually render.

export async function getOrgActivityFeed(
  orgId: string,
  limit = 12
): Promise<AuditActivityItem[]> {
  const { data, error } = await db.rpc('get_org_activity_feed', {
    p_org_id: orgId,
    p_limit:  limit
  })
  if (error) throw new Error(`[Audit] Activity feed failed: ${error.message}`)
  return (data as unknown as AuditActivityItem[]) ?? []
}
