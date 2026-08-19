// PATH: src/hooks/useViewAs.ts
//
// The real "View as" mechanism. Before this hook, enterAdminView() only
// wrote labels into impersonation.store for the banner — useOrgStore's
// activeOrg never changed, so Dashboard.tsx kept rendering the super_admin's
// OWN context (which, as of the support@ledgiproof.com change, doesn't even
// exist). This hook is what actually makes View As show the target's real
// Solo/Bookkeeper/Accountant/PYME dashboard with real data.
//
// Read-only by design: the synthetic membership role is always 'readonly'.
// The super_admin has no real organization_memberships row for the target
// org, so any write attempt through the normal customer-facing services
// (which go through the user-scoped Supabase client, RLS-enforced) fails
// naturally — the same way it would for any non-member. This hook does not
// grant write access; it only grants the READ visibility needed to render
// the target's screens, via the admin-gated RPCs already used elsewhere.

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrgStore } from '../store/org.store'
import { useImpersonationStore } from '../store/impersonation.store'
import { adminGetOrganizations, adminGetUserOrgContext } from '../services/admin.service'
import type { Organization, OrganizationMembership } from '../types/database.types'

function syntheticMembership(orgId: string): OrganizationMembership {
  const now = new Date().toISOString()
  return {
    id:              `view-as-${orgId}`,
    org_id:          orgId,
    user_id:         'view-as-synthetic',
    role:            'readonly',
    approval_limit:  null,
    is_active:       true,
    created_at:      now,
    updated_at:      now
  }
}

export interface UseViewAs {
  viewAsOrg:  (orgId: string, opts?: { navigateTo?: string }) => Promise<void>
  viewAsUser: (userId: string, userName?: string | null, opts?: { navigateTo?: string }) => Promise<void>
  exitViewAs: () => void
  loading:    boolean
}

export function useViewAs(): UseViewAs {
  const navigate       = useNavigate()
  const setActiveOrg   = useOrgStore(s => s.setActiveOrg)
  const clearOrgState  = useOrgStore(s => s.clearOrgState)
  const enterAdminView = useImpersonationStore(s => s.enterAdminView)
  const exitAdminView  = useImpersonationStore(s => s.exitAdminView)

  const viewAsOrg = useCallback(async (orgId: string, opts?: { navigateTo?: string }) => {
    // adminGetOrganizations() returns every active org (already
    // super_admin-gated + logged to impersonation_audit) — filter
    // client-side rather than adding another single-purpose RPC.
    const orgs = await adminGetOrganizations()
    const target = orgs.find(o => o.id === orgId)
    if (!target) throw new Error('Organization not found')

    setActiveOrg(target as Organization, syntheticMembership(orgId))
    enterAdminView({
      targetOrgId:   target.id,
      targetOrgName: target.name
    })
    navigate(opts?.navigateTo ?? '/')
  }, [setActiveOrg, enterAdminView, navigate])

  const viewAsUser = useCallback(async (
    userId: string,
    userName?: string | null,
    opts?: { navigateTo?: string }
  ) => {
    const ctx = await adminGetUserOrgContext(userId)
    if (!ctx) {
      throw new Error('This user has no active organization to view')
    }

    const orgs = await adminGetOrganizations()
    const target = orgs.find(o => o.id === ctx.org_id)
    if (!target) throw new Error('Organization not found')

    setActiveOrg(target as Organization, syntheticMembership(ctx.org_id))
    enterAdminView({
      targetUserId:  userId,
      targetOrgId:   target.id,
      targetOrgName: target.name,
      ...(userName ? { targetUserName: userName } : {})
    })
    navigate(opts?.navigateTo ?? '/')
  }, [setActiveOrg, enterAdminView, navigate])

  const exitViewAs = useCallback(() => {
    exitAdminView()
    // The support account has no orgs of its own — go back to an empty
    // org state rather than re-fetching (there's nothing to fetch).
    clearOrgState()
    navigate('/')
  }, [exitAdminView, clearOrgState, navigate])

  return { viewAsOrg, viewAsUser, exitViewAs, loading: false }
}
