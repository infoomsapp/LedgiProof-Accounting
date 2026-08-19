// PATH: src/hooks/useMileage.ts
// React Query hooks for manual mileage tracking.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addMileageEntry,
  getMileageSummary,
  listMileageEntries,
  type AddMileageInput,
  type MileageSummary,
  type MileageEntry
} from '../services/mileage.service'

const mileageKeys = {
  all:     (orgId: string) => ['mileage', orgId] as const,
  summary: (orgId: string, year: number, clientId?: string | null) =>
    ['mileage', orgId, 'summary', year, clientId ?? null] as const,
  entries: (orgId: string, year: number, clientId?: string | null) =>
    ['mileage', orgId, 'entries', year, clientId ?? null] as const
}

export function useMileageSummary(orgId: string, year: number, clientId?: string | null) {
  return useQuery<MileageSummary>({
    queryKey: mileageKeys.summary(orgId, year, clientId),
    queryFn:  () => getMileageSummary(orgId, year, clientId),
    enabled:  !!orgId
  })
}

export function useMileageEntries(orgId: string, year: number, clientId?: string | null) {
  return useQuery<MileageEntry[]>({
    queryKey: mileageKeys.entries(orgId, year, clientId),
    queryFn:  () => listMileageEntries(orgId, year, clientId),
    enabled:  !!orgId
  })
}

export function useAddMileage(orgId: string, year: number, clientId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AddMileageInput) => addMileageEntry(input),
    // Invalidate BOTH summary and entries so the total and the list refresh.
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: mileageKeys.all(orgId) })
    }
  })
}
