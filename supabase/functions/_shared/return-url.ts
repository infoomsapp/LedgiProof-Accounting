// PATH: supabase/functions/_shared/return-url.ts
//
// Where a Stripe-hosted page (checkout, Connect onboarding) may send the
// browser back to. Without this check, a crafted request could turn a
// LedgiProof checkout into a redirect to any site.
//
// Same origins as cors.ts, plus any listed in the APP_ORIGINS secret
// (comma-separated) -- set it once the app has its own domain:
//   supabase secrets set APP_ORIGINS=https://app.example.com

const BASE_ORIGINS = [
  'https://ledgiproof.com',
  'https://app.ledgiproof.com',
  'http://localhost:5173',
  'http://localhost:4173',
]

export function isAllowedReturnUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  const extra = (Deno.env.get('APP_ORIGINS') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return [...BASE_ORIGINS, ...extra].includes(url.origin)
}
