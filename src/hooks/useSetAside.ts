// PATH: src/hooks/useSetAside.ts
// Solo — hooks del apartado de impuestos (set-aside).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSetAsideSummary, listSetAsideEntries, addSetAside, updateSetAsideRate
} from '../services/setaside.service'

export function useSetAsideSummary(orgId: string, year: number, clientId?: string | null) {
  return useQuery({
    queryKey: ['setaside-summary', orgId, year, clientId ?? 'self'],
    queryFn:  () => getSetAsideSummary(orgId, year, clientId ?? null),
    enabled:  !!orgId
  })
}

export function useSetAsideEntries(orgId: string, year: number, clientId?: string | null) {
  return useQuery({
    queryKey: ['setaside-entries', orgId, year, clientId ?? 'self'],
    queryFn:  () => listSetAsideEntries(orgId, year, clientId ?? null),
    enabled:  !!orgId
  })
}

export function useAddSetAside(orgId: string, year: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof addSetAside>[0]) => addSetAside(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['setaside-summary', orgId, year] })
      qc.invalidateQueries({ queryKey: ['setaside-entries', orgId, year] })
    }
  })
}

export function useUpdateSetAsideRate(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rate: number) => updateSetAsideRate(orgId, rate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setaside-summary', orgId] })
  })
}
