// PATH: supabase/functions/_shared/errors.ts
//
// Same purpose as src/lib/errors.ts, mirrored for the Edge Function (Deno)
// runtime — these run with the service_role key, so a raw Postgres error
// making it into an HTTP response body is worse here than on the client:
// service-role queries aren't bounded by RLS, so their error text can
// describe more of the schema than a client-side query ever could.
//
// Usage — replace `return fail(err.message, 500, cors)` / `{error: String(err)}`
// style responses with:
//   catch (err: unknown) {
//     console.error('[my-function]', err)
//     return fail(safeMessage(err, 'Failed to do the thing'), 500, cors)
//   }

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
  if ('details' in e && 'hint' in e) return true
  const code = e.code
  if (typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST'))) return true
  return false
}

const CODE_MESSAGES: Record<string, string> = {
  '23505': 'This already exists.',
  '23503': "This can't be completed because it's linked to other records.",
  '23514': "That value isn't allowed for this field.",
  '42501': "You don't have permission to do that.",
  '22P02': 'One of the values entered is not valid.',
  'PGRST116': 'Not found.',
}

/**
 * Returns a message safe to put in an HTTP response body. Callers should
 * console.error the real `err` themselves right before calling this (Edge
 * Function logs are operator-only — safe to be verbose there), same as the
 * existing `console.error('[fn-name]', msg)` convention already used in
 * every function's catch block.
 */
export function safeMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (looksLikeDbError(err)) {
    const code = err.code ?? ''
    return CODE_MESSAGES[code] ?? fallback
  }
  if (err instanceof Error) {
    // A same-file `throw new Error('Invoice is already paid')`-style message
    // this function authored on purpose — never DB-shaped, safe as-is.
    return err.message
  }
  return fallback
}
