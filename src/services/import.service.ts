// PATH: src/services/import.service.ts
//
// P-Import.A — Two-layer service for v35 import RPCs.
//
// Layer 1 (low-level RPC wrappers) — matches the SQL signatures exactly:
//   · previewCoaImport       / importCoaBatch
//   · previewClientsImport   / importClientsBatch
//   · importOpeningBalances  (single-phase)
//
// Layer 2 (high-level wizard-friendly API) — accepts the (orgId, items,
// resolutions) shape the wizards already use, translates internally, and
// returns the unified ImportSummary shape:
//   · detectAccountDuplicates  / importChartOfAccounts
//   · detectClientDuplicates   / importClients
//
// This way the wizards stay readable while the backend uses the cleaner
// preview→import design.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import type { Json } from '../types/database.types'

// ════════════════════════════════════════════════════════════════════════════
// LAYER 1 — Low-level RPC wrappers
// ════════════════════════════════════════════════════════════════════════════

export type ConflictMode = 'skip' | 'overwrite' | 'keep_both'

// ── Chart of Accounts ───────────────────────────────────────────────────────

export interface CoaImportRow {
  code:         string
  name:         string
  type:         'asset' | 'liability' | 'equity' | 'income' | 'expense'
  parent_code?: string
  description?: string
  on_conflict?: ConflictMode
}

export interface CoaPreviewResult {
  valid_count:    number
  conflict_count: number
  error_count:    number
  valid: Array<{
    row_index:   number
    code:        string
    name:        string
    type:        string
    parent_code?: string
  }>
  conflicts: Array<{
    row_index:   number
    code:        string
    name:        string
    type:        string
    parent_code?: string
    existing:    { id: string; code: string; name: string; type: string }
  }>
  errors: Array<{
    row_index: number
    message:   string
    raw_row:   Record<string, any>
  }>
}

export interface CoaImportResult {
  inserted: number
  updated:  number
  skipped:  number
}

export async function previewCoaImport(
  orgId:    string,
  rows:     CoaImportRow[],
  clientId?: string | null  // 🆕 B3.7 v42 — per-client conflict scoping
): Promise<CoaPreviewResult> {
  const { data, error } = await db.rpc('preview_coa_import', pruneRpcArgs({
    p_org_id:    orgId,
    p_rows:      rows as unknown as Json,
    p_client_id: clientId ?? undefined  // 🆕 B3.7 v42
  }))
  if (error) throw new Error(error.message)
  return data as unknown as CoaPreviewResult
}

export async function importCoaBatch(
  orgId:    string,
  rows:     CoaImportRow[],
  clientId?: string | null  // 🆕 B3.7 — per-client mode when provided
): Promise<CoaImportResult> {
  const { data, error } = await db.rpc('import_coa_batch', pruneRpcArgs({
    p_org_id:    orgId,
    p_rows:      rows as unknown as Json,
    p_client_id: clientId ?? undefined  // 🆕 B3.7 — v40b RPC accepts NULL for legacy mode
  }))
  if (error) throw new Error(error.message)
  return data as unknown as CoaImportResult
}

// ── Clients ─────────────────────────────────────────────────────────────────

export interface ClientImportRow {
  display_name:     string
  company_name?:    string
  email?:           string
  phone?:           string
  tax_id?:          string
  address_line1?:   string
  city?:            string
  state?:           string
  postal_code?:     string
  country?:         string
  default_currency?: string
  payment_terms?:   number
  on_conflict?:     ConflictMode
}

export interface ClientPreviewResult {
  valid_count:    number
  conflict_count: number
  error_count:    number
  valid: Array<{
    row_index:    number
    match_key:    string
    display_name: string
    email:        string
  }>
  conflicts: Array<{
    row_index:    number
    match_key:    string
    display_name: string
    email:        string
    existing:     { id: string; display_name: string; email: string | null }
  }>
  errors: Array<{
    row_index: number
    message:   string
    raw_row:   Record<string, any>
  }>
}

export interface ClientImportResult {
  inserted: number
  updated:  number
  skipped:  number
}

export async function previewClientsImport(
  orgId: string,
  rows:  ClientImportRow[]
): Promise<ClientPreviewResult> {
  const { data, error } = await db.rpc('preview_clients_import', {
    p_org_id: orgId,
    p_rows:   rows as unknown as Json
  })
  if (error) throw new Error(error.message)
  return data as unknown as ClientPreviewResult
}

export async function importClientsBatch(
  orgId: string,
  rows:  ClientImportRow[]
): Promise<ClientImportResult> {
  const { data, error } = await db.rpc('import_clients_batch', {
    p_org_id: orgId,
    p_rows:   rows as unknown as Json
  })
  if (error) throw new Error(error.message)
  return data as unknown as ClientImportResult
}

// ── Opening Balances (single-phase, no preview) ────────────────────────────

export interface OpeningBalanceRow {
  account_code: string
  debit?:       number
  credit?:      number
  memo?:        string
}

export interface OpeningBalanceResult {
  journal_entry_id: string
  lines_count:      number
  total_debit:      number
  total_credit:     number
  transition_date:  string
}

// ════════════════════════════════════════════════════════════════════════════
// LAYER 2 — Wizard-friendly API (compat with original signatures)
// ════════════════════════════════════════════════════════════════════════════
//
// The wizards already use these shapes. This layer translates to/from layer 1.

export type Resolution = ConflictMode

/** Generic shape returned to wizards (covers CoA + Clients) */
export interface ImportSummary {
  inserted: number
  updated:  number
  skipped:  number
  errors:   Array<{ row: any; error: string }>
}

// ── Chart of Accounts wizard contract ──────────────────────────────────────

export interface DuplicateAccount {
  code:          string
  existing_id:   string
  existing_name: string
  existing_type: string
}

/**
 * Wizard calls this with a list of CODES to check for duplicates.
 * We need to send full rows to the preview RPC, so we build minimal rows.
 *
 * NOTE: The wizard already validated rows before calling this. We only need
 * a list of codes to detect existing records — we send minimal-but-valid
 * rows so the preview RPC doesn't reject them.
 *
 * 🆕 B3.7 v42 — Optional `clientId` for scoped conflict detection:
 * · undefined/null → matches against legacy accounts only
 * · UUID           → matches against per-client (same client) + legacy
 *
 * No more false positives across clients (resolved by v42 RPC update).
 */
export async function detectAccountDuplicates(
  orgId: string,
  codes: string[],
  clientId?: string | null  // 🆕 B3.7 v42
): Promise<DuplicateAccount[]> {
  if (codes.length === 0) return []

  // Build minimal rows just to drive the preview check
  const minimalRows: CoaImportRow[] = codes.map(code => ({
    code,
    name: '__placeholder__',
    type: 'asset'
  }))

  const preview = await previewCoaImport(orgId, minimalRows, clientId)

  return preview.conflicts.map(c => ({
    code:          c.code,
    existing_id:   c.existing.id,
    existing_name: c.existing.name,
    existing_type: c.existing.type
  }))
}

/**
 * Wizard calls this with rows + a resolutions map keyed by code.
 * We attach on_conflict to each row and call the import RPC.
 *
 * 🆕 B3.7 — Optional `clientId` parameter:
 * · undefined/null → legacy mode (creates firm-level accounts)
 * · UUID           → per-client mode (creates accounts scoped to the client)
 *
 * Per-client mode requires v40b RPC. If the v40b migration has been applied,
 * the RPC handles legacy-vs-per-client conflict resolution automatically.
 * Overwriting a legacy account from per-client mode raises a clear exception.
 */
export async function importChartOfAccounts(
  orgId: string,
  rows:  Array<{
    code:         string
    name:         string
    account_type: string
    description?: string | null
  }>,
  resolutions: Record<string, Resolution>,
  clientId?:   string | null  // 🆕 B3.7
): Promise<ImportSummary> {
  const payload: CoaImportRow[] = rows.map(r => ({
    code:        r.code,
    name:        r.name,
    type:        r.account_type as CoaImportRow['type'],
    on_conflict: resolutions[r.code] ?? 'skip',
    ...(r.description != null ? { description: r.description } : {})
  }))

  try {
    const result = await importCoaBatch(orgId, payload, clientId)
    return {
      inserted: result.inserted,
      updated:  result.updated,
      skipped:  result.skipped,
      errors:   []  // RPC raises on error; no per-row errors here
    }
  } catch (e: any) {
    // If the entire batch errored (e.g. v40b RAISE EXCEPTION for legacy
    // overwrite attempt), return a summary with the error message intact
    // so the wizard can surface it to the user.
    return {
      inserted: 0,
      updated:  0,
      skipped:  0,
      errors:   [{ row: { _batch: true }, error: e?.message ?? 'Batch import failed' }]
    }
  }
}

// ── Clients wizard contract ────────────────────────────────────────────────

export interface DuplicateClient {
  match_key:      string
  existing_id:    string
  existing_name:  string
  existing_email: string | null
}

/**
 * Wizard passes lowercased keys (email or display_name).
 * We build minimal preview rows where each key becomes either an email
 * (if it looks like one) or a display_name.
 */
export async function detectClientDuplicates(
  orgId: string,
  keys:  string[]
): Promise<DuplicateClient[]> {
  if (keys.length === 0) return []

  const minimalRows: ClientImportRow[] = keys.map(k => {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k)
    return {
      display_name: isEmail ? '__placeholder__' : k,
      ...(isEmail ? { email: k } : {})
    }
  })

  const preview = await previewClientsImport(orgId, minimalRows)

  return preview.conflicts.map(c => ({
    match_key:      c.match_key,
    existing_id:    c.existing.id,
    existing_name:  c.existing.display_name,
    existing_email: c.existing.email
  }))
}

/**
 * Wizard calls with full rows + resolutions keyed by match_key
 * (email lowercased, falling back to lowercased display_name).
 */
export async function importClients(
  orgId: string,
  rows:  Array<{
    display_name:     string
    company_name?:    string
    email?:           string
    phone?:           string
    tax_id?:          string
    address_line1?:   string
    city?:            string
    state?:           string
    postal_code?:     string
    country?:         string
    default_currency?: string
    payment_terms?:   number
  }>,
  resolutions: Record<string, Resolution>
): Promise<ImportSummary> {
  const payload: ClientImportRow[] = rows.map(r => {
    const matchKey = (r.email && r.email.trim())
      ? r.email.trim().toLowerCase()
      : r.display_name.trim().toLowerCase()
    return {
      ...r,
      on_conflict: resolutions[matchKey] ?? 'skip'
    }
  })

  try {
    const result = await importClientsBatch(orgId, payload)
    return {
      inserted: result.inserted,
      updated:  result.updated,
      skipped:  result.skipped,
      errors:   []
    }
  } catch (e: any) {
    return {
      inserted: 0,
      updated:  0,
      skipped:  0,
      errors:   [{ row: { _batch: true }, error: e?.message ?? 'Batch import failed' }]
    }
  }
}

// ── Opening Balances wizard contract ───────────────────────────────────────
//
// The wizard's call shape: importOpeningBalances(orgId, transitionDate, entries)
// The RPC also accepts an optional memo, which we default sensibly.

export interface OpeningBalanceEntry {
  account_code: string
  debit:        number
  credit:       number
  memo?:        string
}

export async function importOpeningBalances(
  orgId:          string,
  transitionDate: string,
  entries:        OpeningBalanceEntry[],
  memo            = 'Opening balances import',
  clientId?:      string | null   // firm mode: scope account resolution to this client
): Promise<OpeningBalanceResult> {
  const { data, error } = await db.rpc('import_opening_balances', {
    p_org_id:          orgId,
    p_transition_date: transitionDate,
    p_rows:            entries as unknown as Json,
    p_memo:            memo,
    ...(clientId ? { p_client_id: clientId } : {})
  })
  if (error) throw new Error(error.message)
  return data as unknown as OpeningBalanceResult
}