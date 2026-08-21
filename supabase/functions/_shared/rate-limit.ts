// PATH: supabase/functions/_shared/rate-limit.ts
//
// Minimal fixed-window rate limiter backed by public.rate_limit_events.
// Only ever called with a service-role Supabase client (RLS is enabled on
// the table with no policies, so anon/authenticated callers can't touch it).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Returns true if the call is allowed (and records it), false if the caller
// has hit `maxCount` events for `key` within the trailing `windowSeconds`.
export async function checkRateLimit(
  supabaseAdmin: SupabaseClient,
  key: string,
  maxCount: number,
  windowSeconds: number
): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString()

  const { count, error } = await supabaseAdmin
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', since)

  if (error) {
    // Fail open — a broken rate limiter shouldn't take down the feature it's guarding.
    console.warn('[rate-limit] check failed, allowing:', error.message)
    return true
  }

  if ((count ?? 0) >= maxCount) return false

  await supabaseAdmin.from('rate_limit_events').insert({ key })
  return true
}
