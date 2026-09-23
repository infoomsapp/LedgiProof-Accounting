// PATH: src/services/org.service.ts
//
// P5.C — Wrappers for v33 organization-categorization RPCs.
//
// Two RPCs exposed:
//   1. create_personal_org_for_bookkeeper(user_id, display_name?)
//      Creates a new is_personal=TRUE workspace + makes the user owner.
//      Idempotent: returns existing personal org_id if one already exists.
//
//   2. get_user_orgs_by_category(user_id)
//      Server-side partition of user's orgs into personal/firm/client buckets.
//      Faster than partitionOrgs(client-side) when user has many orgs.
//
// Auth model:
//   Both RPCs are SECURITY DEFINER and verify auth.uid() server-side.
//   The user_id parameter can ONLY be different from auth.uid() if the caller
//   is a super_admin (impersonation flow). For normal users, omit it and
//   the RPC defaults to auth.uid().

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import { dbError } from '../lib/errors'

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrgCategorySummary {
  id:       string
  name:     string
  currency: string
}

export interface UserOrgsByCategory {
  personal: OrgCategorySummary[]
  firm:     OrgCategorySummary[]
  client:   OrgCategorySummary[]
}

// ── createPersonalOrgForBookkeeper ──────────────────────────────────────────

/**
 * Creates a personal workspace (is_personal=TRUE) for the current user.
 *
 * Idempotent: if the user already owns a personal org, returns its id without
 * creating a new one.
 *
 * @param displayName  Optional friendly name. If omitted, the RPC generates
 *                     one from the user's email ("alice (Personal)").
 * @returns            UUID of the personal org (existing or newly created).
 */
export async function createPersonalOrgForBookkeeper(
  displayName?: string
): Promise<string> {
  // Resolve user_id client-side so we can pass it explicitly (the RPC also
  // defaults to auth.uid() but being explicit makes the call site clearer).
  const { data: { user }, error: authErr } = await db.auth.getUser()
  if (authErr) throw dbError(authErr, 'Failed to verify your session')
  if (!user)   throw new Error('Not authenticated')

  const { data, error } = await db.rpc('create_personal_org_for_bookkeeper', pruneRpcArgs({
    p_user_id:      user.id,
    p_display_name: displayName ?? undefined
  }))

  if (error) throw dbError(error, 'Failed to create the workspace')
  if (!data) throw new Error('RPC returned no org_id')

  return data as unknown as string
}

// ── getUserOrgsByCategory ───────────────────────────────────────────────────

/**
 * Fetches the current user's orgs grouped by category (personal/firm/client).
 *
 * Server-side variant of partitionOrgs() from lib/org-helpers.ts. Prefer this
 * when the user has many orgs and you only need the categorization, not the
 * full Organization rows (which org.store already has loaded).
 *
 * @returns Object with three arrays (personal, firm, client), each possibly
 *          empty. Never null.
 */
export async function getUserOrgsByCategory(): Promise<UserOrgsByCategory> {
  const { data, error } = await db.rpc('get_user_orgs_by_category')

  if (error) throw dbError(error, 'Failed to load your workspaces')

  // RPC returns JSONB { personal: [], firm: [], client: [] } — types are
  // looser than we'd like, so we coerce defensively.
  const result = (data as unknown as Partial<UserOrgsByCategory> | null) ?? {}

  return {
    personal: result.personal ?? [],
    firm:     result.firm     ?? [],
    client:   result.client   ?? []
  }
}
