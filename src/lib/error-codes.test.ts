// PATH: src/lib/error-codes.test.ts
//
// Guards the rule "one error code = one error" (see src/lib/errors.ts):
//   · every L???? code raised in supabase/sql has a translation in en.ts and es.ts;
//   · a code is never raised with two different messages;
//   · every dbErrors entry is a code the server can actually raise.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import en from '../i18n/locales/en'
import es from '../i18n/locales/es'
import { dbError, LpDbError } from './errors'

const SQL_DIR = join(__dirname, '..', '..', 'supabase', 'sql')

function sqlSources(): string[] {
  return readdirSync(SQL_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(SQL_DIR, f), 'utf8'))
}

const norm = (m: string) => m.replace(/''/g, "'").trim()

// code -> set of messages it is raised with
function raisedCodes(): Map<string, Set<string>> {
  const codes = new Map<string, Set<string>>()
  const add = (code: string, msg?: string) => {
    if (!codes.has(code)) codes.set(code, new Set())
    if (msg !== undefined) codes.get(code)!.add(norm(msg))
  }
  for (const src of sqlSources()) {
    // raise exception using errcode = 'LO005', message = format('Account %s appears twice', …)
    for (const m of src.matchAll(/errcode\s*=\s*'(L[A-Z]\d{3})'\s*,\s*message\s*=\s*(?:format\()?'((?:[^']|'')*)'/g)) {
      add(m[1]!, m[2]!)
    }
    // error_codes.sql catalog rows: ('<message>', '<old code>', 'LX001', …)
    for (const m of src.matchAll(/\(\s*'((?:[^']|'')*)'\s*,\s*'(?:22023|23514|P0001|P0002)'\s*,\s*'(L[A-Z]\d{3})'/g)) {
      add(m[2]!, m[1]!.replace(/''/g, "'"))
    }
    // codes handed to a helper, e.g. consume_monthly_quota(…, 'LQ001')
    for (const m of src.matchAll(/'(L[A-Z]\d{3})'/g)) add(m[1]!)
  }
  return codes
}

describe('server error codes', () => {
  const codes = raisedCodes()

  it('finds the codes', () => {
    expect(codes.size).toBeGreaterThan(40)
  })

  it('never uses one code for two different messages', () => {
    const shared = [...codes].filter(([, msgs]) => msgs.size > 1)
      .map(([code, msgs]) => `${code}: ${[...msgs].join(' | ')}`)
    expect(shared, shared.join('\n')).toEqual([])
  })

  it('translates every code in en and es', () => {
    const enErr = en.dbErrors as Record<string, string>
    const esErr = es.dbErrors as Record<string, string>
    const missing = [...codes.keys()].filter(c => !enErr[c] || !esErr[c])
    expect(missing, `No dbErrors entry for: ${missing.join(', ')}`).toEqual([])
  })

  it('dbError translates a coded error with the values from DETAIL', () => {
    const e = dbError({
      code: 'LO010', message: 'raw', hint: '',
      details: '{"debit": 10, "credit": 9, "difference": 1}',
    }, 'fallback')
    expect(e).toBeInstanceOf(LpDbError)
    expect((e as LpDbError).code).toBe('LO010')
    expect(e.message).toBe('Debits (10) and credits (9) must be equal — difference 1')
  })

  it('dbError still hides an uncoded database error', () => {
    const e = dbError({ code: '42P01', message: 'relation "x" does not exist', details: '', hint: '' }, 'Could not load')
    expect(e.message).toBe('Could not load')
  })

  it('has no translation for a code the server never raises', () => {
    const stale = Object.keys(en.dbErrors).filter(c => !codes.has(c))
    expect(stale, `dbErrors entries nothing raises: ${stale.join(', ')}`).toEqual([])
  })
})
