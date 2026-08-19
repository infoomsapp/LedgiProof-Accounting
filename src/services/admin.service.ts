// PATH: src/services/admin.service.ts
// Super Admin service — wraps SECURITY DEFINER RPCs.
// Every call here triggers an entry in impersonation_audit.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import type {
  Transaction, Organization, SystemRole
} from '../types/database.types'

// ── Role check ───────────────────────────────────────────────────────────────

export async function fetchMySystemRole(userId: string): Promise<SystemRole> {
  const { data } = await db
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.role as SystemRole) ?? 'bookkeeper'
}

// ── Cross-tenant data fetchers (super admin only) ────────────────────────────

export async function adminGetOrganizations(): Promise<Organization[]> {
  const { data, error } = await db.rpc('get_organizations_admin')
  if (error) throw new Error(error.message)
  return (data ?? []) as Organization[]
}

// get_clients_admin deliberately does NOT return clients.email — super_admin
// support views default to lp_user_code / display_name only, never a
// contact/login email, unless a specific case makes it necessary (none
// does today). Keep this type in sync with the RPC's RETURNS TABLE.
export interface AdminClientRow {
  id:               string
  org_id:           string
  display_name:     string
  company_name:     string | null
  phone:            string | null
  tax_id:           string | null
  address_line1:    string | null
  address_line2:    string | null
  city:             string | null
  state:            string | null
  postal_code:      string | null
  country:          string | null
  default_currency: string | null
  payment_terms:    number | null
  notes:            string | null
  is_active:        boolean
  created_by:       string
  created_at:       string
  updated_at:       string
  primary_user_id:  string | null
}

export async function adminGetClients(orgId?: string): Promise<AdminClientRow[]> {
  const { data, error } = await db.rpc('get_clients_admin', pruneRpcArgs({
    p_org_id: orgId ?? undefined
  }))
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AdminClientRow[]
}

export async function adminGetTransactions(opts: {
  orgId?:    string
  clientId?: string
  limit?:    number
}): Promise<Transaction[]> {
  const { data, error } = await db.rpc('get_transactions_admin', pruneRpcArgs({
    p_org_id:    opts.orgId    ?? undefined,
    p_client_id: opts.clientId ?? undefined,
    p_limit:     opts.limit    ?? 200
  }))
  if (error) throw new Error(error.message)
  return (data ?? []) as Transaction[]
}

// NOTE: deliberately no `email` field — get_user_directory_admin no longer
// selects it. Super_admin sees lp_user_code, never the login email.
export interface AdminUserDirectoryRow {
  id:           string
  display_name: string | null
  user_type:    'staff_user' | 'client_user'
  client_id:    string | null
  system_role:  SystemRole
  lp_user_code: string | null
  is_active:    boolean
  created_at:   string
  last_seen_at: string | null
}

export async function adminGetUserDirectory(): Promise<AdminUserDirectoryRow[]> {
  const { data, error } = await db.rpc('get_user_directory_admin')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AdminUserDirectoryRow[]
}

// ── View As — resolve a user's primary org ───────────────────────────────────
// Used when "View as User" is chosen instead of "View as Org": the target
// user has no org_id of their own attached to the search result, so we
// resolve their first active membership the same way org.store.ts would
// for a real login.
export interface UserOrgContext {
  org_id:          string
  org_name:        string
  org_slug:        string
  membership_role: string
}

export async function adminGetUserOrgContext(userId: string): Promise<UserOrgContext | null> {
  const { data, error } = await db.rpc('get_user_org_context_admin', { p_user_id: userId })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as UserOrgContext[]
  return rows[0] ?? null
}

export interface GovernanceOverview {
  period_days:    number
  total_orgs:     number
  total_users:    number
  total_clients:  number
  cgc: {
    total_validations: number
    approved:          number
    review_required:   number
    rejected:          number
    avg_confidence:    number | null
  }
  transactions: {
    total: number
    amber: number
    red:   number
    blue:  number
  }
  decisions: {
    total: number
  }
}

export async function adminGetGovernanceOverview(days = 30): Promise<GovernanceOverview> {
  const { data, error } = await db.rpc('get_governance_overview_admin', {
    p_days: days
  })
  if (error) throw new Error(error.message)
  return data as unknown as GovernanceOverview
}

// ── Role management ──────────────────────────────────────────────────────────

export async function adminGrantRole(
  targetUserId: string,
  role:         SystemRole,
  notes?:       string
): Promise<void> {
  const { error } = await db.rpc('grant_role', pruneRpcArgs({
    p_target_user_id: targetUserId,
    p_role:           role,
    p_notes:          notes ?? undefined
  }))
  if (error) throw new Error(error.message)
}

// ── Impersonation audit log ───────────────────────────────────

export interface ImpersonationAuditRow {
  id:                string
  actor_user_id:     string
  actor_role:        SystemRole
  context_org_id:    string | null
  context_client_id: string | null
  context_user_id:   string | null
  action:            string
  target_table:      string | null
  target_count:      number | null
  query_metadata:    Record<string, unknown>
  created_at:        string
}

export async function adminGetAuditLog(limit = 100): Promise<ImpersonationAuditRow[]> {
  const { data, error } = await db
    .from('impersonation_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as ImpersonationAuditRow[]
}
