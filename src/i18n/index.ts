// PATH: src/i18n/index.ts
//
// In-app language system. Scope is deliberately narrow: this only ever
// governs text INSIDE the authenticated app (AppShell and everything nested
// under it) — the public marketing site (LandingPage, Pricing, legal pages)
// and the pre-auth Login/SignUp screens never import `useTranslation` and
// stay hardcoded English regardless of what a user picks here, per the
// product decision: LedgiProof's market is the US, most customers are
// English speakers, Spanish is an accommodation for a minority inside the
// product itself, not a marketing-site localization.
//
// Persistence: the source of truth is `profiles.locale` (sits alongside the
// existing `onboarding_hints_seen` column, same "small per-user preference"
// shape) — set via a plain `profiles` UPDATE, no RPC needed (the existing
// `profiles_self_update` RLS policy already allows a user to update their
// own row's arbitrary columns, it only pins `tier` unchanged). `lp-locale`
// in localStorage is a same-origin, same-device mirror only, read
// synchronously here so the very first paint (before the Supabase session
// + profile fetch resolve) already renders in the right language instead of
// flashing English first — never treated as authoritative once the real
// profile loads (see useSyncLocale.ts).

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import es from './locales/es'

export type AppLocale = 'en' | 'es'
export const SUPPORTED_LOCALES: AppLocale[] = ['en', 'es']

function readPersistedLocale(): AppLocale {
  try {
    const stored = localStorage.getItem('lp-locale')
    return stored === 'es' ? 'es' : 'en'
  } catch {
    return 'en'
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng:            readPersistedLocale(),
    fallbackLng:    'en',
    interpolation:  { escapeValue: false }, // React already escapes
    returnNull:     false,
  })

export default i18n
