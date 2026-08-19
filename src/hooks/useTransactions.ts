import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTransactions,
  getTransactionHistory,
  createTransaction,
  editTransaction,
  approveTransaction,
  lockTransaction,
  type CreateTransactionInput,
  type EditTransactionInput,
  type ApproveTransactionInput
} from '../services/transactions.service'
import type { SemaphoreStatus } from '../types/database.types'

// ── Query keys ────────────────────────────────────────────────────────────────

export const txKeys = {
  all:     (orgId: string)                          => ['transactions', orgId] as const,
  list:    (orgId: string, sem?: SemaphoreStatus, clientId?: string | null) =>
             ['transactions', orgId, 'list', sem ?? 'all', clientId ?? 'all-clients'] as const,
  history: (groupId: string)                        => ['transactions', 'history', groupId] as const
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useTransactions(
  orgId: string,
  filters?: {
    semaphore?: SemaphoreStatus
    dateFrom?:  string
    dateTo?:    string
    /**
     * 🆕 Client Switcher Sprint 3 — Scope filter.
     * Pass scope.clientId from useScope() in pages.
     * Undefined/null = no filter (legacy behavior).
     */
    clientId?:  string | null
  },
  tick = 0
) {
  return useQuery({
    queryKey: [
      ...txKeys.list(orgId, filters?.semaphore, filters?.clientId),
      filters?.dateFrom,
      filters?.dateTo,
      tick
    ],
    queryFn:  () => getTransactions(orgId, {
      ...(filters?.semaphore ? { semaphore: filters.semaphore } : {}),
      ...(filters?.dateFrom  ? { dateFrom: filters.dateFrom }   : {}),
      ...(filters?.dateTo    ? { dateTo: filters.dateTo }       : {}),
      ...(filters?.clientId  ? { client_id: filters.clientId }  : {}),
      limit: 500
    }),
    enabled:  !!orgId,
    staleTime: 30_000
  })
}

export function useTransactionHistory(transactionGroupId: string) {
  return useQuery({
    queryKey: txKeys.history(transactionGroupId),
    queryFn:  () => getTransactionHistory(transactionGroupId),
    enabled:  !!transactionGroupId
  })
}

export function useCreateTransaction(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => createTransaction(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: txKeys.all(orgId) })
  })
}

export function useEditTransaction(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: EditTransactionInput) => editTransaction(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: txKeys.all(orgId) })
  })
}

export function useApproveTransaction(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ApproveTransactionInput) => approveTransaction(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: txKeys.all(orgId) })
  })
}

export function useLockTransaction(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transactionId }: { transactionId: string }) =>
      lockTransaction(transactionId, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: txKeys.all(orgId) })
  })
}
