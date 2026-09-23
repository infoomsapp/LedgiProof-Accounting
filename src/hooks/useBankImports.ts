import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getImports, processBankImport } from '../services/bank-import.service'
import { db } from '../lib/supabase'
import type { BankImport, TxSource } from '../types/database.types'
import { dbError } from '../lib/errors'

export const importKeys = {
  all:  (orgId: string) => ['bank_imports', orgId] as const,
  list: (orgId: string) => ['bank_imports', orgId, 'list'] as const
}

interface UploadImportInput {
  orgId:      string
  userId:     string
  source:     TxSource
  filename:   string
  rawContent: string
  rowCount:   number
}

async function uploadImport(input: UploadImportInput): Promise<BankImport> {
  const { data, error } = await db
    .from('bank_imports')
    .insert({
      org_id:      input.orgId,
      source:      input.source,
      filename:    input.filename,
      raw_content: input.rawContent,
      row_count:   input.rowCount,
      imported_by: input.userId
    })
    .select()
    .single()
  if (error) throw dbError(error, 'Failed to create the bank import')
  return data
}

export function useBankImports(orgId: string) {
  return useQuery({
    queryKey: importKeys.list(orgId),
    queryFn:  () => getImports(orgId),
    enabled:  !!orgId,
    refetchInterval: (query) => {
      // Poll every 3s while any import is processing
      const hasProcessing = query.state.data?.some(i => i.status === 'processing')
      return hasProcessing ? 3000 : false
    }
  })
}

export function useUploadImport(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: uploadImport,
    onSuccess:  () => qc.invalidateQueries({ queryKey: importKeys.all(orgId) })
  })
}

export function useProcessImport(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    // 🆕 Sprint 4 Fix C — accept optional clientId. Callers in firm-client
    // scope pass scope.clientId so CSV/OFX imports inherit it correctly.
    mutationFn: ({ importId, clientId }: { importId: string; clientId?: string | null }) =>
      processBankImport(importId, orgId, { ...(clientId !== undefined ? { clientId } : {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: importKeys.all(orgId) })
      qc.invalidateQueries({ queryKey: ['transactions', orgId] })
    }
  })
}
