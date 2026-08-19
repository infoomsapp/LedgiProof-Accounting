// PATH: src/hooks/useVendors.ts
//
// 1099 Fase 1 — Vendor hooks (React Query). Delegan en vendor.service
// (Constitution: Strict Layer Separation). Query keys por org + client.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  deactivateVendor,
  type Vendor,
  type VendorInsert,
  type VendorUpdate,
  type ListVendorsOptions
} from '../services/vendor.service'

export const vendorKeys = {
  all:  (orgId: string) => ['vendors', orgId] as const,
  list: (orgId: string, clientId?: string | null) =>
    ['vendors', orgId, 'list', clientId ?? 'all'] as const,
  single: (id: string) => ['vendors', 'single', id] as const
}

export function useVendors(orgId: string, opts: ListVendorsOptions = {}) {
  return useQuery({
    queryKey: vendorKeys.list(orgId, opts.clientId ?? null),
    queryFn:  () => listVendors(orgId, opts),
    enabled:  !!orgId,
    staleTime: 60_000
  })
}

export function useVendor(id: string | undefined) {
  const hasId = !!id
  return useQuery({
    queryKey: hasId ? vendorKeys.single(id!) : ['vendors', 'single', '__disabled__'],
    queryFn:  () => getVendor(id!),
    enabled:  hasId,
    staleTime: 60_000
  })
}

export function useCreateVendor(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: VendorInsert) => createVendor(input),
    onSuccess:  () => qc.invalidateQueries({ queryKey: vendorKeys.all(orgId) })
  })
}

export function useUpdateVendor(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: VendorUpdate }) => updateVendor(id, patch),
    onSuccess:  () => qc.invalidateQueries({ queryKey: vendorKeys.all(orgId) })
  })
}

export function useDeactivateVendor(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivateVendor(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: vendorKeys.all(orgId) })
  })
}

export type { Vendor, VendorInsert, VendorUpdate }
