// PATH: src/hooks/usePlan.ts
// Single hook to get the user's plan info: subscription, features, usage,
// and trial status. Polls every 60s to reflect post-upgrade changes.

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '../store/auth.store'
import {
  getMySubscription,
  getPlanFeatures,
  getCurrentUsage,
  getTrialDaysLeft,
  isTrialExpired,
  type Subscription,
  type PlanFeature,
  type UsageEntry
} from '../services/subscription.service'
import type { SubscriptionPlan } from '../types/database.types'

export interface PlanInfo {
  loading:       boolean
  subscription:  Subscription | null
  plan:          SubscriptionPlan
  features:      PlanFeature[]
  usage:         UsageEntry[]
  trialDaysLeft: number | null
  trialExpired:  boolean

  // Helpers
  getLimit:     (featureKey: string) => number  // -1 unlimited, 0 disabled
  getUsed:      (featureKey: string) => number
  getRemaining: (featureKey: string) => number
  isEnabled:    (featureKey: string) => boolean
  refresh:      () => Promise<void>
}

const POLL_INTERVAL_MS = 60_000

export function usePlan(): PlanInfo {
  const { user } = useAuthStore()
  const userId = user?.id ?? null

  const [loading,      setLoading]      = useState(true)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [features,     setFeatures]     = useState<PlanFeature[]>([])
  const [usage,        setUsage]        = useState<UsageEntry[]>([])

  const load = useCallback(async () => {
    if (!userId) {
      setSubscription(null)
      setFeatures([])
      setUsage([])
      setLoading(false)
      return
    }

    const sub = await getMySubscription(userId)
    setSubscription(sub)

    if (sub) {
      const [feats, usg] = await Promise.all([
        getPlanFeatures(sub.plan),
        getCurrentUsage(userId)
      ])
      setFeatures(feats)
      setUsage(usg)
    } else {
      setFeatures([])
      setUsage([])
    }

    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  // Poll every 60s — picks up post-upgrade changes
  useEffect(() => {
    if (!userId) return
    const id = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [userId, load])

  // Refresh on tab focus (user might have upgraded in another tab)
  useEffect(() => {
    function onFocus() { load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getLimit = (featureKey: string): number => {
    const f = features.find(f => f.feature_key === featureKey)
    if (!f) return 0
    if (!f.is_enabled) return 0
    return f.limit_value
  }

  const getUsed = (featureKey: string): number => {
    return usage.find(u => u.feature_key === featureKey)?.count ?? 0
  }

  const getRemaining = (featureKey: string): number => {
    const limit = getLimit(featureKey)
    if (limit === -1) return Number.POSITIVE_INFINITY
    if (limit === 0)  return 0
    const used = getUsed(featureKey)
    return Math.max(0, limit - used)
  }

  const isEnabled = (featureKey: string): boolean => {
    const f = features.find(f => f.feature_key === featureKey)
    return !!f?.is_enabled && (f?.limit_value ?? 0) !== 0
  }

  return {
    loading,
    subscription,
    plan:          subscription?.plan ?? 'starter',
    features,
    usage,
    trialDaysLeft: getTrialDaysLeft(subscription),
    trialExpired:  isTrialExpired(subscription),
    getLimit,
    getUsed,
    getRemaining,
    isEnabled,
    refresh:       load
  }
}