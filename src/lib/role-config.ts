// PATH: src/lib/role-config.ts
//
// Shared workspace role config — previously duplicated (and diverged)
// between src/pages/Clients.tsx and src/pages/Team.tsx. This is the
// canonical, theme-aware version (CSS custom properties, works in both
// light and dark mode) — the raw-hex version that used to live in
// Clients.tsx was NOT theme-aware and has been retired in favor of this.

import type { LpRole } from '../types/database.types'

export const ROLE_CONFIG: Record<LpRole, { label: string; color: string; bg: string; description: string }> = {
  owner:      { label: 'Owner',      color: 'var(--lp-violet)',     bg: 'var(--chat-bubble-internal-bg)', description: 'Full access including billing and user management' },
  admin:      { label: 'Admin',      color: 'var(--lp-accent)',     bg: 'var(--chat-bubble-mine-bg)',     description: 'Manage workspace settings and users' },
  accountant: { label: 'Accountant', color: 'var(--sem-green)',     bg: 'var(--sem-green-bg)',            description: 'Create and approve transactions, post journal entries' },
  auditor:    { label: 'Auditor',    color: 'var(--sem-amber)',     bg: 'var(--sem-amber-bg)',            description: 'Read-only access to all financial data' },
  approver:   { label: 'Approver',   color: 'var(--lp-violet)',     bg: 'var(--chat-bubble-internal-bg)', description: 'Approve transactions up to their limit' },
  readonly:   { label: 'Read only',  color: 'var(--lp-text-muted)', bg: 'var(--lp-surface-2)',            description: 'View only — cannot create or modify anything' }
}

/**
 * Returns the list of roles the current user is allowed to assign.
 *
 * Rules:
 *   - workspace owner → all roles EXCEPT 'owner' (only one owner per workspace)
 *   - workspace admin → accountant, auditor, approver, readonly
 *   - others          → []
 */
export function getAssignableRoles(opts: {
  workspaceRole: LpRole | null
}): LpRole[] {
  const { workspaceRole } = opts

  if (workspaceRole === 'owner') {
    // Owner cannot create another owner (would lose exclusivity)
    return ['admin', 'accountant', 'auditor', 'approver', 'readonly']
  }
  if (workspaceRole === 'admin') {
    // Admin cannot promote to admin or owner
    return ['accountant', 'auditor', 'approver', 'readonly']
  }
  return []
}
