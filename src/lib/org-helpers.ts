// PATH: src/lib/org-helpers.ts
//
// P5.A — Org categorization helpers.
//
// Goal: classify each Organization as one of {personal, firm, client_company}
// for UI routing decisions (which dashboard, which sidebar variant, etc).
//
// Migration safety:
//   The is_personal / is_firm / is_client booleans are added in migration v33+.
//   These helpers work CORRECTLY both before and after migration:
//     · Before v33 → flags are undefined → falls back to heuristics
//     · After v33  → flags are authoritative
//
// This means we can ship the UI changes (P5.A) without touching the DB,
// then ship the migration (P5.B) and the UI becomes more precise automatically.

import type { Organization, AccountType } from '../types/database.types'

export type OrgCategory = 'personal' | 'firm' | 'client_company' | 'unknown'

/**
 * Classify an organization into one of four categories.
 *
 * Priority order:
 *   1. Explicit boolean flags (migration v33+)
 *   2. Heuristic from account_type stored on the org (legacy)
 *   3. 'unknown' (defensive default)
 */
export function classifyOrg(
  org: Organization | null | undefined,
  accountTypeHint?: AccountType | null
): OrgCategory {
  if (!org) return 'unknown'

  // Migration v33+ authoritative flags
  if (org.is_personal === true) return 'personal'
  if (org.is_firm     === true) return 'firm'
  if (org.is_client   === true) return 'client_company'

  // Pre-v33 fallback: use account_type if available
  if (accountTypeHint) {
    if (accountTypeHint === 'self_employed') return 'personal'
    if (accountTypeHint === 'bookkeeper')    return 'firm'
    if (accountTypeHint === 'pyme_client')   return 'client_company'
  }

  return 'unknown'
}

export function isPersonalOrg(
  org: Organization | null | undefined,
  accountTypeHint?: AccountType | null
): boolean {
  return classifyOrg(org, accountTypeHint) === 'personal'
}

export function isFirmOrg(
  org: Organization | null | undefined,
  accountTypeHint?: AccountType | null
): boolean {
  return classifyOrg(org, accountTypeHint) === 'firm'
}

export function isClientOrg(
  org: Organization | null | undefined,
  accountTypeHint?: AccountType | null
): boolean {
  return classifyOrg(org, accountTypeHint) === 'client_company'
}

/**
 * Split a list of orgs into personal/firm/client buckets for the OrgSelector.
 *
 * accountTypeHint comes from the user's profile and is used as fallback when
 * the org rows don't yet have the explicit booleans (pre-v33).
 */
export function partitionOrgs(
  orgs: Organization[],
  accountTypeHint?: AccountType | null
): {
  personal: Organization[]
  firm:     Organization[]
  client:   Organization[]
  unknown:  Organization[]
} {
  const personal: Organization[] = []
  const firm:     Organization[] = []
  const client:   Organization[] = []
  const unknown:  Organization[] = []

  for (const o of orgs) {
    const cat = classifyOrg(o, accountTypeHint)
    if      (cat === 'personal')       personal.push(o)
    else if (cat === 'firm')           firm.push(o)
    else if (cat === 'client_company') client.push(o)
    else                               unknown.push(o)
  }

  return { personal, firm, client, unknown }
}

/**
 * UI helper: emoji + label for displaying the org category.
 */
export function describeOrgCategory(cat: OrgCategory): {
  emoji:  string
  label:  string
  color:  string  // CSS var reference
} {
  switch (cat) {
    case 'personal':
      return {
        emoji: '👤',
        label: 'Personal',
        color: 'var(--lp-violet)'
      }
    case 'firm':
      return {
        emoji: '🏢',
        label: 'Firm',
        color: 'var(--lp-accent)'
      }
    case 'client_company':
      return {
        emoji: '💼',
        label: 'Client',
        color: 'var(--sem-green)'
      }
    default:
      return {
        emoji: '📁',
        label: 'Workspace',
        color: 'var(--lp-text-muted)'
      }
  }
}