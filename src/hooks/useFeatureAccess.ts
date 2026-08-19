// PATH: src/hooks/useFeatureAccess.ts
// Hook to query a specific feature's access state, useful for components
// that need to conditionally render UI (Upgrade banners, locked features).
//
// Internally uses usePlan (already cached). Re-renders when plan/usage updates.

import { usePlan } from './usePlan'

export interface FeatureAccess {
  loading:    boolean
  enabled:    boolean    // is this feature available on current plan?
  unlimited:  boolean    // limit === -1
  limit:      number     // 0 if disabled
  used:       number
  remaining:  number     // Infinity if unlimited
  exhausted:  boolean    // remaining === 0 and not unlimited
  plan:       string
}

export function useFeatureAccess(featureKey: string): FeatureAccess {
  const { loading, plan, getLimit, getUsed, getRemaining, isEnabled } = usePlan()

  const limit     = getLimit(featureKey)
  const used      = getUsed(featureKey)
  const remaining = getRemaining(featureKey)
  const enabled   = isEnabled(featureKey)
  const unlimited = limit === -1

  return {
    loading,
    enabled,
    unlimited,
    limit,
    used,
    remaining,
    exhausted: enabled && !unlimited && remaining === 0,
    plan
  }
}