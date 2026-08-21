// PATH: src/store/client-portal.store.ts
//
// A person invited to a bookkeeper/accountant's client portal is NOT an org
// member — their access lives entirely in client_portal_users (org_id,
// client_id, profile_id, role), a separate table from organization_memberships.
// This store is the equivalent of org.store.ts for that relationship: it
// answers "which client portals does this person have access to" so
// App.tsx can route them correctly even though useOrgStore's `orgs` array
// is (and should stay) empty for them.
//
// client_portal_users' unique constraint is (client_id, profile_id), not
// (profile_id) alone — one person can be invited by multiple firms/clients
// at once. `memberships` is always the full list; `activeMembershipId`
// picks which one is "in view" right now, persisted so a reload doesn't
// silently reset it back to whichever the query happens to return first.

import { create } from 'zustand'
import { db } from '../lib/supabase'

const ACTIVE_MEMBERSHIP_STORAGE_KEY = 'lp_portal_active_membership'

export interface ClientPortalMembership {
  membershipId: string
  orgId:        string
  orgName:      string
  clientId:     string
  clientName:   string
  role:         'client_owner' | 'client_contact' | 'client_viewer'
}

interface ClientPortalState {
  memberships:        ClientPortalMembership[]
  activeMembershipId: string | null
  loading:            boolean

  loadMemberships:     (userId: string) => Promise<void>
  setActiveMembership: (id: string) => void
  clearClientPortalState: () => void
}

interface RawRow {
  membership_id: string
  org_id:        string
  org_name:      string | null
  client_id:     string
  client_name:   string | null
  role:          ClientPortalMembership['role']
}

export const useClientPortalStore = create<ClientPortalState>((set, get) => ({
  memberships: [],
  activeMembershipId: null,
  loading: false,

  loadMemberships: async (userId: string) => {
    set({ loading: true })

    // A direct table select (client_portal_users joined to clients/
    // organizations) silently returns null for those embedded relations —
    // clients/organizations RLS only grants staff (is_org_member), no
    // exception for client_portal_users, and PostgREST doesn't surface that
    // as an error, just an empty embed. Scoped RPC instead, matching every
    // other client-portal read in this feature (get_workspace_inbox,
    // register_document, etc.) rather than broadening RLS on two
    // widely-joined core tables. userId isn't needed as an argument (the
    // RPC scopes to auth.uid() itself) — kept in the signature to match
    // org.store.ts's loadOrgs(userId) call-site convention.
    const { data, error } = await db.rpc('get_client_portal_memberships')

    if (error || !data) {
      set({ memberships: [], activeMembershipId: null, loading: false })
      return
    }

    const memberships: ClientPortalMembership[] = (data as unknown as RawRow[]).map(row => ({
      membershipId: row.membership_id,
      orgId:        row.org_id,
      orgName:      row.org_name ?? 'Workspace',
      clientId:     row.client_id,
      clientName:   row.client_name ?? 'Client',
      role:         row.role
    }))

    // Preserve the persisted active membership if it's still valid; otherwise
    // default to the first one. A stale localStorage value (e.g. the firm
    // revoked access) just falls back rather than pointing at nothing.
    const storedId = window.localStorage.getItem(ACTIVE_MEMBERSHIP_STORAGE_KEY)
    const nextActiveId =
      (storedId && memberships.some(m => m.membershipId === storedId))
        ? storedId
        : (memberships[0]?.membershipId ?? null)

    set({ memberships, activeMembershipId: nextActiveId, loading: false })
  },

  setActiveMembership: (id: string) => {
    if (!get().memberships.some(m => m.membershipId === id)) return
    window.localStorage.setItem(ACTIVE_MEMBERSHIP_STORAGE_KEY, id)
    set({ activeMembershipId: id })
  },

  clearClientPortalState: () => {
    set({ memberships: [], activeMembershipId: null, loading: false })
  }
}))
