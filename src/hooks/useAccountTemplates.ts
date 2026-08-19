// PATH: src/hooks/useAccountTemplates.ts
//
// Sprint 5 Paso 5.2 — React Query hooks for account templates.
//
// Used by:
//   · TemplatePicker UI (Paso 5.4) — list available templates
//   · Clone-on-create flow (Paso 5.5) — clone selected template to new client
//   · Settings > Templates page (future) — manage firm-custom templates

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listTemplates,
  getTemplateBundle,
  cloneTemplateToClient,
  createCustomTemplate,
  type ListTemplatesOptions,
  type CreateCustomTemplateInput
} from '../services/account-templates.service'
import { accountKeys } from './useAccounts'

// ── Query keys ────────────────────────────────────────────────────────────

export const templateKeys = {
  all:    (orgId: string)                                    => ['templates', orgId] as const,
  list:   (orgId: string, system?: boolean, custom?: boolean, category?: string) =>
    ['templates', orgId, 'list', system ?? true, custom ?? true, category ?? 'all'] as const,
  bundle: (templateId: string)                               => ['templates', 'bundle', templateId] as const
}

// ── Read hooks ────────────────────────────────────────────────────────────

export function useAccountTemplates(
  orgId:    string,
  options:  ListTemplatesOptions = {}
) {
  return useQuery({
    queryKey: templateKeys.list(orgId, options.includeSystem, options.includeCustom, options.category),
    queryFn:  () => listTemplates(orgId, options),
    enabled:  !!orgId,
    staleTime: 10 * 60_000   // templates change very rarely
  })
}

/**
 * Fetch a template + its items.
 *
 * Behavior when templateId is undefined/empty:
 *   · query is disabled (no fetch attempted)
 *   · returns { data: undefined, isLoading: false, isFetching: false, isSuccess: false }
 *   · UI consumers should check `if (!templateId || !data) return <empty />`
 *     instead of relying on isLoading alone.
 *
 * This pattern is documented to avoid the "always loading=false, data=undefined"
 * confusion that vanilla useQuery({ enabled }) can produce.
 */
export function useTemplateBundle(templateId: string | undefined) {
  const hasId = !!templateId && templateId.length > 0
  return useQuery({
    queryKey: hasId
      ? templateKeys.bundle(templateId!)
      : ['templates', 'bundle', '__disabled__'],
    queryFn:  () => getTemplateBundle(templateId!),
    enabled:  hasId,
    staleTime: 10 * 60_000
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

/**
 * Clone a template into a client. After success:
 *   · Invalidates accounts cache for the org (legacy + per-client lists)
 *   · UI flow typically navigates to /clients/:id/accounts after clone
 */
export function useCloneTemplate(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ templateId, clientId }: { templateId: string; clientId: string }) =>
      cloneTemplateToClient(templateId, clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all(orgId) })
    }
  })
}

export function useCreateCustomTemplate(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCustomTemplateInput) => createCustomTemplate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.all(orgId) })
  })
}