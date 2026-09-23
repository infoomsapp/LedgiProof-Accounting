// PATH: src/services/seat-limits.service.ts
//
// Real enforcement for the "Up to N clients" / "Up to N team members"
// numbers on the pricing page -- audit found these were pure marketing
// copy with nothing in code checking them (a Bookkeeper-plan org could
// add 500 clients and nothing would stop it).
//
// Deliberately NOT built on quota.service.ts's check_quota/usage_meters
// machinery: that system tracks monthly EVENTS (an AI query, a receipt
// upload) via an incrementing counter that can drift from reality.
// Clients and team members are STANDING COUNTS of real rows, so this
// counts the actual rows every time instead of trusting a separate
// tracked number.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'
import { getMySubscription, getPlanFeatures } from './subscription.service'
import type { SubscriptionPlan } from '../types/database.types'

export interface SeatLimitResult {
  allowed: boolean
  used:    number
  limit:   number   // -1 = unlimited
  plan:    SubscriptionPlan
}

async function getLimitFor(userId: string, featureKey: string): Promise<{ limit: number; plan: SubscriptionPlan }> {
  const sub = await getMySubscription(userId)
  const plan = sub?.plan ?? 'starter'
  const features = await getPlanFeatures(plan)
  const row = features.find(f => f.feature_key === featureKey)
  const limit = row?.is_enabled ? row.limit_value : 0
  return { limit, plan }
}

export async function checkClientLimit(userId: string, orgId: string): Promise<SeatLimitResult> {
  const { limit, plan } = await getLimitFor(userId, 'clients')

  const { count, error } = await db
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true)
  if (error) throw dbError(error, 'Failed to check your client count')

  const used = count ?? 0
  return { allowed: limit === -1 || used < limit, used, limit, plan }
}

export async function checkTeamMemberLimit(userId: string, orgId: string): Promise<SeatLimitResult> {
  const { limit, plan } = await getLimitFor(userId, 'team_members')

  const { count, error } = await db
    .from('organization_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true)
  if (error) throw dbError(error, 'Failed to check your team size')

  const used = count ?? 0
  return { allowed: limit === -1 || used < limit, used, limit, plan }
}
