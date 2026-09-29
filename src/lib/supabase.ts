import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[LedgiProof] Missing Supabase environment variables.\n' +
    '.env and fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY'
  )
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: false  // desktop app — no URL-based OAuth redirects
    }
    // No custom global headers: supabase-js sends them on Edge Function calls
    // too, and a header the functions' CORS preflight doesn't list (it used to
    // send x-app-name / x-app-version) makes the browser block EVERY function
    // call -- AI suggestions, receipt OCR, sending invoices, Stripe, certify.
    // Nothing on the server read them.
  }
)

// Typed alias for convenience
export const db = supabase

// Returns the UUID of the currently authenticated user, or null
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}