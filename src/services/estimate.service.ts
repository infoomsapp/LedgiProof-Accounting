// PATH: src/services/estimate.service.ts
//
// Service layer for the Estimates module. Wraps all 13 RPCs from v31b in
// strongly-typed async functions. Pure data layer — no React state here.
//
// Mirrors the pattern from invoice.service.ts so hooks/components feel familiar.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import type { Json, Database } from '../types/database.types'
import type {
  Estimate,
  EstimateItem,
  EstimateTemplate,
  EstimateTemplateCategory,
  EstimateStatus,
  EstimateSignature,
  EstimateResponse,
  EstimatePublicPayload,
  EstimateListRow,
  CreateEstimateInput,
  AddEstimateItemInput,
  UpdateEstimateItemInput,
  UpdateEstimateInput,
  CreateEstimateResult,
  SendEstimateResult,
  AcceptEstimateResult,
  ConvertEstimateResult,
  ListEstimatesResult,
  EstimateTemplateItem
} from '../types/estimate'

// ═════════════════════════════════════════════════════════════════════════════
// ESTIMATES — CRUD via RPCs
// ═════════════════════════════════════════════════════════════════════════════

/** Create an estimate (optionally from a template) */
export async function createEstimate(input: CreateEstimateInput): Promise<CreateEstimateResult> {
  const { data, error } = await db.rpc('create_estimate', pruneRpcArgs({
    p_org_id:            input.org_id,
    p_client_id:         input.client_id,
    p_title:             input.title              ?? undefined,
    p_template_id:       input.template_id        ?? undefined,
    p_template_category: input.template_category  ?? undefined,
    p_scope_description: input.scope_description  ?? undefined,
    p_valid_until:       input.valid_until        ?? undefined,
    p_currency:          input.currency           ?? 'USD',
    p_notes:             input.notes              ?? undefined,
    p_terms:             input.terms              ?? undefined,
    p_footer:            input.footer             ?? undefined
  }))
  if (error) throw new Error(error.message)
  return data as unknown as CreateEstimateResult
}

/** Patch top-level fields on an estimate */
export async function updateEstimate(input: UpdateEstimateInput): Promise<void> {
  const { error } = await db.rpc('update_estimate', pruneRpcArgs({
    p_estimate_id:       input.estimate_id,
    p_title:             input.title             ?? undefined,
    p_scope_description: input.scope_description ?? undefined,
    p_valid_until:       input.valid_until       ?? undefined,
    p_notes:             input.notes             ?? undefined,
    p_terms:             input.terms             ?? undefined,
    p_footer:            input.footer            ?? undefined,
    p_currency:          input.currency          ?? undefined
  }))
  if (error) throw new Error(error.message)
}

/** Get an estimate by id (org member access) — direct table read */
export async function getEstimate(estimateId: string): Promise<Estimate | null> {
  const { data, error } = await db
    .from('estimates')
    .select('*')
    .eq('id', estimateId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Estimate | null
}

/** Get items for an estimate, ordered by sort_order */
export async function getEstimateItems(estimateId: string): Promise<EstimateItem[]> {
  const { data, error } = await db
    .from('estimate_items')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as EstimateItem[]
}

/** Get estimate + items in one call (convenience) */
export async function getEstimateWithItems(estimateId: string): Promise<{
  estimate: Estimate
  items:    EstimateItem[]
} | null> {
  const [estimate, items] = await Promise.all([
    getEstimate(estimateId),
    getEstimateItems(estimateId)
  ])
  if (!estimate) return null
  return { estimate, items }
}

/** Paginated list with optional filters */
export async function listEstimates(opts: {
  orgId:     string
  status?:   EstimateStatus
  clientId?: string
  limit?:    number
  offset?:   number
}): Promise<ListEstimatesResult> {
  const { data, error } = await db.rpc('list_estimates', pruneRpcArgs({
    p_org_id:    opts.orgId,
    p_status:    opts.status   ?? undefined,
    p_client_id: opts.clientId ?? undefined,
    p_limit:     opts.limit    ?? 50,
    p_offset:    opts.offset   ?? 0
  }))
  if (error) throw new Error(error.message)
  return data as unknown as ListEstimatesResult
}

/** Delete a draft estimate (RLS only allows status=draft) */
export async function deleteEstimate(estimateId: string): Promise<void> {
  const { error } = await db.from('estimates').delete().eq('id', estimateId)
  if (error) throw new Error(error.message)
}

// ═════════════════════════════════════════════════════════════════════════════
// ESTIMATE ITEMS
// ═════════════════════════════════════════════════════════════════════════════

export async function addEstimateItem(input: AddEstimateItemInput): Promise<string> {
  const { data, error } = await db.rpc('add_estimate_item', pruneRpcArgs({
    p_estimate_id:  input.estimate_id,
    p_description:  input.description,
    p_quantity:     input.quantity     ?? 1,
    p_unit_price:   input.unit_price   ?? 0,
    p_discount_pct: input.discount_pct ?? 0,
    p_tax_rate:     input.tax_rate     ?? 0,
    p_item_type:    input.item_type    ?? 'service',
    p_sort_order:   input.sort_order   ?? undefined
  }))
  if (error) throw new Error(error.message)
  return data as string
}

export async function updateEstimateItem(input: UpdateEstimateItemInput): Promise<void> {
  const { error } = await db.rpc('update_estimate_item', pruneRpcArgs({
    p_item_id:      input.item_id,
    p_description:  input.description  ?? undefined,
    p_quantity:     input.quantity     ?? undefined,
    p_unit_price:   input.unit_price   ?? undefined,
    p_discount_pct: input.discount_pct ?? undefined,
    p_tax_rate:     input.tax_rate     ?? undefined,
    p_sort_order:   input.sort_order   ?? undefined
  }))
  if (error) throw new Error(error.message)
}

export async function deleteEstimateItem(itemId: string): Promise<void> {
  const { error } = await db.rpc('delete_estimate_item', { p_item_id: itemId })
  if (error) throw new Error(error.message)
}

// ═════════════════════════════════════════════════════════════════════════════
// SEND / PUBLIC ACCESS
// ═════════════════════════════════════════════════════════════════════════════

/** Mark as sent. Returns the public_token so the UI can build the link. */
export async function sendEstimate(opts: {
  estimateId: string
  toEmail?:   string
  method?:    'email' | 'link_copied' | 'sms'
}): Promise<SendEstimateResult> {
  const { data, error } = await db.rpc('send_estimate', pruneRpcArgs({
    p_estimate_id: opts.estimateId,
    p_to_email:    opts.toEmail ?? undefined,
    p_method:      opts.method  ?? 'link_copied'
  }))
  if (error) throw new Error(error.message)
  return data as unknown as SendEstimateResult
}

/** Build the public URL for an estimate token */
export function buildPublicEstimateUrl(token: string): string {
  const base = (typeof window !== 'undefined' && window.location.origin)
    ? window.location.origin
    : 'https://ledgiproof.com'
  return `${base}/e/${token}`
}

// ─── PUBLIC RPCs (no auth required — used by the public accept page) ─────────

export async function getEstimateByPublicToken(opts: {
  token:      string
  trackView?: boolean
  userAgent?: string
}): Promise<EstimatePublicPayload> {
  const { data, error } = await db.rpc('get_estimate_by_public_token', pruneRpcArgs({
    p_token:      opts.token,
    p_track_view: opts.trackView ?? true,
    p_viewer_ip:  null,  // anon — server reads from request if needed
    p_user_agent: opts.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : undefined)
  }))
  if (error) throw new Error(error.message)
  return data as unknown as EstimatePublicPayload
}

export async function acceptEstimatePublic(opts: {
  token:          string
  signerName:     string
  signatureText:  string
  signerEmail?:   string
}): Promise<AcceptEstimateResult> {
  const { data, error } = await db.rpc('accept_estimate_public', pruneRpcArgs({
    p_token:           opts.token,
    p_signer_name:     opts.signerName,
    p_signature_text:  opts.signatureText,
    p_signer_email:    opts.signerEmail ?? undefined,
    p_ip:              null,
    p_user_agent:      typeof navigator !== 'undefined' ? navigator.userAgent : undefined
  }))
  if (error) throw new Error(error.message)
  return data as unknown as AcceptEstimateResult
}

export async function rejectEstimatePublic(opts: {
  token:        string
  reason:       string
  signerName?:  string
  signerEmail?: string
}): Promise<{ estimate_id: string; rejected_at: string }> {
  const { data, error } = await db.rpc('reject_estimate_public', pruneRpcArgs({
    p_token:        opts.token,
    p_reason:       opts.reason,
    p_signer_name:  opts.signerName  ?? undefined,
    p_signer_email: opts.signerEmail ?? undefined,
    p_ip:           null,
    p_user_agent:   typeof navigator !== 'undefined' ? navigator.userAgent : undefined
  }))
  if (error) throw new Error(error.message)
  return data as unknown as { estimate_id: string; rejected_at: string }
}

export async function counterOfferPublic(opts: {
  token:          string
  proposedItems:  EstimateTemplateItem[]
  note?:          string
  signerName?:    string
  signerEmail?:   string
}): Promise<{ parent_estimate_id: string; proposed_total: number; recorded_at: string }> {
  const { data, error } = await db.rpc('counter_offer_public', pruneRpcArgs({
    p_token:          opts.token,
    p_proposed_items: opts.proposedItems as unknown as Json,
    p_note:           opts.note         ?? undefined,
    p_signer_name:    opts.signerName   ?? undefined,
    p_signer_email:   opts.signerEmail  ?? undefined,
    p_ip:             null,
    p_user_agent:     typeof navigator !== 'undefined' ? navigator.userAgent : undefined
  }))
  if (error) throw new Error(error.message)
  return data as unknown as { parent_estimate_id: string; proposed_total: number; recorded_at: string }
}

// ═════════════════════════════════════════════════════════════════════════════
// CONVERSION
// ═════════════════════════════════════════════════════════════════════════════

export async function convertEstimateToInvoice(estimateId: string): Promise<ConvertEstimateResult> {
  const { data, error } = await db.rpc('convert_estimate_to_invoice', {
    p_estimate_id: estimateId
  })
  if (error) throw new Error(error.message)
  return data as unknown as ConvertEstimateResult
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ═════════════════════════════════════════════════════════════════════════════

/** Load all templates available to the user (global + their org's custom) */
export async function listEstimateTemplates(opts?: {
  orgId?:    string
  category?: EstimateTemplateCategory
}): Promise<EstimateTemplate[]> {
  let q = db
    .from('estimate_templates')
    .select('*')
    .eq('is_active', true)
    .order('is_global', { ascending: false }) // globals first
    .order('category')
    .order('name')

  if (opts?.category) {
    q = q.eq('category', opts.category)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EstimateTemplate[]
}

/** Get a single template by id */
export async function getEstimateTemplate(templateId: string): Promise<EstimateTemplate | null> {
  const { data, error } = await db
    .from('estimate_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as EstimateTemplate | null
}

/** Create a custom org-scoped template */
export async function createEstimateTemplate(input: {
  org_id:             string
  category:           EstimateTemplateCategory
  name:               string
  description?:       string
  default_items:      EstimateTemplateItem[]
  default_terms?:     string
  default_notes?:     string
  default_footer?:    string
  default_valid_days?: number
}): Promise<EstimateTemplate> {
  const { data, error } = await db
    .from('estimate_templates')
    .insert({
      org_id:             input.org_id,
      category:           input.category,
      name:               input.name,
      description:        input.description    ?? null,
      default_items:      input.default_items as unknown as Json,
      default_terms:      input.default_terms  ?? null,
      default_notes:      input.default_notes  ?? null,
      default_footer:     input.default_footer ?? null,
      default_valid_days: input.default_valid_days ?? null,
      is_active:          true,
      is_global:          false
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as EstimateTemplate
}

/** Update an org-scoped template (cannot modify globals) */
export async function updateEstimateTemplate(
  templateId: string,
  patch: Partial<Pick<EstimateTemplate,
    'name' | 'description' | 'default_items' | 'default_terms' |
    'default_notes' | 'default_footer' | 'default_valid_days' | 'is_active'
  >>
): Promise<EstimateTemplate> {
  const { data, error } = await db
    .from('estimate_templates')
    .update(patch as unknown as Database['public']['Tables']['estimate_templates']['Update'])
    .eq('id', templateId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as EstimateTemplate
}

export async function deleteEstimateTemplate(templateId: string): Promise<void> {
  const { error } = await db.from('estimate_templates').delete().eq('id', templateId)
  if (error) throw new Error(error.message)
}

// ═════════════════════════════════════════════════════════════════════════════
// SIGNATURES / RESPONSES (audit trail — read-only from client)
// ═════════════════════════════════════════════════════════════════════════════

export async function getEstimateSignatures(estimateId: string): Promise<EstimateSignature[]> {
  const { data, error } = await db
    .from('estimate_signatures')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('signed_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as EstimateSignature[]
}

export async function getEstimateResponses(estimateId: string): Promise<EstimateResponse[]> {
  const { data, error } = await db
    .from('estimate_responses')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as EstimateResponse[]
}

/** Suggest a template category based on the org's business_code */
export function suggestTemplateCategoryFromBusinessCode(
  businessCode: string | null | undefined
): EstimateTemplateCategory | null {
  if (!businessCode) return null

  // NAICS 2-digit prefixes → likely category
  // Reference: https://www.naics.com/search/
  const code = businessCode.trim().substring(0, 2)
  const map: Record<string, EstimateTemplateCategory> = {
    '23': 'construction',         // Construction
    '48': 'truck_driver',         // Transportation
    '49': 'delivery_driver',      // Couriers and messengers
    '51': 'it_development',       // Information
    '52': 'accounting_services',  // Finance & insurance
    '53': 'consulting',           // Real estate, rental, leasing
    '54': 'consulting',           // Professional, scientific & technical
    '56': 'cleaning',             // Admin & support, waste mgmt
    '62': 'beauty_spa',           // Healthcare & social assistance
    '71': 'photography',          // Arts, entertainment, recreation
    '72': 'catering',             // Accommodation & food
    '81': 'cleaning'              // Other services (personal & laundry)
  }
  return map[code] ?? null
}