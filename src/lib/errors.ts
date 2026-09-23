// PATH: src/lib/errors.ts
//
// Prevents raw database error detail (table/column/constraint names, SQL
// error text, RLS policy internals) from ever reaching an end user.
//
// The problem this fixes: a Supabase/PostgREST error object carries
// `.message`/`.details`/`.hint`/`.code` straight from Postgres. Once that
// gets wrapped as `throw new Error(error.message)` (the pattern used
// throughout this codebase before this file existed), the `.code`/`.details`
// that would let anything downstream recognize "this is a raw DB error" is
// already gone — so sanitizing has to happen at the exact point a Supabase
// `{ data, error }` result is first checked, not later at the UI boundary.
//
// Usage — replace `throw new Error(error.message)` with:
//   if (error) throw dbError(error, 'Failed to load clients')
// The fallback should describe what the caller was trying to do, in plain
// language a user would recognize — it's what they'll see if the real cause
// isn't safe to show. A caught error that's already a plain Error (i.e.
// something this codebase authored on purpose, like "Invoice is already
// paid") passes through unchanged — this only strips detail from genuine
// database-shaped errors.

interface PostgrestLikeError {
  message: string
  code?:    string | null
  details?: string | null
  hint?:    string | null
}

function looksLikeDbError(err: unknown): err is PostgrestLikeError {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  if (typeof e.message !== 'string') return false
  // PostgrestError always carries details/hint (even if empty strings), a
  // plain `new Error('...')` never does — the most reliable signal.
  if ('details' in e && 'hint' in e) return true
  // Postgres SQLSTATE codes are exactly 5 chars (e.g. "23505"); PostgREST's
  // own codes are prefixed "PGRST".
  const code = e.code
  if (typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST'))) return true
  return false
}

// A handful of common codes get a specific, still-safe message instead of
// the generic fallback — everything else (the vast majority: internal
// constraint names, schema details, etc.) falls back to the caller-supplied
// description of what they were trying to do.
const CODE_MESSAGES: Record<string, string> = {
  '23505': 'This already exists.',
  '23503': "This can't be completed because it's linked to other records.",
  '23514': "That value isn't allowed for this field.",
  '42501': "You don't have permission to do that.",
  '22P02': 'One of the values entered is not valid.',
  'PGRST116': 'Not found.',
}

/**
 * Wrap a caught Supabase/Postgres error into a safe Error to throw or display.
 * Always logs the real error to the console (never silently dropped) — only
 * what reaches the caller's return value is sanitized.
 */
export function dbError(err: unknown, fallback = 'Something went wrong. Please try again.'): Error {
  if (looksLikeDbError(err)) {
    console.error('[db error]', err)
    const code = err.code ?? ''
    return new Error(CODE_MESSAGES[code] ?? fallback)
  }
  if (err instanceof Error) return err
  console.error('[unexpected error]', err)
  return new Error(fallback)
}

/** Same sanitization, returning just the message — for a generic `catch (e)` that only needs text to display. */
export function toSafeMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return dbError(err, fallback).message
}
