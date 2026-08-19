// PATH: src/types/account.ts
//
// Sprint 5 Paso 5.2 — Account templates type definitions.
//
// Mirrors the schema introduced in migration v37_coa_per_client.sql:
//   · account_templates (firm-level CoA blueprints)
//   · account_template_items (line items per template)
//
// The Account interface itself lives in database.types.ts and was extended
// in v37 with `client_id` and `is_legacy` columns. To avoid circular imports,
// we re-export the relevant slice from there.

import type { Account } from './database.types'

// ── Template categories ──────────────────────────────────────────────────
// Aligned with the 7 system templates seeded in v37. UI uses these for
// filtering / suggesting templates based on industry. Free-form strings are
// allowed for firm-custom templates (anything not in this enum is treated
// as 'custom' by the UI).
export type AccountTemplateCategory =
  | 'generic'
  | 'professional_services'
  | 'saas'
  | 'real_estate_brrrr'
  | 'restaurant'
  | 'ecommerce'
  | 'construction'
  | 'custom'

export interface AccountTemplate {
  id:           string
  org_id:       string
  name:         string
  description:  string | null
  category:     string                 // free-form (may be one of AccountTemplateCategory or custom)
  is_system:    boolean                // TRUE for system-seeded, FALSE for firm-custom
  created_by:   string | null
  created_at:   string
  updated_at:   string
}

export interface AccountTemplateItem {
  id:              string
  template_id:     string
  code:            string               // GAAP account code like '1010'
  name:            string
  type:            'asset' | 'liability' | 'equity' | 'income' | 'expense'
  normal_balance:  'debit' | 'credit'
  parent_code:     string | null        // referential by code, resolved at clone time
  sort_order:      number
  created_at:      string
}

/** Convenience: a template plus its line items (used in detail views). */
export interface AccountTemplateBundle {
  template: AccountTemplate
  items:    AccountTemplateItem[]
}

/** Convenience re-export so consumers can import everything from this module. */
export type { Account }

/** Helper: human-readable label for a category. UI uses this in dropdowns. */
export const ACCOUNT_TEMPLATE_CATEGORY_LABELS: Record<AccountTemplateCategory, string> = {
  generic:               'Generic LLC',
  professional_services: 'Professional Services',
  saas:                  'SaaS / Tech',
  real_estate_brrrr:     'Real Estate (BRRRR)',
  restaurant:            'Restaurant / Food Service',
  ecommerce:             'E-commerce / Online Retail',
  construction:          'Construction / Contractors',
  custom:                'Custom'
}