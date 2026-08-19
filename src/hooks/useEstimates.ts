// PATH: src/hooks/useEstimates.ts
//
// React Query hooks for the Estimates module.
// Covers: list, single, create, update, items CRUD, send, accept/reject/counter,
// convert to invoice, and templates.
//
// Pattern matches useTransactions.ts. All mutations invalidate the relevant
// query keys so dashboards / lists refresh automatically.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createEstimate,
  updateEstimate,
  getEstimate,
  getEstimateItems,
  getEstimateWithItems,
  listEstimates,
  deleteEstimate,
  addEstimateItem,
  updateEstimateItem,
  deleteEstimateItem,
  sendEstimate,
  getEstimateByPublicToken,
  acceptEstimatePublic,
  rejectEstimatePublic,
  counterOfferPublic,
  convertEstimateToInvoice,
  listEstimateTemplates,
  getEstimateTemplate,
  createEstimateTemplate,
  updateEstimateTemplate,
  deleteEstimateTemplate,
  getEstimateSignatures,
  getEstimateResponses
} from '../services/estimate.service'
import type {
  EstimateStatus,
  EstimateTemplateCategory,
  CreateEstimateInput,
  AddEstimateItemInput,
  UpdateEstimateItemInput,
  UpdateEstimateInput
} from '../types/estimate'

// ── Query keys ────────────────────────────────────────────────────────────────

export const estimateKeys = {
  all:        (orgId: string)                            => ['estimates', orgId] as const,
  list:       (orgId: string, status?: EstimateStatus, clientId?: string) =>
                ['estimates', orgId, 'list', status ?? 'all', clientId ?? 'all'] as const,
  single:     (estimateId: string)                       => ['estimates', 'single', estimateId] as const,
  items:      (estimateId: string)                       => ['estimates', 'items', estimateId] as const,
  bundle:     (estimateId: string)                       => ['estimates', 'bundle', estimateId] as const,
  signatures: (estimateId: string)                       => ['estimates', 'signatures', estimateId] as const,
  responses:  (estimateId: string)                       => ['estimates', 'responses', estimateId] as const,
  templates:  (category?: EstimateTemplateCategory)      => ['estimate_templates', category ?? 'all'] as const,
  template:   (templateId: string)                       => ['estimate_template', templateId] as const,
  publicByToken: (token: string)                         => ['estimates', 'public', token] as const
}

// ═════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═════════════════════════════════════════════════════════════════════════════

/** List estimates for the bookkeeper/solo's org, filtered */
export function useEstimatesList(opts: {
  orgId:     string
  status?:   EstimateStatus
  clientId?: string
  limit?:    number
  offset?:   number
  enabled?:  boolean
}) {
  return useQuery({
    queryKey: estimateKeys.list(opts.orgId, opts.status, opts.clientId),
    queryFn:  () => listEstimates({
      orgId: opts.orgId,
      ...(opts.status   ? { status: opts.status }     : {}),
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
      limit:    opts.limit  ?? 50,
      offset:   opts.offset ?? 0
    }),
    enabled:   (opts.enabled ?? true) && !!opts.orgId,
    staleTime: 15_000
  })
}

/** Get a single estimate by id */
export function useEstimate(estimateId: string | null | undefined) {
  return useQuery({
    queryKey: estimateKeys.single(estimateId ?? ''),
    queryFn:  () => getEstimate(estimateId!),
    enabled:  !!estimateId,
    staleTime: 10_000
  })
}

/** Items for an estimate */
export function useEstimateItems(estimateId: string | null | undefined) {
  return useQuery({
    queryKey: estimateKeys.items(estimateId ?? ''),
    queryFn:  () => getEstimateItems(estimateId!),
    enabled:  !!estimateId,
    staleTime: 10_000
  })
}

/** Estimate + items (best for editor & detail view) */
export function useEstimateBundle(estimateId: string | null | undefined) {
  return useQuery({
    queryKey: estimateKeys.bundle(estimateId ?? ''),
    queryFn:  () => getEstimateWithItems(estimateId!),
    enabled:  !!estimateId,
    staleTime: 10_000
  })
}

/** Audit trail */
export function useEstimateSignatures(estimateId: string | null | undefined) {
  return useQuery({
    queryKey: estimateKeys.signatures(estimateId ?? ''),
    queryFn:  () => getEstimateSignatures(estimateId!),
    enabled:  !!estimateId
  })
}

export function useEstimateResponses(estimateId: string | null | undefined) {
  return useQuery({
    queryKey: estimateKeys.responses(estimateId ?? ''),
    queryFn:  () => getEstimateResponses(estimateId!),
    enabled:  !!estimateId
  })
}

/** Templates (global + org's custom) */
export function useEstimateTemplates(category?: EstimateTemplateCategory) {
  return useQuery({
    queryKey: estimateKeys.templates(category),
    queryFn:  () => listEstimateTemplates({ ...(category ? { category } : {}) }),
    staleTime: 5 * 60_000   // templates rarely change
  })
}

export function useEstimateTemplate(templateId: string | null | undefined) {
  return useQuery({
    queryKey: estimateKeys.template(templateId ?? ''),
    queryFn:  () => getEstimateTemplate(templateId!),
    enabled:  !!templateId,
    staleTime: 5 * 60_000
  })
}

/** Public estimate (by token — used in /e/:token page) */
export function useEstimatePublic(token: string | null | undefined, trackView = true) {
  return useQuery({
    queryKey: estimateKeys.publicByToken(token ?? ''),
    queryFn:  () => getEstimateByPublicToken({ token: token!, trackView }),
    enabled:  !!token,
    staleTime: 30_000,
    retry:    false   // don't retry: token errors are deterministic
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTATIONS — Estimate-level
// ═════════════════════════════════════════════════════════════════════════════

export function useCreateEstimate(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEstimateInput) => createEstimate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateKeys.all(orgId) })
    }
  })
}

export function useUpdateEstimate(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateEstimateInput) => updateEstimate(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: estimateKeys.single(vars.estimate_id) })
      qc.invalidateQueries({ queryKey: estimateKeys.bundle(vars.estimate_id) })
      qc.invalidateQueries({ queryKey: estimateKeys.all(orgId) })
    }
  })
}

export function useDeleteEstimate(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (estimateId: string) => deleteEstimate(estimateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: estimateKeys.all(orgId) })
    }
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTATIONS — Items
// ═════════════════════════════════════════════════════════════════════════════

/** Helper to invalidate the bundle, items, and the estimate (totals change) */
function invalidateEstimate(qc: ReturnType<typeof useQueryClient>, estimateId: string, orgId?: string) {
  qc.invalidateQueries({ queryKey: estimateKeys.bundle(estimateId) })
  qc.invalidateQueries({ queryKey: estimateKeys.items(estimateId) })
  qc.invalidateQueries({ queryKey: estimateKeys.single(estimateId) })
  if (orgId) qc.invalidateQueries({ queryKey: estimateKeys.all(orgId) })
}

export function useAddEstimateItem(estimateId: string, orgId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<AddEstimateItemInput, 'estimate_id'>) =>
                  addEstimateItem({ ...input, estimate_id: estimateId }),
    onSuccess: () => invalidateEstimate(qc, estimateId, orgId)
  })
}

export function useUpdateEstimateItem(estimateId: string, orgId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateEstimateItemInput) => updateEstimateItem(input),
    onSuccess: () => invalidateEstimate(qc, estimateId, orgId)
  })
}

export function useDeleteEstimateItem(estimateId: string, orgId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => deleteEstimateItem(itemId),
    onSuccess: () => invalidateEstimate(qc, estimateId, orgId)
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTATIONS — Send / Public / Convert
// ═════════════════════════════════════════════════════════════════════════════

export function useSendEstimate(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts: { estimateId: string; toEmail?: string; method?: 'email' | 'link_copied' | 'sms' }) =>
                  sendEstimate(opts),
    onSuccess: (_, vars) => {
      invalidateEstimate(qc, vars.estimateId, orgId)
    }
  })
}

/** Public — used by /e/:token page */
export function useAcceptEstimatePublic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts: { token: string; signerName: string; signatureText: string; signerEmail?: string }) =>
                  acceptEstimatePublic(opts),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: estimateKeys.publicByToken(vars.token) })
    }
  })
}

export function useRejectEstimatePublic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts: { token: string; reason: string; signerName?: string; signerEmail?: string }) =>
                  rejectEstimatePublic(opts),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: estimateKeys.publicByToken(vars.token) })
    }
  })
}

export function useCounterOfferPublic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts: Parameters<typeof counterOfferPublic>[0]) => counterOfferPublic(opts),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: estimateKeys.publicByToken(vars.token) })
    }
  })
}

export function useConvertEstimateToInvoice(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (estimateId: string) => convertEstimateToInvoice(estimateId),
    onSuccess: (_, estimateId) => {
      invalidateEstimate(qc, estimateId, orgId)
      // Also invalidate invoices list (which we don't manage here but exists)
      qc.invalidateQueries({ queryKey: ['invoices', orgId] })
    }
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTATIONS — Templates
// ═════════════════════════════════════════════════════════════════════════════

export function useCreateEstimateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createEstimateTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estimate_templates'] })
    }
  })
}

export function useUpdateEstimateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { templateId: string; patch: Parameters<typeof updateEstimateTemplate>[1] }) =>
                  updateEstimateTemplate(vars.templateId, vars.patch),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: estimateKeys.template(vars.templateId) })
      qc.invalidateQueries({ queryKey: ['estimate_templates'] })
    }
  })
}

export function useDeleteEstimateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteEstimateTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estimate_templates'] })
    }
  })
}
