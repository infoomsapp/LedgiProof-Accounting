// PATH: src/i18n/i18n.test.ts
//
// Guards en.ts/es.ts from silently drifting apart as pages get translated
// incrementally across many sessions/agents — a key added to one but not
// the other would render as a literal "settings.foo"-style key on screen
// for whichever language is missing it, easy to miss without this check.

import { describe, it, expect } from 'vitest'
import en from './locales/en'
import es from './locales/es'

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    collectKeys(v, prefix ? `${prefix}.${k}` : k)
  )
}

describe('i18n locale parity', () => {
  it('en.ts and es.ts declare exactly the same set of keys', () => {
    const enKeys = new Set(collectKeys(en))
    const esKeys = new Set(collectKeys(es))

    const missingInEs = [...enKeys].filter(k => !esKeys.has(k))
    const missingInEn = [...esKeys].filter(k => !enKeys.has(k))

    expect(missingInEs, `Keys present in en.ts but missing from es.ts: ${missingInEs.join(', ')}`).toEqual([])
    expect(missingInEn, `Keys present in es.ts but missing from en.ts: ${missingInEn.join(', ')}`).toEqual([])
  })

  it('no value is an empty string (an empty translation is a bug, not a valid one)', () => {
    for (const [locale, dict] of [['en', en], ['es', es]] as const) {
      const keys = collectKeys(dict)
      for (const key of keys) {
        const value = key.split('.').reduce<any>((o, k) => o?.[k], dict)
        expect(typeof value === 'string' && value.length > 0, `${locale}.${key} is empty`).toBe(true)
      }
    }
  })
})
