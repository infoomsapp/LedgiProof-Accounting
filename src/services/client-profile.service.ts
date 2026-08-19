// PATH: src/services/client-profile.service.ts
//
// P4 Fase 2.C — Audiencia A — Profile operations for the external client user.
//
// What the client CAN do on their own profile:
//   · Read display_name, email, phone, lp_user_code
//   · Update display_name, phone
//
// What the client CANNOT do (intentionally):
//   · Change email — requires reverification flow (out of scope this sprint)
//   · Change role / system_role — server-side enforced via RLS
//   · Edit the underlying `clients` record — that's the bookkeeper's job
//
// Security: relies on RLS policies on `profiles` table where a row is
// readable/updatable only by the user whose id matches auth.uid().

import { db } from '../lib/supabase'
import type { Database } from '../types/database.types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export interface ClientProfile {
  id:            string
  display_name:  string | null
  email:         string | null
  phone:         string | null
  lp_user_code:  string | null
  updated_at:    string | null
}

/**
 * Fetch the currently authenticated user's profile row.
 * Returns null if no profile row exists (shouldn't happen post-signup).
 */
export async function getMyProfile(): Promise<ClientProfile | null> {
  const { data: userResp, error: userErr } = await db.auth.getUser()
  if (userErr) throw new Error(userErr.message)

  const userId = userResp.user?.id
  if (!userId) throw new Error('Not authenticated')

  const { data, error } = await db
    .from('profiles')
    .select('id, display_name, email, phone, lp_user_code, updated_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as ClientProfile | null) ?? null
}

/**
 * Update the user's editable profile fields.
 * Trims input. Empty strings become NULL to keep the column clean.
 */
export async function updateMyProfile(input: {
  display_name?: string
  phone?:        string
}): Promise<ClientProfile> {
  const { data: userResp, error: userErr } = await db.auth.getUser()
  if (userErr) throw new Error(userErr.message)

  const userId = userResp.user?.id
  if (!userId) throw new Error('Not authenticated')

  const patch: ProfileUpdate = {}
  if (input.display_name !== undefined) {
    const v = input.display_name.trim()
    patch.display_name = v === '' ? null : v
  }
  if (input.phone !== undefined) {
    const v = input.phone.trim()
    patch.phone = v === '' ? null : v
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('No fields to update')
  }

  const { data, error } = await db
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('id, display_name, email, phone, lp_user_code, updated_at')
    .single()

  if (error) throw new Error(error.message)
  return data as ClientProfile
}
