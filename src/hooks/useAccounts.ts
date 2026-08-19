// PATH: src/hooks/useAccounts.ts
//
// Sprint 5 Paso 5.2 — Account hooks (client-scoped).
//
// Refactor of the old useAccounts that read directly from the DB.
// Now delegates to accounts.service.ts (Constitution: Strict Layer Separation).
//
// Query keys include clientId so React Query caches per-client separately.
//
// BACKWARD COMPAT:
//   · useAccounts(orgId)             → firm-wide (legacy + scoped, like before)
//   · useAccounts(orgId, clientId)   → only that client's accounts
//   · useAccounts(orgId, null)       → same as no clientId
//   · useAccounts(orgId, '', opts)   → same as no clientId (empty string treated as null)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAccounts,
  getLegacyAccounts,
  getPickableAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deactivateAccount,
  assignLegacyToClient,
  type CreateAccountInput,
  type GetAccountsOptions
} from '../services/accounts.service'

// ── Query keys ────────────────────────────────────────────────────────────

export const accountKeys = {
  all:      (orgId: string)                                       =>
    ['accounts', orgId] as const,
  list:     (orgId: string, clientId?: string | null, scope?: string) =>
    ['accounts', orgId, 'list', clientId ?? 'firm-wide', scope ?? 'default'] as const,
  legacy:   (orgId: string)                                       =>
    ['accounts', orgId, 'legacy'] as const,
  pickable: (orgId: string, clientId: string)                     =>
    ['accounts', orgId, 'pickable', clientId] as const,
  single:   (accountId: string)                                    =>
    ['accounts', 'single', accountId] as const
}

// ── Hooks ─────────────────────────────────────────────────────────────────

/**
 * Fetch a single account by id.
 *
 * Behavior when accountId is undefined/empty:
 *   · query is disabled (no fetch attempted)
 *   · returns { data: undefined, isLoading: false, isSuccess: false }
 *   · UI consumers should check `if (!accountId || !data) return <empty />`
 *
 * Used by: account detail drawers, edit flows, transaction account lookups.
 */
export function useAccount(accountId: string | undefined) {
  const hasId = !!accountId && accountId.length > 0
  return useQuery({
    queryKey: hasId
      ? accountKeys.single(accountId!)
      : ['accounts', 'single', '__disabled__'],
    queryFn:  () => getAccount(accountId!),
    enabled:  hasId,
    staleTime: 5 * 60_000
  })
}

/**
 * Fetch accounts with optional client-scoping.
 *
 * Examples:
 *   useAccounts(orgId)                              → all firm accounts
 *   useAccounts(orgId, clientId)                    → only that client's accounts
 *   useAccounts(orgId, clientId, { includeLegacy:false }) → only non-legacy
 */
export function useAccounts(
  orgId:    string,
  clientId?: string | null,
  options:   Omit<GetAccountsOptions, 'clientId'> = {}
) {
  // Empty string from URL params → null (treat as firm-wide)
  const normalizedClientId = clientId || null
  const scopeTag = `${options.includeInactive ?? false}-${options.includeLegacy ?? true}`

  return useQuery({
    queryKey: accountKeys.list(orgId, normalizedClientId, scopeTag),
    queryFn:  () => getAccounts(orgId, { ...options, clientId: normalizedClientId }),
    enabled:  !!orgId,
    staleTime: 5 * 60_000  // accounts change rarely
  })
}

/** Fetch ONLY the legacy accounts of a firm. Used by "Manage Legacy" admin tool. */
export function useLegacyAccounts(orgId: string) {
  return useQuery({
    queryKey: accountKeys.legacy(orgId),
    queryFn:  () => getLegacyAccounts(orgId),
    enabled:  !!orgId,
    staleTime: 5 * 60_000
  })
}

/** Fetch accounts USABLE for transaction creation for a specific client. */
export function usePickableAccounts(orgId: string, clientId: string) {
  return useQuery({
    queryKey: accountKeys.pickable(orgId, clientId),
    queryFn:  () => getPickableAccounts(orgId, clientId),
    enabled:  !!orgId && !!clientId,
    staleTime: 5 * 60_000
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

export function useCreateAccount(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAccountInput) => createAccount(input),
    onSuccess:  () => qc.invalidateQueries({ queryKey: accountKeys.all(orgId) })
  })
}

export function useUpdateAccount(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, patch }: { accountId: string; patch: Parameters<typeof updateAccount>[1] }) =>
      updateAccount(accountId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.all(orgId) })
  })
}

export function useDeactivateAccount(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => deactivateAccount(accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.all(orgId) })
  })
}

/**
 * Migrate a legacy account to a specific client.
 * After success, invalidates BOTH the firm-wide cache AND the legacy cache.
 */
export function useAssignLegacyToClient(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, clientId }: { accountId: string; clientId: string }) =>
      assignLegacyToClient(accountId, clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all(orgId) })
      qc.invalidateQueries({ queryKey: accountKeys.legacy(orgId) })
    }
  })
}

// ── Re-export DTOs for callers that previously imported from this module ──
export type { CreateAccountInput } from '../services/accounts.service'