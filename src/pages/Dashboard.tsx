// PATH: src/pages/Dashboard.tsx
//
// Dashboard ROUTER. Picks the correct dashboard based on the user's
// system_role + account_type + ACTIVE ORG CATEGORY.
//
// Decision tree (in priority order):
//   1. system_role = 'auditor'                              → ReadOnlyDashboard
//   2. account_type = 'pyme_client'                         → PymeDashboard
//   3. Professional + activeOrg.is_personal                 → SoloDashboard
//      (Bookkeeper OR Accountant in their personal org — Phase 1 reuses SoloDashboard;
//       Phase 2 will introduce AccountantPersonalDashboard for CPA-specific personal view.)
//   4. 🆕 v44: Professional + activeOrg.is_accountant_firm  → AccountantDashboard
//   5. Professional (any other firm/org)                    → BookkeeperDashboard
//   6. Fallback (self_employed / user)                      → SoloDashboard

import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth.store'
import { useOrgStore }  from '../store/org.store'
import { isPersonalOrg } from '../lib/org-helpers'
import type { AccountType } from '../types/database.types'

import SoloDashboard        from './SoloDashboard'
import BookkeeperDashboard  from './BookkeeperDashboard'
import AccountantDashboard  from './AccountantDashboard'
import PymeDashboard        from './PymeDashboard'
import ReadOnlyDashboard    from './ReadOnlyDashboard'

const PROFESSIONAL_ROLES = ['super_admin', 'admin', 'bookkeeper'] as const

export default function Dashboard() {
  const { t }         = useTranslation()
  const { profile }   = useAuthStore()
  const { activeOrg } = useOrgStore()

  if (!profile) {
    return (
      <div style={{
        padding: 48, textAlign: 'center',
        color: 'var(--lp-text-muted)', fontSize: 13
      }}>
        {t('dashboard.loadingProfile')}
      </div>
    )
  }

  const systemRole  = profile.system_role
  const accountType: AccountType = (profile.account_type as AccountType) ?? 'self_employed'

  // 1. Auditor → ReadOnly (role overrides type)
  if (systemRole === 'auditor') {
    return <ReadOnlyDashboard />
  }

  // 2. PYME client → portal view. user_type is the authoritative signal --
  // accept_client_portal_invitation() always sets it to 'client_user' the
  // moment someone accepts a portal invite, even when their profile
  // predates that (e.g. an account originally created as staff). It never
  // touches account_type/system_role, so a profile can be a real, active
  // portal client while still carrying its old 'bookkeeper' account_type --
  // checking account_type alone routed that account into the staff-side
  // dashboards (which then correctly denied every staff-only write via RLS)
  // instead of the portal view it actually has access to.
  if (accountType === 'pyme_client' || profile.user_type === 'client_user') {
    return <PymeDashboard />
  }

  // 3. Professional viewing their PERSONAL org → SoloDashboard
  const isProfessional =
    systemRole && (PROFESSIONAL_ROLES as readonly string[]).includes(systemRole)

  if (isProfessional && isPersonalOrg(activeOrg, accountType)) {
    return <SoloDashboard />
  }

  // 4. 🆕 v44: Professional in ACCOUNTANT FIRM → AccountantDashboard
  //    Distinguishes Controller-firm (CPA) from Bookkeeper-firm (Bookkeeper).
  //    Must be checked BEFORE the generic professional branch below.
  if (isProfessional && activeOrg?.is_accountant_firm === true) {
    return <AccountantDashboard />
  }

  // 4.5. 🆕 View As: Professional (e.g. super_admin impersonating) viewing a
  //      PYME/CLIENT org → PymeDashboard. Mirrors the is_personal /
  //      is_accountant_firm checks above but reads the ORG's own category
  //      instead of the actor's account_type. Needed because step 2 only
  //      catches a REAL pyme_client user viewing their own dashboard — a
  //      super_admin's account_type is never 'pyme_client', so without this
  //      check, View As on a PYME org would silently fall through to
  //      BookkeeperDashboard instead of the correct PymeDashboard.
  if (isProfessional && activeOrg?.is_client === true) {
    return <PymeDashboard />
  }

  // 5. Professional roles → bookkeeper dashboard (default firm view)
  if (isProfessional) {
    return <BookkeeperDashboard />
  }

  // 6. Fallback: self-employed / regular user
  return <SoloDashboard />
}