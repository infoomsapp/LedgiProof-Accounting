import { create } from 'zustand'
import { db } from '../lib/supabase'
import { useAuthStore } from './auth.store'
import type { Organization, OrganizationMembership } from '../types/database.types'
import { toSafeMessage } from '../lib/errors'

// The workspace the person picked, remembered on this device. Without it a
// page reload fell back to the FIRST membership (usually the firm), so someone
// working in their personal books who refreshed kept working -- importing,
// categorizing -- in the firm's books without noticing.
const ACTIVE_ORG_KEY = 'lp-active-org'
function rememberedOrgId(): string | null {
  try { return localStorage.getItem(ACTIVE_ORG_KEY) } catch { return null }
}
function rememberOrgId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_ORG_KEY, id)
    else localStorage.removeItem(ACTIVE_ORG_KEY)
  } catch { /* private window / blocked storage: the first workspace is used */ }
}

interface OrgState {
  orgs: Organization[]
  activeOrg: Organization | null
  loading: boolean
  error: string | null

  loadOrgs: (userId: string) => Promise<void>
  setActiveOrg: (org: Organization, membership: OrganizationMembership) => void
  clearOrgState: () => void
}

export const useOrgStore = create<OrgState>((set, get) => ({
  orgs: [],
  activeOrg: null,
  loading: false,
  error: null,

  // ───────────────────────────────────────────────────────────────
  // LOAD ORGANIZATIONS
  // ───────────────────────────────────────────────────────────────
  loadOrgs: async (userId: string) => {
    set({ loading: true, error: null })

    // Se optimiza a una sola consulta relacional (Join) para evitar latencia N+1
    const { data, error: queryError } = await db
      .from('organization_memberships')
      .select(`
        *,
        organizations:org_id (*)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at')

    if (queryError) {
      set({
        loading: false,
        error: toSafeMessage(queryError, 'Could not load your workspaces'),
        orgs: [],
        activeOrg: null
      })
      return
    }

    if (!data || data.length === 0) {
      // Caso válido: cuentas de soporte o nuevos registros en onboarding
      useAuthStore.getState().setMembership(null)
      set({
        orgs: [],
        activeOrg: null,
        loading: false,
        error: null
      })
      return
    }

    // Mapeo estructurado garantizando la integridad de tipos sin castings forzados
    const memberships: OrganizationMembership[] = data.map(({ organizations, ...membership }) => membership)
    const orgList: Organization[] = data
      .map((d) => d.organizations as unknown as Organization)
      .filter((org): org is Organization => !!org)

    if (orgList.length === 0) {
      useAuthStore.getState().setMembership(null)
      set({
        orgs: [],
        activeOrg: null,
        loading: false,
        error: 'Memberships exist, but no organizations were returned (check RLS or data consistency)'
      })
      return
    }

    // Intentar preservar la organización activa si sigue siendo válida
    // (en memoria, o la que se eligió en este dispositivo antes de recargar)
    const currentActiveOrgId = get().activeOrg?.id ?? rememberedOrgId()
    let nextOrg: Organization | null = null
    let nextMembership: OrganizationMembership | null = null

    if (currentActiveOrgId) {
      const matchedOrg = orgList.find(o => o.id === currentActiveOrgId)
      const matchedMembership = memberships.find(m => m.org_id === currentActiveOrgId)

      if (matchedOrg && matchedMembership) {
        nextOrg = matchedOrg
        nextMembership = matchedMembership
      }
    }

    // Fallback al primer par válido de membresía/organización encontrado
    if (!nextOrg || !nextMembership) {
      for (const membership of memberships) {
        const org = orgList.find(o => o.id === membership.org_id)
        if (org) {
          nextOrg = org
          nextMembership = membership
          break
        }
      }
    }

    // Control de integridad crítica
    if (!nextOrg || !nextMembership) {
      useAuthStore.getState().setMembership(null)
      set({
        orgs: orgList,
        activeOrg: null,
        loading: false,
        error: 'Membership found but organization missing or blocked (check RLS or data consistency)'
      })
      return
    }

    // Sincronización atómica de los estados
    set({
      orgs: orgList,
      activeOrg: nextOrg,
      loading: false,
      error: null
    })
    rememberOrgId(nextOrg.id)

    useAuthStore.getState().setMembership(nextMembership)
  },

  // ───────────────────────────────────────────────────────────────
  // SET ACTIVE ORG MANUALLY
  // ───────────────────────────────────────────────────────────────
  setActiveOrg: (org, membership) => {
    set({
      activeOrg: org,
      error: null
    })
    rememberOrgId(org.id)
    useAuthStore.getState().setMembership(membership)
  },

  // ───────────────────────────────────────────────────────────────
  // CLEAR ORG STATE
  // ───────────────────────────────────────────────────────────────
  clearOrgState: () => {
    rememberOrgId(null)
    set({
      orgs: [],
      activeOrg: null,
      loading: false,
      error: null
    })
  }
}))