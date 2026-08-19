// PATH: src/hooks/useUserRole.ts
//
// Single source of truth for "what kind of user is this and what can they do".
// Used by Settings tabs, Dashboard router, and Controller-level features.
//
// 🆕 v45 — Accountant Firm + Controller capabilities:
//   · Reads organizations.is_accountant_firm (v44) to identify firm kind.
//   · Derives canPostJournalEntries / canClosePeriods / canReverseManualBatch
//     based on lp_role within the org (Controller is lp_role='accountant').
//   · canReopenClosedPeriod restricted to super_admin (matches DB trigger
//     enforcement in v45.enforce_period_transition).

import { useMemo } from 'react'
import { useAuthStore } from '../store/auth.store'
import { useOrgStore }  from '../store/org.store'
import { useImpersonationStore } from '../store/impersonation.store'
import type { LpRole } from '../types/database.types'

export type UserKind =
  | 'super_admin'
  | 'bookkeeper_owner'    // owner of a bookkeeping firm
  | 'bookkeeper_admin'    // admin of a bookkeeping firm (not owner)
  | 'bookkeeper_staff'    // accountant/auditor/approver/readonly in a bookkeeping firm
  | 'accountant_owner'    // 🆕 owner of an accountant firm (Partner)
  | 'accountant_admin'    // 🆕 admin of an accountant firm
  | 'accountant_staff'    // 🆕 controller / senior in an accountant firm
  | 'solo_owner'          // self-employed, single-user workspace
  | 'pyme_owner'          // PYME client, owner of their company workspace
  | 'pyme_staff'          // PYME client staff (non-owner)
  | 'unknown'

export interface UserRoleInfo {
  kind:           UserKind
  systemRole:     string | null           // super_admin / admin / bookkeeper / client / auditor
  accountType:    string | null           // self_employed / bookkeeper / pyme_client
  workspaceRole:  LpRole | null           // owner / admin / accountant / auditor / approver / readonly
  workspaceKind:  'solo' | 'pro' | null

  // 🆕 v44 — Firm type discriminator
  isAccountantFirm: boolean               // true when activeOrg.is_accountant_firm = true
  isBookkeeperFirm: boolean               // true when activeOrg.is_firm = true AND is_accountant_firm = false

  // Loading / readiness
  loading:        boolean                 // true while auth/profile still resolving
  ready:          boolean                 // true when `kind` can be trusted

  // Capability flags (derived)
  isSuperAdmin:        boolean
  isWorkspaceOwner:    boolean
  isWorkspaceAdmin:    boolean
  canEditWorkspace:    boolean   // owner OR admin OR super_admin
  canEditTaxInfo:      boolean   // owner OR super_admin
  canViewUsersTab:     boolean   // super_admin OR bookkeeper/accountant owner
  canManageTiers:      boolean   // super_admin only
  showBillingTab:      boolean   // owners only (any workspace)

  // 🆕 v45 — Controller-level capabilities
  // canPostJournalEntries: post manual journal batches (adjustments, depreciations, closings).
  //   Required: lp_role IN ('owner', 'admin', 'accountant') in an accountant firm,
  //             OR super_admin globally.
  canPostJournalEntries:   boolean

  // canClosePeriods: transition period_controls OPEN → ADJUSTMENT → CLOSED.
  //   Required: lp_role IN ('owner', 'admin', 'accountant') in an accountant firm,
  //             OR super_admin globally.
  canClosePeriods:         boolean

  // canReverseManualBatch: post a reversal batch against a posted batch.
  //   Required: same as canPostJournalEntries (it IS a journal post).
  canReverseManualBatch:   boolean

  // canReopenClosedPeriod: transition CLOSED → OPEN. Restricted to super_admin
  //   to match the v45 DB trigger enforcement.
  canReopenClosedPeriod:   boolean

  // canApproveManualBatch: set manual_journal_batches.approved_by (segregation
  //   of duties). Owner/admin only — preparer cannot approve their own batch
  //   (the UI must additionally check prepared_by != current user).
  canApproveManualBatch:   boolean

  // 🆕 Payroll (LedgiProof Payroll — Check-embedded) — launch scope VA/MD/DC/
  //   PA/DE/WV only, Solo profile explicitly excluded per founder decision.
  //
  // canRunPayroll: configure the employer profile/account mapping, manage
  //   employees, create/approve payroll runs, and trigger Check onboarding.
  //   Mirrors the payroll_* write RPCs' own authorize(['owner','admin'])
  //   gate — this flag is UI convenience, the RPC is the real enforcement.
  //   Solo is excluded even though solo_owner technically has "owner" role,
  //   because Payroll is out of scope for that profile for now.
  canRunPayroll:           boolean

  // canViewPayroll: read-only visibility into payroll data (employees, runs,
  //   pay stubs). Mirrors the broader payroll_* read RPCs' own
  //   authorize(['owner','admin','accountant','auditor']) gate. Superset of
  //   canRunPayroll.
  canViewPayroll:          boolean
}

export function useUserRole(): UserRoleInfo {
  const { profile, membership, loading: authLoading } = useAuthStore()
  const { activeOrg }                                 = useOrgStore()
  const isImpersonating = useImpersonationStore(s => s.isImpersonating())

  return useMemo(() => {
    const systemRole    = profile?.system_role ?? null
    const accountType   = profile?.account_type ?? null
    const workspaceRole = (membership?.role as LpRole) ?? null
    const workspaceKind = (profile as { workspace_kind?: 'solo' | 'pro' })?.workspace_kind ?? null

    // 🆕 v44 — firm type (already target-org-driven via activeOrg, so these
    // stay correct during View As without any extra handling)
    const isAccountantFirm = !!activeOrg?.is_accountant_firm
    const isBookkeeperFirm = !!activeOrg?.is_firm && !isAccountantFirm

    // 🆕 View As: isSuperAdmin must NOT stay true while impersonating —
    // otherwise every kind-gated / capability flag below (Settings tabs,
    // canPostJournalEntries, canReopenClosedPeriod, etc.) would keep
    // evaluating as the actor's own super_admin powers instead of the
    // target's, defeating the whole point of a read-only simulated view.
    // Same fix pattern as AppShell's isSuperAdmin.
    const isSuperAdmin     = systemRole === 'super_admin' && !isImpersonating
    const isWorkspaceOwner = workspaceRole === 'owner'
    const isWorkspaceAdmin = workspaceRole === 'admin'

    // ── Determine "kind" ───────────────────────────────────────────────
    let kind: UserKind = 'unknown'

    if (isSuperAdmin) {
      kind = 'super_admin'
    } else if (isImpersonating) {
      // View As: derive kind from the TARGET org's own category (activeOrg
      // flags), never the actor's profile — the actor is always
      // support@ledgiproof.com, whose accountType/systemRole describe
      // nothing about whatever org is currently being viewed. workspaceRole
      // here comes from the synthetic 'readonly' membership set by
      // useViewAs(), so isWorkspaceOwner/Admin are correctly false —
      // resolving to the *_staff variants, which matches the read-only
      // intent of View As.
      if (activeOrg?.is_client === true) {
        kind = isWorkspaceOwner ? 'pyme_owner' : 'pyme_staff'
      } else if (isAccountantFirm) {
        kind = isWorkspaceOwner ? 'accountant_owner'
          : isWorkspaceAdmin    ? 'accountant_admin'
          : 'accountant_staff'
      } else if (isBookkeeperFirm) {
        kind = isWorkspaceOwner ? 'bookkeeper_owner'
          : isWorkspaceAdmin    ? 'bookkeeper_admin'
          : 'bookkeeper_staff'
      } else {
        // is_personal or unknown → solo view (safest read-only default)
        kind = 'solo_owner'
      }
    } else if (accountType === 'self_employed' || workspaceKind === 'solo') {
      kind = 'solo_owner'
    } else if (accountType === 'pyme_client') {
      kind = isWorkspaceOwner ? 'pyme_owner' : 'pyme_staff'
    } else if (isAccountantFirm) {
      // 🆕 v44 — Accountant firm branch
      kind = isWorkspaceOwner ? 'accountant_owner'
        : isWorkspaceAdmin    ? 'accountant_admin'
        : 'accountant_staff'
    } else if (systemRole === 'bookkeeper' || systemRole === 'admin') {
      kind = isWorkspaceOwner ? 'bookkeeper_owner'
        : isWorkspaceAdmin    ? 'bookkeeper_admin'
        : 'bookkeeper_staff'
    } else if (systemRole === 'auditor') {
      kind = 'bookkeeper_staff'
    } else if (systemRole === 'client') {
      kind = isWorkspaceOwner ? 'pyme_owner' : 'pyme_staff'
    }

    // ── Base capabilities ──────────────────────────────────────────────
    const canEditWorkspace = isSuperAdmin || isWorkspaceOwner || isWorkspaceAdmin
    const canEditTaxInfo   = isSuperAdmin || isWorkspaceOwner
    const canViewUsersTab  = isSuperAdmin
                           || kind === 'bookkeeper_owner'
                           || kind === 'accountant_owner'
    const canManageTiers   = isSuperAdmin
    const showBillingTab   = isSuperAdmin || isWorkspaceOwner

    // ── 🆕 v45 — Controller capabilities ───────────────────────────────
    // A user can post manual journal entries when:
    //   · They are super_admin (override), OR
    //   · They are in an accountant firm with lp_role IN (owner, admin, accountant)
    // The lp_role 'accountant' here is the per-org role (Controller), NOT
    // the system_role enum (which doesn't even have 'accountant').
    const isControllerInAccountantFirm =
      isAccountantFirm &&
      (workspaceRole === 'owner' ||
       workspaceRole === 'admin' ||
       workspaceRole === 'accountant')

    const canPostJournalEntries = isSuperAdmin || isControllerInAccountantFirm
    const canClosePeriods       = isSuperAdmin || isControllerInAccountantFirm
    const canReverseManualBatch = isSuperAdmin || isControllerInAccountantFirm

    // CLOSED → OPEN is super_admin only (matches v45 DB trigger)
    const canReopenClosedPeriod = isSuperAdmin

    // Approval segregation: owner/admin only.
    // UI must ALSO check prepared_by !== current user before showing approve button.
    const canApproveManualBatch = isAccountantFirm && (isWorkspaceOwner || isWorkspaceAdmin)

    // ── 🆕 Payroll capabilities ─────────────────────────────────────────
    // Eligible kinds: bookkeeper/accountant owner+admin (managing a client's
    // payroll) and pyme_owner (running their own). solo_owner is
    // deliberately excluded — Payroll is out of scope for that profile.
    // *_staff kinds never satisfy isWorkspaceOwner/isWorkspaceAdmin (their
    // lp_role is accountant/auditor/approver/readonly), so they fall
    // through to canViewPayroll only, matching the RPCs' own broader read
    // authorize(['owner','admin','accountant','auditor']) list.
    const isPayrollEligibleOrgKind =
      kind === 'bookkeeper_owner' || kind === 'bookkeeper_admin' ||
      kind === 'accountant_owner' || kind === 'accountant_admin' ||
      kind === 'pyme_owner'

    const canRunPayroll = isSuperAdmin ||
      (isPayrollEligibleOrgKind && (isWorkspaceOwner || isWorkspaceAdmin))

    const canViewPayroll = canRunPayroll ||
      kind === 'bookkeeper_staff' || kind === 'accountant_staff' || kind === 'pyme_staff'

    return {
      kind,
      systemRole,
      accountType,
      workspaceRole,
      workspaceKind,
      isAccountantFirm,
      isBookkeeperFirm,
      loading:          authLoading,
      ready:            !authLoading && kind !== 'unknown',
      isSuperAdmin,
      isWorkspaceOwner,
      isWorkspaceAdmin,
      canEditWorkspace,
      canEditTaxInfo,
      canViewUsersTab,
      canManageTiers,
      showBillingTab,
      canPostJournalEntries,
      canClosePeriods,
      canReverseManualBatch,
      canReopenClosedPeriod,
      canApproveManualBatch,
      canRunPayroll,
      canViewPayroll
    }
  }, [
    profile?.system_role,
    profile?.account_type,
    (profile as { workspace_kind?: 'solo' | 'pro' })?.workspace_kind,
    membership?.role,
    activeOrg?.is_firm,
    activeOrg?.is_accountant_firm,
    activeOrg?.is_client,
    activeOrg?.is_personal,
    isImpersonating,
    authLoading
  ])
}

// ── Friendly labels for UI ────────────────────────────────────────────────────

export const USER_KIND_LABELS: Record<UserKind, string> = {
  super_admin:       'Platform admin',
  bookkeeper_owner:  'Firm owner',
  bookkeeper_admin:  'Firm admin',
  bookkeeper_staff:  'Firm staff',
  accountant_owner:  'Accountant — Partner',
  accountant_admin:  'Accountant — Manager',
  accountant_staff:  'Controller',
  solo_owner:        'Entrepreneur',
  pyme_owner:        'Business owner',
  pyme_staff:        'Team member',
  unknown:           'User'
}

export const USER_KIND_COLORS: Record<UserKind, string> = {
  super_admin:       'var(--sem-red)',
  bookkeeper_owner:  'var(--lp-violet)',
  bookkeeper_admin:  'var(--lp-accent)',
  bookkeeper_staff:  'var(--lp-text-muted)',
  accountant_owner:  'var(--sem-green)',
  accountant_admin:  'var(--lp-accent)',
  accountant_staff:  'var(--sem-cyan)',
  solo_owner:        'var(--sem-green)',
  pyme_owner:        'var(--sem-cyan)',
  pyme_staff:        'var(--lp-text-muted)',
  unknown:           'var(--lp-text-muted)'
}