// PATH: src/hooks/usePlan.ts
// The current workspace's plan: what the server enforces, read from
// get_workspace_plan (the org owner's subscription, plan_features, this
// month's usage, seats). Polls every 60s and on tab focus to reflect upgrades.

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '../store/auth.store'
import {
  getWorkspacePlan,
  getTrialDaysLeft,
  isTrialExpired,
  usedFor,
  type EffectivePlan,
  type Subscription,
  type WorkspacePlan
} from '../services/subscription.service'

export interface PlanInfo {
  loading:       boolean
  subscription:  Subscription | null
  plan:          EffectivePlan
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
  const orgId = useAuthStore(s => s.membership?.org_id ?? null)

  const [loading, setLoading] = useState(true)
  const [wp,      setWp]      = useState<WorkspacePlan | null>(null)

  const load = useCallback(async () => {
    if (!orgId) {
      setWp(null)
      setLoading(false)
      return
    }
    try {
      setWp(await getWorkspacePlan(orgId))
    } catch (e) {
      // Keep the last known plan; a failed poll must not lock the UI.
      console.warn('[usePlan]', e instanceof Error ? e.message : e)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!orgId) return
    const id = setInterval(() => { void load() }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [orgId, load])

  useEffect(() => {
    function onFocus() { void load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const getLimit = (featureKey: string): number => wp?.features[featureKey] ?? 0
  const getUsed  = (featureKey: string): number => (wp ? usedFor(wp, featureKey) : 0)

  const getRemaining = (featureKey: string): number => {
    const limit = getLimit(featureKey)
    if (limit === -1) return Number.POSITIVE_INFINITY
    if (limit === 0)  return 0
    return Math.max(0, limit - getUsed(featureKey))
  }

  const isEnabled = (featureKey: string): boolean => getLimit(featureKey) !== 0

  return {
    loading,
    subscription:  wp?.subscription ?? null,
    plan:          wp?.plan ?? 'none',
    trialDaysLeft: getTrialDaysLeft(wp?.subscription ?? null),
    trialExpired:  isTrialExpired(wp?.subscription ?? null),
    getLimit,
    getUsed,
    getRemaining,
    isEnabled,
    refresh:       load
  }
}
