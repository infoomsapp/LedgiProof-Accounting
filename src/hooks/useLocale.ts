// PATH: src/hooks/useLocale.ts
//
// In-app language preference. Source of truth is profiles.locale; localStorage
// (`lp-locale`) is only a same-device mirror read synchronously by
// src/i18n/index.ts so the first paint doesn't flash English before the
// profile loads — see that file's header comment for the full rationale.
//
// Goes through the set_locale RPC, not a direct `profiles` UPDATE — a plain
// client-side update hits a real, previously-hit recursion bug: the
// profiles_self_update policy's own WITH CHECK subquery re-evaluates
// profiles' SELECT policies from inside a profiles UPDATE policy, which
// Postgres's recursion guard rejects (42P17, "infinite recursion detected
// in policy for relation profiles"). Confirmed live while building this
// feature, not assumed — see mark_onboarding_hints_seen for the same fix
// applied previously to this exact table.

import { useCallback, useState } from 'react'
import i18n, { type AppLocale } from '../i18n'
import { useAuthStore } from '../store/auth.store'
import { db } from '../lib/supabase'
import { toSafeMessage } from '../lib/errors'

export function useLocale() {
  const profile = useAuthStore(s => s.profile)
  const [saving, setSaving] = useState(false)

  const locale: AppLocale = profile?.locale === 'es' ? 'es' : 'en'

  const setLocale = useCallback(async (next: AppLocale): Promise<{ error?: string }> => {
    if (!profile?.id || next === locale) return {}
    setSaving(true)
    try {
      const { error } = await db.rpc('set_locale', { p_locale: next })
      if (error) return { error: toSafeMessage(error, 'Could not save your language preference') }

      i18n.changeLanguage(next)
      try { localStorage.setItem('lp-locale', next) } catch { /* best-effort mirror only */ }
      useAuthStore.setState(state =>
        state.profile ? { profile: { ...state.profile, locale: next } } : state
      )
      return {}
    } finally {
      setSaving(false)
    }
  }, [profile?.id, locale])

  return { locale, setLocale, saving }
}
