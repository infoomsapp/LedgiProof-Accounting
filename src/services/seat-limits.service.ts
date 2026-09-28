// PATH: src/services/seat-limits.service.ts
//
// "Up to N clients" / "Up to N team members": a pre-check so the UI can say
// so before the user fills a form. The server enforces the same numbers
// (trg_seat_clients / trg_seat_members, errors LQ004 / LQ005) from the same
// source -- get_workspace_plan: the org owner's plan and the real row counts.

import { getWorkspacePlan } from './subscription.service'
import type { SubscriptionPlan } from '../types/database.types'

export interface SeatLimitResult {
  allowed: boolean
  used:    number
  limit:   number   // -1 = unlimited
  /** The plan being paid for (what an upgrade starts from). */
  plan:    SubscriptionPlan
}

async function check(orgId: string, featureKey: 'clients' | 'team_members'): Promise<SeatLimitResult> {
  const wp    = await getWorkspacePlan(orgId)
  const limit = wp.features[featureKey] ?? 0
  const used  = featureKey === 'clients' ? wp.seats.clients : wp.seats.team_members
  return {
    allowed: limit === -1 || used < limit,
    used,
    limit,
    plan: wp.subscription?.plan ?? 'starter'
  }
}

export function checkClientLimit(orgId: string): Promise<SeatLimitResult> {
  return check(orgId, 'clients')
}

/** Counts everyone in the workspace, owner included (Starter's 1 = just the owner). */
export function checkTeamMemberLimit(orgId: string): Promise<SeatLimitResult> {
  return check(orgId, 'team_members')
}
