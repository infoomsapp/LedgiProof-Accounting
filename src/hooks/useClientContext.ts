// PATH: src/hooks/useClientContext.ts

import { useAuthStore } from '../store/auth.store'
import { useImpersonationStore } from '../store/impersonation.store'

export type UserType = 'staff_user' | 'client_user'

export interface ClientContext {
  userType: UserType
  clientId: string | null
  orgId: string | null
  isClient: boolean
  isStaff: boolean
  isImpersonating: boolean
  loading: boolean
}

interface ProfileWithClientFields {
  id?: string | null
  user_type?: string | null
  client_id?: string | null
}

export function useClientContext(): ClientContext {
  const { profile, membership, loading } = useAuthStore()
  const { targetClientId, isImpersonating } = useImpersonationStore()

  const p = (profile ?? null) as ProfileWithClientFields | null

  const rawUserType = p?.user_type
  const rawClientId = p?.client_id ?? null
  const orgId = membership?.org_id ?? null

  // ── BASE USER TYPE ────────────────────────────────────────────
  const baseUserType: UserType =
    rawUserType === 'client_user' ? 'client_user' : 'staff_user'

  // ── IMPERSONATION LOGIC (CRITICAL) ────────────────────────────
  const impersonating = isImpersonating()

  // Effective client ID
  const effectiveClientId = impersonating
    ? targetClientId
    : rawClientId

  // Effective role
  const isClient = !!effectiveClientId
  const isStaff = !isClient

  return {
    userType: isClient ? 'client_user' : baseUserType,
    clientId: effectiveClientId,
    orgId,
    isClient,
    isStaff,
    isImpersonating: impersonating,
    loading
  }
}