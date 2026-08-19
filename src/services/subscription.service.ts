// PATH: src/services/subscription.service.ts
// Read-only service for subscription + plan features.

import { db } from '../lib/supabase'
import type { SubscriptionPlan } from '../types/database.types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Subscription {
  id:                       string
  user_id:                  string
  org_id:                   string | null
  plan:                     SubscriptionPlan
  status:                   'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
  trial_started_at:         string | null
  trial_ends_at:            string | null
  current_period_start:     string
  current_period_end:       string | null
  canceled_at:              string | null
  stripe_customer_id:       string | null
  stripe_subscription_id:   string | null
  created_at:               string
  updated_at:               string
}

export interface PlanFeature {
  plan:        SubscriptionPlan
  feature_key: string
  limit_value: number     // -1 = unlimited; 0 = disabled; 1+ = quota or boolean
  is_enabled:  boolean
}

export interface UsageEntry {
  feature_key:   string
  period_year:   number
  period_month:  number
  count:         number
  last_used_at:  string | null
}

// ── My subscription ──────────────────────────────────────────────────────────

export async function getMySubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await db
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('[getMySubscription]', error.message)
    return null
  }
  return data as Subscription | null
}

// ── Plan features (cached per plan) ──────────────────────────────────────────

const featureCache = new Map<SubscriptionPlan, PlanFeature[]>()

export async function getPlanFeatures(plan: SubscriptionPlan): Promise<PlanFeature[]> {
  if (featureCache.has(plan)) {
    return featureCache.get(plan)!
  }

  const { data, error } = await db
    .from('plan_features')
    .select('*')
    .eq('plan', plan)

  if (error) {
    console.warn('[getPlanFeatures]', error.message)
    return []
  }

  const features = (data ?? []) as PlanFeature[]
  featureCache.set(plan, features)
  return features
}

// Clear cache when plan changes (after upgrade)
export function invalidateFeatureCache(): void {
  featureCache.clear()
}

// ── Current month usage ──────────────────────────────────────────────────────

export async function getCurrentUsage(userId: string): Promise<UsageEntry[]> {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1

  const { data, error } = await db
    .from('usage_tracking')
    .select('feature_key, period_year, period_month, count, last_used_at')
    .eq('user_id', userId)
    .eq('period_year',  year)
    .eq('period_month', month)

  if (error) {
    console.warn('[getCurrentUsage]', error.message)
    return []
  }
  return (data ?? []) as UsageEntry[]
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