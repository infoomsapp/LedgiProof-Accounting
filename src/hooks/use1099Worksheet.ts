// PATH: src/hooks/use1099Worksheet.ts
//
// 1099 Fase 3 — hook para el worksheet acumulado (React Query).

import { useQuery } from '@tanstack/react-query'
import { get1099Worksheet, type Worksheet1099Row } from '../services/tax1099.service'

export function use1099Worksheet(orgId: string, taxYear: number, clientId?: string | null) {
  return useQuery({
    queryKey: ['1099-worksheet', orgId, taxYear, clientId ?? 'all'],
    queryFn:  () => get1099Worksheet(orgId, taxYear, clientId ?? null),
    enabled:  !!orgId && !!taxYear,
    staleTime: 30_000
  })
}

export type { Worksheet1099Row }
