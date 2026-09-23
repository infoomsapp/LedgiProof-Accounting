// PATH: src/services/settings.service.ts
// Wrappers for v22 RPCs: scoped user directory + tax info.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import type { LpUserTier } from '../types/database.types'
import { dbError } from '../lib/errors'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScopedUser {
  id:               string
  lp_user_code:     string
  email:            string | null
  display_name:     string | null
  tier:             LpUserTier
  system_role:      string  // 'super_admin' | 'admin' | 'bookkeeper' | 'auditor' | 'user' | 'client'
  account_type:     string  // 'self_employed' | 'bookkeeper' | 'pyme_client'
  is_active:        boolean
  created_at:       string
  org_count:        number
  workspace_role:   string | null  // role in queried org, NULL when super_admin global view
}

export interface OrgTaxInfo {
  state_code:          string | null
  ein:                 string | null
  business_type:       string | null
  principal_business:  string | null
  business_code:       string | null
}

// ── User directory (scoped) ──────────────────────────────────────────────────

/**
 * Get users visible to the current caller, scoped correctly:
 *   - super_admin + orgId=null → ALL users globally
 *   - super_admin + orgId      → users of that org
 *   - org owner/admin + orgId  → users of that org only
 *   - others                   → empty
 */
export async function getUsersInScope(orgId: string | null): Promise<ScopedUser[]> {
  const { data, error } = await db.rpc('get_users_in_scope', pruneRpcArgs({
    p_org_id: orgId ?? undefined
  }))
  if (error) throw dbError(error, 'Failed to load users')
  return (data ?? []) as ScopedUser[]
}

// ── Tax info ─────────────────────────────────────────────────────────────────

export async function updateOrgTaxInfo(
  orgId: string,
  patch: Partial<OrgTaxInfo>
): Promise<void> {
  const { error } = await db.rpc('update_org_tax_info', pruneRpcArgs({
    p_org_id:             orgId,
    p_state_code:         patch.state_code         ?? undefined,
    p_ein:                patch.ein                ?? undefined,
    p_business_type:      patch.business_type      ?? undefined,
    p_principal_business: patch.principal_business ?? undefined,
    p_business_code:      patch.business_code      ?? undefined
  }))
  if (error) throw dbError(error, 'Failed to save the tax information')
}

// ── US States constant (for dropdown) ────────────────────────────────────────

export const US_STATES: Array<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' },        { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },        { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },     { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },    { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },        { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },         { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },       { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },           { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },       { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },          { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },      { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },       { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },       { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },     { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },           { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },         { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },   { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },   { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },          { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },        { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },     { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },      { code: 'WY', name: 'Wyoming' }
]

// ── Business types (for dropdown) ────────────────────────────────────────────

export const BUSINESS_TYPES: Array<{ value: string; label: string }> = [
  { value: 'sole_proprietor',    label: 'Sole Proprietor (Schedule C)' },
  { value: 'llc_single_member',  label: 'LLC — Single member (disregarded)' },
  { value: 'llc_multi_member',   label: 'LLC — Multi-member (Form 1065)' },
  { value: 's_corp',             label: 'S-Corporation' },
  { value: 'c_corp',             label: 'C-Corporation' },
  { value: 'partnership',        label: 'Partnership' },
  { value: 'other',              label: 'Other' }
]