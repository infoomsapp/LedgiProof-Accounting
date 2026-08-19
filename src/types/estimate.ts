// PATH: src/types/estimate.ts
//
// Strict types for the Estimates module. Mirrors the pattern used by Invoice
// types in database.types.ts, but kept here separately because Estimates is
// a self-contained feature module.

import type { InvoiceItemType } from './database.types'

// ── Enums (match DB) ─────────────────────────────────────────────────────────

export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'rejected'
  | 'counter_offered'
  | 'expired'
  | 'converted'
  | 'cancelled'

export type EstimateTemplateCategory =
  // Trades
  | 'electrician'
  | 'plumber'
  | 'painter'
  | 'carpenter'
  | 'mechanic'
  | 'gardener'
  | 'cleaning'
  | 'construction'
  | 'moving'
  | 'hvac'
  | 'photography'
  | 'catering'
  | 'collision_repair'    // 🆕 auto body / collision
  | 'auto_detailing'      // 🆕 detailing / ceramic / paint correction
  // Drivers (gig economy + commercial)
  | 'taxi_driver'         // 🆕 rideshare / taxi / chauffeur
  | 'delivery_driver'     // 🆕 DoorDash / Uber Eats / Instacart / Amazon Flex
  | 'truck_driver'        // 🆕 freight / long-haul / owner-operator
  // Professional services
  | 'it_development'
  | 'design'
  | 'marketing'
  | 'consulting'
  | 'beauty_spa'
  | 'accounting_services'
  | 'legal_services'
  | 'bookkeeping_monthly'
  | 'digital_creator'     // 🆕 content creator / influencer / streamer
  // Generic
  | 'general_b2b'
  | 'custom'

export type EstimateSignerRole = 'client' | 'vendor'

export type EstimateResponseType = 'accept' | 'reject' | 'counter_offer' | 'view'

// Reuse from invoices
export type EstimateItemType = InvoiceItemType  // 'service' | 'product' | 'expense' | 'discount' | 'tax'

// ── Row types ────────────────────────────────────────────────────────────────

export interface Estimate {
  id:               string
  org_id:           string
  client_id:        string
  estimate_number:  string
  status:           EstimateStatus

  issue_date:       string
  valid_until:      string | null

  subtotal:         number
  discount_total:   number
  tax_total:        number
  total:            number
  currency:         string

  title:            string | null
  notes:            string | null
  footer:           string | null
  terms:            string | null

  template_category: EstimateTemplateCategory | null
  template_id:       string | null
  scope_description: string | null

  // Bill-to snapshot (frozen at issue; immutable thereafter)
  bill_to_name?:          string | null
  bill_to_company?:       string | null
  bill_to_email?:         string | null
  bill_to_phone?:         string | null
  bill_to_tax_id?:        string | null
  bill_to_address_line1?: string | null
  bill_to_address_line2?: string | null
  bill_to_city?:          string | null
  bill_to_state?:         string | null
  bill_to_postal_code?:   string | null
  bill_to_country?:       string | null
  bill_to_snapshot_at?:   string | null

  // Send / view
  sent_at:        string | null
  sent_to:        string | null
  sent_method:    string | null
  viewed_at:      string | null
  view_count:     number
  public_token:   string | null

  // Accept
  accepted_at:             string | null
  accepted_by_name:        string | null
  accepted_signature_text: string | null
  accepted_ip:             string | null
  accepted_user_agent:     string | null

  // Reject
  rejected_at:      string | null
  rejected_reason:  string | null
  rejected_by_name: string | null

  // Counter-offer
  counter_offered_at:  string | null
  counter_offer_note:  string | null
  parent_estimate_id:  string | null

  // Conversion
  converted_to_invoice_id: string | null
  converted_at:            string | null

  // Cancellation
  cancelled_at:     string | null
  cancelled_reason: string | null

  // Hash chain (internal — usually omitted in client responses)
  raw_hash?:      string | null
  previous_hash?: string | null
  final_hash?:    string | null

  created_by: string
  created_at: string
  updated_at: string
}

export interface EstimateItem {
  id:            string
  estimate_id:   string
  org_id:        string
  sort_order:    number
  item_type:     EstimateItemType
  description:   string
  quantity:      number
  unit_price:    number
  discount_pct:  number
  tax_rate:      number
  line_subtotal: number
  line_discount: number
  line_tax:      number
  line_total:    number
  created_at:    string
}

export interface EstimateTemplate {
  id:                 string
  org_id:             string | null
  category:           EstimateTemplateCategory
  name:               string
  description:        string | null
  default_items:      EstimateTemplateItem[]
  default_terms:      string | null
  default_notes:      string | null
  default_footer:     string | null
  default_valid_days: number | null
  is_active:          boolean
  is_global:          boolean
  usage_count:        number
  created_by:         string | null
  created_at:         string
  updated_at:         string
}

/** Shape of an item INSIDE the template's `default_items` JSON */
export interface EstimateTemplateItem {
  description:   string
  quantity:      number
  unit_price:    number
  discount_pct?: number
  tax_rate?:     number
  item_type?:    EstimateItemType
}

export interface EstimateSignature {
  id:             string
  estimate_id:    string
  signer_role:    EstimateSignerRole
  signer_name:    string
  signer_email:   string | null
  signature_text: string
  signer_ip:      string | null
  user_agent:     string | null
  signed_at:      string
  signature_hash: string
}

export interface EstimateResponse {
  id:              string
  estimate_id:     string
  response_type:   EstimateResponseType
  responder_name:  string | null
  responder_email: string | null
  responder_ip:    string | null
  user_agent:      string | null
  message:         string | null
  proposed_items:  EstimateTemplateItem[] | null
  proposed_total:  number | null
  created_at:      string
}

// ── List row (with joined client name from list_estimates RPC) ───────────────

export interface EstimateListRow {
  id:               string
  estimate_number:  string
  status:           EstimateStatus
  issue_date:       string
  valid_until:      string | null
  total:            number
  currency:         string
  title:            string | null
  scope_description: string | null
  client_id:        string
  client_name:      string | null
  template_category: EstimateTemplateCategory | null
  sent_at:          string | null
  viewed_at:        string | null
  accepted_at:      string | null
  rejected_at:      string | null
  converted_at:     string | null
  converted_to_invoice_id: string | null
  created_at:       string
  updated_at:       string
}

// ── Public payload (returned by get_estimate_by_public_token) ────────────────

export interface EstimatePublicPayload {
  estimate: Estimate
  items:    EstimateItem[]
  org: {
    id:                 string
    name:               string
    business_type:      string | null
    principal_business: string | null
    business_code:      string | null
  }
  client: {
    id:    string
    name:  string
    email: string | null
  }
}

// ── UI configuration ─────────────────────────────────────────────────────────

export const ESTIMATE_STATUS_CONFIG: Record<EstimateStatus, {
  label:    string
  color:    string
  bg:       string
  emoji:    string
  isFinal:  boolean
}> = {
  draft:           { label: 'Draft',           color: '#64748b', bg: 'rgba(100,116,139,0.10)', emoji: '✏️', isFinal: false },
  sent:            { label: 'Sent',            color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  emoji: '📤', isFinal: false },
  viewed:          { label: 'Viewed',          color: '#06b6d4', bg: 'rgba(6,182,212,0.10)',   emoji: '👁',  isFinal: false },
  accepted:        { label: 'Accepted',        color: '#22c55e', bg: 'rgba(34,197,94,0.10)',   emoji: '✓',  isFinal: true  },
  rejected:        { label: 'Rejected',        color: '#ef4444', bg: 'rgba(239,68,68,0.10)',   emoji: '✗',  isFinal: true  },
  counter_offered: { label: 'Counter-offered', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  emoji: '↔', isFinal: false },
  expired:         { label: 'Expired',         color: '#71717a', bg: 'rgba(113,113,122,0.10)', emoji: '⌛', isFinal: true  },
  converted:       { label: 'Converted',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)',  emoji: '↗', isFinal: true  },
  cancelled:       { label: 'Cancelled',       color: '#71717a', bg: 'rgba(113,113,122,0.10)', emoji: '⊘', isFinal: true  }
}

export const ESTIMATE_TEMPLATE_CATEGORY_LABELS: Record<EstimateTemplateCategory, { label: string; emoji: string; group: 'trade' | 'service' | 'driver' | 'generic' }> = {
  // Trades
  electrician:          { label: 'Electrician',           emoji: '⚡', group: 'trade' },
  plumber:              { label: 'Plumber',               emoji: '🔧', group: 'trade' },
  painter:              { label: 'Painter',               emoji: '🎨', group: 'trade' },
  carpenter:            { label: 'Carpenter',             emoji: '🪵', group: 'trade' },
  mechanic:             { label: 'Auto Mechanic',         emoji: '🔩', group: 'trade' },
  gardener:             { label: 'Landscaping & Lawn',    emoji: '🌿', group: 'trade' },
  cleaning:             { label: 'Cleaning Services',     emoji: '🧹', group: 'trade' },
  construction:         { label: 'Construction',          emoji: '🏗', group: 'trade' },
  moving:               { label: 'Moving Services',       emoji: '📦', group: 'trade' },
  hvac:                 { label: 'HVAC',                  emoji: '❄️', group: 'trade' },
  photography:          { label: 'Photography',           emoji: '📷', group: 'trade' },
  catering:             { label: 'Catering',              emoji: '🍽', group: 'trade' },
  collision_repair:     { label: 'Collision Repair',      emoji: '🚗', group: 'trade' },
  auto_detailing:       { label: 'Auto Detailing',        emoji: '✨', group: 'trade' },
  // Drivers (gig economy + commercial transport)
  taxi_driver:          { label: 'Rideshare / Taxi',      emoji: '🚖', group: 'driver' },
  delivery_driver:      { label: 'Delivery Driver',       emoji: '🛵', group: 'driver' },
  truck_driver:         { label: 'Trucking / Freight',    emoji: '🚛', group: 'driver' },
  // Professional
  it_development:       { label: 'Software Development',  emoji: '💻', group: 'service' },
  design:               { label: 'Design',                emoji: '🎯', group: 'service' },
  marketing:            { label: 'Marketing',             emoji: '📣', group: 'service' },
  consulting:           { label: 'Consulting',            emoji: '💼', group: 'service' },
  beauty_spa:           { label: 'Beauty & Spa',          emoji: '💆', group: 'service' },
  accounting_services:  { label: 'Accounting',            emoji: '📊', group: 'service' },
  legal_services:       { label: 'Legal Services',        emoji: '⚖️', group: 'service' },
  bookkeeping_monthly:  { label: 'Monthly Bookkeeping',   emoji: '📒', group: 'service' },
  digital_creator:      { label: 'Content Creator',       emoji: '🎬', group: 'service' },
  // Generic
  general_b2b:          { label: 'General B2B',           emoji: '🤝', group: 'generic' },
  custom:               { label: 'Blank / Custom',        emoji: '📝', group: 'generic' }
}

// ── Computed helpers ─────────────────────────────────────────────────────────
//
// The actual math now lives in lib/lineItems.ts, shared with Invoices.tsx —
// re-exported here under their original names so every existing caller
// (useEstimateDraft.ts) keeps working unchanged.

export { calcLineTotals } from '../lib/lineItems'
import { calcDocumentTotals } from '../lib/lineItems'

/** Calculate full estimate totals from items array */
export function calcEstimateTotals(items: EstimateItem[] | Array<{ line_subtotal: number; line_discount: number; line_tax: number; line_total: number }>): {
  subtotal:       number
  discount_total: number
  tax_total:      number
  total:          number
} {
  return calcDocumentTotals(items)
}

/** Check if estimate is expired based on valid_until */
export function isEstimateExpired(estimate: Pick<Estimate, 'valid_until' | 'status'>): boolean {
  if (estimate.status === 'expired') return true
  if (!estimate.valid_until) return false
  return new Date(estimate.valid_until) < new Date()
}

/** Days remaining until valid_until (negative if expired) */
export function daysUntilExpiry(validUntil: string | null): number | null {
  if (!validUntil) return null
  const now    = new Date()
  const expiry = new Date(validUntil)
  const diffMs = expiry.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

// ── Insert helper types ──────────────────────────────────────────────────────

export interface CreateEstimateInput {
  org_id:             string
  client_id:          string
  title?:             string
  template_id?:       string | null
  template_category?: EstimateTemplateCategory | null
  scope_description?: string
  valid_until?:       string | null   // ISO date YYYY-MM-DD
  currency?:          string
  notes?:             string
  terms?:             string
  footer?:            string
}

export interface AddEstimateItemInput {
  estimate_id:   string
  description:   string
  quantity?:     number
  unit_price?:   number
  discount_pct?: number
  tax_rate?:     number
  item_type?:    EstimateItemType
  sort_order?:   number
}

export interface UpdateEstimateItemInput {
  item_id:       string
  description?:  string
  quantity?:     number
  unit_price?:   number
  discount_pct?: number
  tax_rate?:     number
  sort_order?:   number
}

export interface UpdateEstimateInput {
  estimate_id:        string
  // 🐛 Widened to match Estimate's actual (nullable) row types and how
  // updateEstimate() already treats them — every field goes through
  // `?? undefined` before hitting the RPC, so null and undefined are
  // handled identically ("don't change this field"). The old `string`-only
  // types silently rejected valid patches built from Estimate's own nullable
  // columns (e.g. clearing a field to null).
  title?:             string | null
  scope_description?: string | null
  valid_until?:       string | null
  notes?:             string | null
  terms?:             string | null
  footer?:            string | null
  currency?:          string
}

// ── RPC return shapes ────────────────────────────────────────────────────────

export interface CreateEstimateResult {
  estimate_id:     string
  estimate_number: string
  public_token:    string
  items_count:     number
}

export interface SendEstimateResult {
  estimate_id:     string
  estimate_number: string
  public_token:    string
  sent_to:         string | null
  method:          string
}

export interface AcceptEstimateResult {
  estimate_id:    string
  accepted_at:    string
  signature_hash: string
}

export interface ConvertEstimateResult {
  estimate_id:    string
  invoice_id:     string
  invoice_number: string
  converted_at:   string
}

export interface ListEstimatesResult {
  total:  number
  limit:  number
  offset: number
  rows:   EstimateListRow[]
}
