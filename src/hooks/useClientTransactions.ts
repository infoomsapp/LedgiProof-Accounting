// PATH: src/hooks/useClientTransactions.ts
//
// Bug fix (2026-07-09): the impersonation branches used to call
// get_transactions_admin / get_client_stats_admin — RPCs that either
// don't exist in the DB at all (get_client_stats_admin) or exist with a
// different signature than what was being called (get_transactions_admin
// only accepts p_org_id/p_client_id/p_limit, not p_semaphore/p_date_from/
// p_date_to). Every impersonation session was silently failing into the
// error branch. RLS already grants org staff (bookkeepers/admins/etc, via
// is_org_member(org_id)) direct read access to `transactions` and
// `v_client_dashboard_stats`, so there is no need for an admin bypass RPC
// at all — the same query path now works for both normal and impersonated
// sessions.

import { useQuery } from '@tanstack/react-query'
import { db }       from '../lib/supabase'

import type { Transaction, SemaphoreStatus } from '../types/database.types'

const clientTxKeys = {
  all: (clientId: string) => ['client-transactions', clientId] as const,
  list: (clientId: string, sem?: SemaphoreStatus) =>
    [...clientTxKeys.all(clientId), 'list', sem ?? 'all'] as const
}

interface ClientTxFilters {
  semaphore?: SemaphoreStatus
  dateFrom?: string
  dateTo?: string
}

export function useClientTransactions(
  clientId: string,
  filters?: ClientTxFilters,
  tick = 0
) {
  return useQuery({
    queryKey: [
      ...clientTxKeys.list(clientId, filters?.semaphore),
      filters?.dateFrom,
      filters?.dateTo,
      tick
    ],

    queryFn: async () => {
      let q = db
        .from('transactions')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_current', true)
        .order('transaction_date', { ascending: false })
        .limit(200)

      if (filters?.semaphore) q = q.eq('semaphore', filters.semaphore)
      if (filters?.dateFrom)  q = q.gte('transaction_date', filters.dateFrom)
      if (filters?.dateTo)    q = q.lte('transaction_date', filters.dateTo)

      const { data, error } = await q
      if (error) throw new Error(error.message)

      return (data ?? []) as Transaction[]
    },

    enabled: !!clientId,
    staleTime: 30_000
  })
}

// ── Dashboard stats ───────────────────────────────────────────

export interface ClientDashboardStats {
  client_id:                string
  total_transactions:       number
  pending_amber:            number
  pending_red:              number
  verified_blue:            number
  in_review_green:          number
  latest_transaction_date:  string | null
  recent_messages_count:    number
}

export function useClientStats(clientId: string) {
  return useQuery({
    queryKey: ['client-stats', clientId],

    queryFn: async (): Promise<ClientDashboardStats> => {
      const { data } = await db
        .from('v_client_dashboard_stats')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle()

      return {
        client_id:               data?.client_id ?? clientId,
        total_transactions:      data?.total_transactions ?? 0,
        pending_amber:           data?.pending_amber ?? 0,
        pending_red:             data?.pending_red ?? 0,
        verified_blue:           data?.verified_blue ?? 0,
        in_review_green:         data?.in_review_green ?? 0,
        latest_transaction_date: data?.latest_transaction_date ?? null,
        recent_messages_count:   data?.recent_messages_count ?? 0
      }
    },

    enabled: !!clientId,
    staleTime: 30_000
  })
}
