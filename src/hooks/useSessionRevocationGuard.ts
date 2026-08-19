// PATH: src/hooks/useSessionRevocationGuard.ts
//
// "Mayor seguridad" — realtime session revocation.
//
// While a user has an active session, listens for two kinds of LIVE
// changes via Supabase Realtime and forces an immediate sign-out + redirect
// the instant either happens — no waiting for a token refresh or a manual
// page reload to notice the user's access changed:
//
//   1. Their own `profiles` row: is_active -> false, OR system_role /
//      account_type changes.
//   2. Their `organization_memberships` row for the CURRENTLY ACTIVE org:
//      role changes, is_active -> false, or the row is deleted (removed
//      from the firm).
//
// Deliberately does NOT react to memberships in OTHER orgs the user
// belongs to but isn't currently using — those don't affect the
// permissions of the session they're in right now, and will simply be
// picked up fresh the next time they switch into that org.
//
// Safety notes:
//   · Both tables were added to the supabase_realtime publication via the
//     enable_realtime_session_guard migration.
//   · RLS on both tables restricts SELECT to the row's own owner (plus a
//     couple of broader org/admin policies) — but this hook's channel
//     filter (`id=eq.<userId>` / `user_id=eq.<userId>`) means it never
//     requests any row but the current user's own, regardless of what RLS
//     would otherwise allow it to see.
//   · The baseline used for comparison is captured ONCE per (userId, orgId)
//     pair at subscribe time. It is intentionally not kept in sync with
//     later legitimate profile/membership edits, because any change that
//     matters ends the session anyway — there's nothing to "update" the
//     baseline to.

import { useEffect, useRef } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/auth.store'
import { useOrgStore } from '../store/org.store'

interface ProfileGuardRow {
  is_active:    boolean
  system_role:  string
  account_type: string
}

interface MembershipGuardRow {
  id:        string
  org_id:    string
  role:      string
  is_active: boolean
}

type KickReason = 'deactivated' | 'role_changed' | 'removed_from_org'

export function useSessionRevocationGuard(): void {
  const userId          = useAuthStore(s => s.session?.user?.id ?? null)
  const profileSnapshot = useAuthStore(s => s.profile)
  const membershipSnapshot = useAuthStore(s => s.membership)
  const signOut          = useAuthStore(s => s.signOut)
  const activeOrgId      = useOrgStore(s => s.activeOrg?.id ?? null)

  const orgId = activeOrgId ?? membershipSnapshot?.org_id ?? null

  const baselineRef = useRef<{
    systemRole:     string | null
    accountType:    string | null
    membershipId:   string | null
    membershipRole: string | null
  } | null>(null)

  useEffect(() => {
    if (!userId) return

    baselineRef.current = {
      systemRole:     profileSnapshot?.system_role ?? null,
      accountType:    profileSnapshot?.account_type ?? null,
      membershipId:   membershipSnapshot?.id ?? null,
      membershipRole: membershipSnapshot?.role ?? null
    }

    function kick(reason: KickReason) {
      void signOut().finally(() => {
        window.location.href = `/login?reason=${reason}`
      })
    }

    const channel = supabase
      .channel(`session-guard-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<ProfileGuardRow>) => {
          const baseline = baselineRef.current
          const row = payload.new
          if (!baseline || !('is_active' in row)) return

          if (row.is_active === false) { kick('deactivated'); return }
          if (row.system_role !== baseline.systemRole) { kick('role_changed'); return }
          if (row.account_type !== baseline.accountType) { kick('role_changed'); return }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'organization_memberships', filter: `user_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<MembershipGuardRow>) => {
          const baseline = baselineRef.current
          if (!baseline || !orgId) return

          if (payload.eventType === 'DELETE') {
            const old = payload.old
            if ('id' in old && old.id === baseline.membershipId) kick('removed_from_org')
            return
          }

          const row = payload.new
          if (!('org_id' in row)) return
          if (row.org_id !== orgId) return // a different org's membership — irrelevant to this session

          if (row.is_active === false) { kick('removed_from_org'); return }
          if (row.role !== baseline.membershipRole) { kick('role_changed'); return }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
    // Baseline is intentionally captured once per (userId, orgId) pair — see
    // file header. Re-running only on identity/org changes is correct here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, orgId])
}
