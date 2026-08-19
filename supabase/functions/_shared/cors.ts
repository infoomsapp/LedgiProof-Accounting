// PATH: supabase/functions/_shared/cors.ts
//
// Shared CORS helpers for all Edge Functions.
// Use getCorsHeaders(req) in responses to restrict to known origins.

const ALLOWED_ORIGINS = new Set([
  'https://ledgiproof.com',
  'https://app.ledgiproof.com',
  'http://localhost:5173',
  'http://localhost:4173',
])

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://ledgiproof.com'
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

// Backward-compatible alias — used by functions that haven't migrated yet.
// NOTE: This still allows all origins and should be replaced with getCorsHeaders(req).
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
