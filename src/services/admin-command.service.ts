// PATH: src/services/admin-command.service.ts
// Wrappers around the v19 command-center RPCs.
//
// All RPCs are gated server-side by is_super_admin() — these wrappers
// only handle network errors and map the JSONB response to typed shapes.

import { db } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the JSONB shape returned by get_admin_command_center()
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemHealthData {
  users_active_today:      number
  users_active_7d:         number
  total_users:             number
  transactions_today:      number
  transactions_7d:         number
  total_organizations:     number
  active_organizations_7d: number
  impersonation_24h:       number
}

export interface PlanDistribution {
  starter:      number
  entrepreneur: number
  bookkeeper:   number
  accountant:   number
}

export interface RevenueData {
  mrr_cents:         number
  mrr_dollars:       number
  active_subs:       number
  trial_users:       number
  conversions_30d:   number
  plan_distribution: PlanDistribution
}

export interface RiskData {
  red_total:       number
  amber_total:     number
  green_total:     number
  blue_total:      number
  requires_review: number
  pct_resolved:    number
}

export interface TopClient {
  org_id:        string
  org_name:      string
  org_slug:      string
  tx_count:      number
  last_activity: string | null
}

export interface ClientWithIssues {
  org_id:      string
  org_name:    string
  org_slug:    string
  red_count:   number
  amber_count: number
}

export interface InactiveClient {
  org_id:         string
  org_name:       string
  org_slug:       string
  last_activity:  string | null
  days_inactive:  number
}

export interface AdminEvent {
  kind:       'impersonation' | 'signup' | string
  severity:   'info' | 'success' | 'warning' | 'error'
  actor:      string | null
  summary:    string
  created_at: string
  ref_id:     string
}

export interface CommandCenterData {
  generated_at:        string
  system_health:       SystemHealthData
  revenue:             RevenueData
  risk:                RiskData
  top_clients:         TopClient[]
  clients_with_issues: ClientWithIssues[]
  inactive_clients:    InactiveClient[]
  recent_events:       AdminEvent[]
  error?:              string
}

// ─────────────────────────────────────────────────────────────────────────────
// RPCs
// ─────────────────────────────────────────────────────────────────────────────

export async function getCommandCenter(): Promise<CommandCenterData> {
  const { data, error } = await db.rpc('get_admin_command_center')
  if (error) throw new Error(error.message)
  return data as unknown as CommandCenterData
}

export async function getRecentAdminEvents(limit = 15): Promise<AdminEvent[]> {
  const { data, error } = await db.rpc('get_recent_admin_events', { p_limit: limit })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AdminEvent[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Search palette (⌘K)
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchResultOrg {
  id:        string
  name:      string
  slug:      string
  currency:  string | null
  is_active: boolean
}

// NOTE: deliberately no `email` field — search_admin_entities still lets
// support search BY email server-side, but the returned row never
// includes it. Super_admin identifies people via lp_user_code.
export interface SearchResultUser {
  id:           string
  display_name: string | null
  lp_user_code: string | null
  tier:         string | null
  system_role:  string | null
  account_type: string | null
}

export interface SearchResults {
  organizations: SearchResultOrg[]
  users:         SearchResultUser[]
}

export async function searchAdminEntities(
  query: string,
  limit = 8
): Promise<SearchResults> {
  const { data, error } = await db.rpc('search_admin_entities', {
    p_query: query,
    p_limit: limit
  })
  if (error) throw new Error(error.message)
  return (data ?? { organizations: [], users: [] }) as unknown as SearchResults
}
