// PATH: src/services/onboarding.service.ts
//
// Persists "has this user already seen the one-time contextual onboarding
// hints for surface X" — backed by profiles.onboarding_hints_seen (jsonb),
// a single reusable flag set for any future hint surface, not just the
// dashboards. Cross-device by design (a DB column, not localStorage) — the
// app's only prior localStorage-backed flag (theme.store.ts) is unscoped and
// per-browser, which is exactly what onboarding hints should NOT be.

import { db } from '../lib/supabase'
import type { Json } from '../types/database.types'

export type OnboardingSurface = 'accountant_dashboard' | 'bookkeeper_dashboard'

export function hasSeenOnboardingHints(
  hintsSeen: Json | null | undefined,
  surface: OnboardingSurface
): boolean {
  if (!hintsSeen || typeof hintsSeen !== 'object' || Array.isArray(hintsSeen)) return false
  return hintsSeen[surface] === true
}

export async function markOnboardingHintsSeen(surface: OnboardingSurface): Promise<void> {
  const { error } = await db.rpc('mark_onboarding_hints_seen', { p_surface: surface })
  if (error) throw new Error(error.message)
}
