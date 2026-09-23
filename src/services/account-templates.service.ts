// PATH: src/services/account-templates.service.ts
//
// Sprint 5 Paso 5.2 — Account templates service.
//
// Provides read access to:
//   · System templates (the 7 seeded in v37, visible to ALL orgs via RLS)
//   · Firm-custom templates (org-owned, created by firm admins)
//
// Provides write access to:
//   · cloneTemplateToClient → wraps clone_chart_of_accounts RPC
//   · createCustomTemplate  → for future use; firm creates its own templates
//
// Templates are READ-MOSTLY: most firms use the 7 system templates as-is
// and tweak the cloned accounts directly per-client. Custom templates exist
// as a power-user feature for firms with specialized industries.

import { db } from '../lib/supabase'
import type {
  AccountTemplate,
  AccountTemplateItem,
  AccountTemplateBundle
} from '../types/account'
import type { Json } from '../types/database.types'
import { toSafeMessage } from '../lib/errors'

// ── List operations ─────────────────────────────────────────────────────

export interface ListTemplatesOptions {
  /** Include system-seeded templates (default: true). */
  includeSystem?: boolean
  /** Include firm-custom templates for this org (default: true). */
  includeCustom?: boolean
  /** Filter by category (free-form string). */
  category?:      string
}

/**
 * List templates visible to the current user.
 *
 * RLS already filters by org membership / system status. This function
 * runs 2 parallel queries (system + firm-custom) and merges client-side
 * to avoid fragile PostgREST .or() syntax that proved hard to debug.
 *
 * Cost: 1-2 queries depending on inclusion flags. Both hit indexed
 * columns (`is_system`, `org_id`).
 */
export async function listTemplates(
  orgId:   string,
  options: ListTemplatesOptions = {}
): Promise<AccountTemplate[]> {
  const { includeSystem = true, includeCustom = true, category } = options

  // Edge case: nothing requested
  if (!includeSystem && !includeCustom) return []

  // Build the two queries (only the ones we need). Both branches query the
  // same table/columns, so their builder types line up without needing an
  // explicit (and previously `any`-typed) array annotation.
  const systemQuery = includeSystem
    ? (() => {
        let q = db.from('account_templates').select('*').eq('is_system', true).order('name')
        if (category) q = q.eq('category', category)
        return q
      })()
    : null

  const customQuery = includeCustom
    ? (() => {
        let q = db.from('account_templates').select('*').eq('is_system', false).eq('org_id', orgId).order('name')
        if (category) q = q.eq('category', category)
        return q
      })()
    : null

  const [systemRes, customRes] = await Promise.all([
    systemQuery ?? Promise.resolve({ data: [] as AccountTemplate[], error: null }),
    customQuery ?? Promise.resolve({ data: [] as AccountTemplate[], error: null })
  ])

  if (systemRes.error) throw new Error(`[Templates] List failed: ${toSafeMessage(systemRes.error, 'database error')}`)
  if (customRes.error) throw new Error(`[Templates] List failed: ${toSafeMessage(customRes.error, 'database error')}`)

  // Merge: system first, then custom, deduplicated by id (defensive)
  const merged: AccountTemplate[] = []
  const seenIds = new Set<string>()
  for (const row of [...(systemRes.data ?? []), ...(customRes.data ?? [])]) {
    if (!seenIds.has(row.id)) {
      seenIds.add(row.id)
      merged.push(row as AccountTemplate)
    }
  }
  return merged
}

/** Get a single template with all its line items. */
export async function getTemplateBundle(templateId: string): Promise<AccountTemplateBundle> {
  const [tplRes, itemsRes] = await Promise.all([
    db.from('account_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle(),
    db.from('account_template_items')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order')
  ])

  if (tplRes.error)   throw new Error(`[Templates] Get failed: ${toSafeMessage(tplRes.error, 'database error')}`)
  if (itemsRes.error) throw new Error(`[Templates] Get items failed: ${toSafeMessage(itemsRes.error, 'database error')}`)
  if (!tplRes.data)   throw new Error(`[Templates] Template ${templateId} not found`)

  return {
    template: tplRes.data as AccountTemplate,
    items:    (itemsRes.data ?? []) as AccountTemplateItem[]
  }
}

// ── Write operations ────────────────────────────────────────────────────

/**
 * Clone a template into accounts for a specific client.
 *
 * Wraps the v37 RPC `clone_chart_of_accounts` which:
 *   1. Inserts N rows into accounts with org_id auto-resolved from client
 *   2. Resolves parent_id via 2-pass code matching
 *   3. Returns count of accounts inserted
 *
 * The caller MUST verify the client is freshly created OR has no existing
 * scoped accounts (otherwise duplicates by code). UI in Paso 5.4 enforces
 * this at the "Add Client" wizard.
 */
export async function cloneTemplateToClient(
  templateId: string,
  clientId:   string
): Promise<{ accountsCreated: number }> {
  const { data, error } = await db.rpc('clone_chart_of_accounts', {
    p_template_id: templateId,
    p_client_id:   clientId
  })

  if (error) throw new Error(`[Templates] Clone failed: ${toSafeMessage(error, 'database error')}`)
  return { accountsCreated: (data as number) ?? 0 }
}

// ── Custom templates (firm-owned) — Paso 5.4 will use these ─────────────

export interface CreateCustomTemplateInput {
  orgId:       string
  name:        string
  description: string | null
  category:    string
  items: Array<{
    code:           string
    name:           string
    type:           'asset' | 'liability' | 'equity' | 'income' | 'expense'
    normal_balance: 'debit' | 'credit'
    parent_code:    string | null
    sort_order:     number
  }>
}

/**
 * Create a firm-custom template with its items atomically.
 *
 * Uses the v37b RPC `create_custom_account_template` which wraps both
 * inserts in a single PostgreSQL transaction. If the RPC fails, no
 * partial state is left in the DB (no orphan template headers).
 */
export async function createCustomTemplate(
  input: CreateCustomTemplateInput
): Promise<AccountTemplate> {
  if (input.items.length === 0) {
    throw new Error('[Templates] Cannot create template without items')
  }

  // 1. Invoke atomic RPC — returns new template_id
  const { data: newId, error: rpcErr } = await db.rpc('create_custom_account_template', {
    p_input: {
      org_id:      input.orgId,
      name:        input.name,
      description: input.description,
      category:    input.category,
      items:       input.items
    } as unknown as Json
  })

  if (rpcErr) throw new Error(`[Templates] Create failed: ${toSafeMessage(rpcErr, 'database error')}`)
  if (!newId)  throw new Error('[Templates] Create returned no id')

  // 2. Fetch the full template row to return to caller
  const { data: tpl, error: fetchErr } = await db
    .from('account_templates')
    .select('*')
    .eq('id', newId)
    .single()

  if (fetchErr) throw new Error(`[Templates] Fetch new template failed: ${toSafeMessage(fetchErr, 'database error')}`)
  return tpl as AccountTemplate
}