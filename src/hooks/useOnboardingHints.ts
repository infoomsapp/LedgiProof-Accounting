// PATH: src/hooks/useOnboardingHints.ts
//
// Drives the one-time contextual onboarding hints on a dashboard. Reads the
// current user's profile.onboarding_hints_seen (fetched once at login, see
// auth.store.ts) and offers a single dismissAll() that persists the flag via
// the mark_onboarding_hints_seen RPC, then updates the store optimistically
// so the hints disappear immediately without a refetch.

import { useState } from 'react'
import { useAuthStore } from '../store/auth.store'
import type { Json } from '../types/database.types'
import {
  hasSeenOnboardingHints,
  markOnboardingHintsSeen,
  type OnboardingSurface
} from '../services/onboarding.service'

export function useOnboardingHints(surface: OnboardingSurface) {
  const profile = useAuthStore(s => s.profile)
  const [dismissing, setDismissing] = useState(false)

  const shouldShow = !!profile && !hasSeenOnboardingHints(profile.onboarding_hints_seen, surface)

  async function dismissAll() {
    if (!profile || dismissing) return
    setDismissing(true)
    try {
      await markOnboardingHintsSeen(surface)
      useAuthStore.setState(state => {
        if (!state.profile) return state
        const prevHints = state.profile.onboarding_hints_seen
        const mergedHints: Json = {
          ...(prevHints && typeof prevHints === 'object' && !Array.isArray(prevHints) ? prevHints : {}),
          [surface]: true
        }
        return { profile: { ...state.profile, onboarding_hints_seen: mergedHints } }
      })
    } finally {
      setDismissing(false)
    }
  }

  return { shouldShow, dismissAll, dismissing }
}
