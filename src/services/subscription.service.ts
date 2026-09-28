// PATH: src/services/subscription.service.ts
// The workspace's plan, from ONE place: get_workspace_plan(org) -- the
// organization owner's subscription + plan_features, this month's usage
// (usage_meters) and standing seats. The same rules the server enforces
// (plan_limits_server.sql), so the UI never disagrees with the database.
//
// Before, this read the CALLER's own subscription: a firm's employee (no
// subscription of their own) saw every feature locked, and usage came from
// usage_tracking, which nothing ever incremented (always 0 used).

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'
import type { SubscriptionPlan } from '../types/database.types'

/** 'none' = sign-up still in progress; 'expired' = the plan ended. */
export type EffectivePlan = SubscriptionPlan | 'exempt' | 'expired' | 'none'

export interface Subscription {
  plan:               SubscriptionPlan
  status:             'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
  trial_started_at:   string | null
  trial_ends_at:      string | null
  current_period_end: string | null
  canceled_at:        string | null
}

export interface WorkspacePlan {
  plan:         EffectivePlan
  is_owner:     boolean
  subscription: Subscription | null
  /** feature_key -> limit: -1 unlimited, 0 not included, n = cap. */
  features:     Record<string, number>
  /** This month's counters (usage_meters). */
  usage: {
    transactions: number; receipts: number; mileage_trips: number; invoices: number
    ai_queries: number; plaid_connections: number; storage_mb: number
  }
  /** Standing counts; team_members includes the owner (plan_features semantics). */
  seats: { clients: number; team_members: number }
}

export async function getWorkspacePlan(orgId: string): Promise<WorkspacePlan> {
  const { data, error } = await db.rpc('get_workspace_plan', { p_org_id: orgId })
  if (error) throw dbError(error, 'Could not load your plan')
  return data as unknown as WorkspacePlan
}

// How much of a feature's limit is used: monthly counters for the metered
// features, real row counts for seats. Features without a counter are 0.
export function usedFor(wp: WorkspacePlan, featureKey: string): number {
  switch (featureKey) {
    case 'clients':           return wp.seats.clients
    case 'team_members':      return wp.seats.team_members
    case 'receipts_per_mo':   return wp.usage.receipts
    case 'transactions':      return wp.usage.transactions
    case 'mileage_trips':     return wp.usage.mileage_trips
    case 'invoices':          return wp.usage.invoices
    case 'ai_queries':        return wp.usage.ai_queries
    case 'plaid_connections': return wp.usage.plaid_connections
    case 'storage_mb':        return wp.usage.storage_mb
    default:                  return 0
  }
}

// ── Trial helpers ────────────────────────────────────────────────────────────

export function getTrialDaysLeft(sub: Subscription | null): number | null {
  if (!sub || sub.status !== 'trialing' || !sub.trial_ends_at) return null

  const ends = new Date(sub.trial_ends_at).getTime()
  const now  = Date.now()
  const days = Math.ceil((ends - now) / (1000 * 60 * 60 * 24))
  return Math.max(0, days)
}

export function isTrialExpired(sub: Subscription | null): boolean {
  if (!sub || sub.status !== 'trialing' || !sub.trial_ends_at) return false
  return new Date(sub.trial_ends_at).getTime() < Date.now()
}
