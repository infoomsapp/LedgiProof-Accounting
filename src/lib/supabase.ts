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
    },
    global: {
      headers: {
        'x-app-name':    'LedgiProof',
        'x-app-version': import.meta.env.VITE_APP_VERSION ?? '0.1.0'
      }
    }
  }
)

// Typed alias for convenience
export const db = supabase

// Returns the UUID of the currently authenticated user, or null
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}