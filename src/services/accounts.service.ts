// PATH: src/services/accounts.service.ts
//
// Sprint 5 Paso 5.2 — Centralized accounts service.
//
// This service replaces direct `db.from('accounts')` calls scattered
// across pages (ChartOfAccounts.tsx in particular). Per the Constitution:
//   "Strict Layer Separation: Never couple UI presentation with Business
//    Logic or Database State."
//
// SCOPE MODEL (post-v37):
//   · clientId provided  → returns/creates accounts scoped to that client
//   · clientId omitted   → returns ALL accounts of the org (including legacy)
//                          intended for the firm-level "manage legacy" UI
//
// LEGACY HANDLING:
//   · is_legacy=TRUE accounts have client_id=NULL by definition
//   · They surface in UI with a visual marker (handled in Paso 5.3)
//   · They cannot be picked when creating transactions for new clients
//     (enforced at app layer via `pickableAccounts` filter)
//   · assignLegacyToClient() migrates one explicitly via RPC

import { db } from '../lib/supabase'
import type { Account, Database } from '../types/database.types'

type AccountUpdate = Database['public']['Tables']['accounts']['Update']

// ── DTOs ────────────────────────────────────────────────────────────────

export interface GetAccountsOptions {
  /** Scope to a specific client. NULL = firm-wide (includes legacy). */
  clientId?:       string | null
  /** Include is_active=FALSE rows? Defaults to false. */
  includeInactive?: boolean
  /** Include is_legacy=TRUE rows? Defaults to true (visible but flagged). */
  includeLegacy?:   boolean
}

export interface CreateAccountInput {
  orgId:         string
  /** REQUIRED for post-v37 accounts. Pass null only when intentionally creating a firm-wide account (rare). */
  clientId:      string | null
  code:          string
  name:          string
  type:          'asset' | 'liability' | 'equity' | 'income' | 'expense'
  normalBalance: 'debit' | 'credit'
  parentId?:     string | null
  level?:        number
}

export interface UpdateAccountInput {
  code?:          string
  name?:          string
  type?:          'asset' | 'liability' | 'equity' | 'income' | 'expense'
  normalBalance?: 'debit' | 'credit'
  parentId?:      string | null
  isActive?:      boolean
}

// ── Read operations ─────────────────────────────────────────────────────

/**
 * Fetch accounts for a given org with optional client-scoping.
 *
 * Examples:
 *   getAccounts(orgId)                              → all firm accounts (legacy + scoped)
 *   getAccounts(orgId, { clientId: 'abc' })         → only that client's accounts
 *   getAccounts(orgId, { clientId: null })          → same as no clientId option
 *   getAccounts(orgId, { includeLegacy: false })    → only non-legacy
 */
export async function getAccounts(
  orgId: string,
  options: GetAccountsOptions = {}
): Promise<Account[]> {
  let q = db
    .from('accounts')
    .select('*')
    .eq('org_id', orgId)
    .order('code')

  if (!options.includeInactive) {
    q = q.eq('is_active', true)
  }

  // 🆕 Sprint 5 — Client scope filter.
  if (options.clientId !== undefined && options.clientId !== null) {
    q = q.eq('client_id', options.clientId)
  }

  // 🆕 Sprint 5 — Legacy filter.
  if (options.includeLegacy === false) {
    q = q.eq('is_legacy', false)
  }

  const { data, error } = await q
  if (error) throw new Error(`[Accounts] Fetch failed: ${error.message}`)
  return (data ?? []) as Account[]
}

/**
 * Convenience: fetch ONLY the legacy accounts of a firm.
 * Used by the "Manage Legacy Accounts" admin tool (Paso 5.3).
 */
export async function getLegacyAccounts(orgId: string): Promise<Account[]> {
  const { data, error } = await db
    .from('accounts')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_legacy', true)
    .order('code')

  if (error) throw new Error(`[Accounts] Fetch legacy failed: ${error.message}`)
  return (data ?? []) as Account[]
}

/**
 * Convenience: fetch the accounts USABLE in transaction creation for a client.
 *
 * ⚠ CONTRACT (Sprint 5 INVARIANT):
 *   The UI dropdown / picker for categorizing transactions MUST use this
 *   function (or equivalent filter). Legacy accounts and inactive accounts
 *   are NEVER pickable for new transactions on clients created after v37.
 *
 *   Filters applied:
 *     · client_id  = clientId        (scope to this client)
 *     · is_active  = true            (no archived/deactivated accounts)
 *     · is_legacy  = false           (no firm-wide pre-v37 accounts)
 *
 *   If the bookkeeper wants to use a legacy account for a new transaction,
 *   they MUST first call `assignLegacyToClient(accountId, clientId)` to
 *   migrate it. This is enforced by app layer; DB layer doesn't constrain.
 *
 * Used by:
 *   · TransactionDetail account picker (P4 work)
 *   · AccountAssignment dialog
 *   · Any other transaction-creation flow
 */
export async function getPickableAccounts(
  orgId:    string,
  clientId: string
): Promise<Account[]> {
  return getAccounts(orgId, {
    clientId,
    includeLegacy:   false,
    includeInactive: false
  })
}

/** Fetch a single account by id. Returns null if not found / no access (RLS). */
export async function getAccount(accountId: string): Promise<Account | null> {
  const { data, error } = await db
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle()

  if (error) throw new Error(`[Accounts] Get failed: ${error.message}`)
  return data as Account | null
}

// ── Write operations ────────────────────────────────────────────────────

/**
 * Create a new account.
 *
 * Post-v37 expectation: clientId is REQUIRED for all new accounts (firm-wide
 * accounts must only be the legacy ones). The DB allows NULL, but the app
 * layer enforces non-null here for safety.
 */
export async function createAccount(input: CreateAccountInput): Promise<Account> {
  // Defensive: post-v37 we don't want callers accidentally creating
  // un-scoped accounts. If you really need firm-wide, use a dedicated path.
  if (input.clientId === null) {
    throw new Error(
      '[Accounts] Refusing to create un-scoped account. Pass a clientId. ' +
      'Firm-wide accounts only exist as legacy pre-v37 rows.'
    )
  }

  // Pre-flight: check for duplicate code in the SAME client scope
  const { data: dup } = await db
    .from('accounts')
    .select('id')
    .eq('org_id',    input.orgId)
    .eq('client_id', input.clientId)
    .eq('code',      input.code)
    .maybeSingle()

  if (dup) {
    throw new Error(`[Accounts] Code ${input.code} already exists for this client.`)
  }

  const { data, error } = await db
    .from('accounts')
    .insert({
      org_id:         input.orgId,
      client_id:      input.clientId,
      code:           input.code,
      name:           input.name,
      type:           input.type,
      normal_balance: input.normalBalance,
      parent_id:      input.parentId ?? null,
      level:          input.level ?? (input.parentId ? 2 : 1),
      is_active:      true,
      is_legacy:      false
    })
    .select()
    .single()

  if (error) throw new Error(`[Accounts] Create failed: ${error.message}`)
  return data as Account
}

/**
 * Patch an existing account. Cannot change org_id or client_id via this path
 * (use assignLegacyToClient for legacy migration).
 */
export async function updateAccount(
  accountId: string,
  patch:     UpdateAccountInput
): Promise<Account> {
  const dbPatch: AccountUpdate = {}
  if (patch.code           !== undefined) dbPatch.code           = patch.code
  if (patch.name           !== undefined) dbPatch.name           = patch.name
  if (patch.type           !== undefined) dbPatch.type           = patch.type
  if (patch.normalBalance  !== undefined) dbPatch.normal_balance = patch.normalBalance
  if (patch.parentId       !== undefined) dbPatch.parent_id      = patch.parentId
  if (patch.isActive       !== undefined) dbPatch.is_active      = patch.isActive
  dbPatch.updated_at = new Date().toISOString()

  const { data, error } = await db
    .from('accounts')
    .update(dbPatch)
    .eq('id', accountId)
    .select()
    .single()

  if (error) throw new Error(`[Accounts] Update failed: ${error.message}`)
  return data as Account
}

/** Soft-delete (deactivate). Hard delete is restricted by RLS + FK constraints. */
export async function deactivateAccount(accountId: string): Promise<void> {
  const { error } = await db
    .from('accounts')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', accountId)

  if (error) throw new Error(`[Accounts] Deactivate failed: ${error.message}`)
}

// ── Legacy operations (Sprint 5 specific) ───────────────────────────────

/**
 * Migrate a legacy account (is_legacy=TRUE, client_id=NULL) to a specific
 * client. Wraps the v37 RPC `assign_legacy_account_to_client`.
 *
 * Side effects (server-side):
 *   1. client_id      ← p_client_id
 *   2. is_legacy      ← false
 *   3. name           ← strip " (Legacy)" suffix
 *   4. updated_at     ← NOW()
 *
 * Existing transactions referencing this account_id are NOT touched
 * (their account_id stays valid; only the account's scope changes).
 */
export async function assignLegacyToClient(
  accountId: string,
  clientId:  string
): Promise<void> {
  const { error } = await db.rpc('assign_legacy_account_to_client', {
    p_account_id: accountId,
    p_client_id:  clientId
  })

  if (error) throw new Error(`[Accounts] Assign legacy failed: ${error.message}`)
}
