import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAuditTrail,
  getRecentEvents,
  getOrgActivityFeed,
  verifyOrgChain
} from '../services/audit.service'

export const auditKeys = {
  all:     (orgId: string)    => ['audit', orgId] as const,
  trail:   (groupId: string)  => ['audit', 'trail', groupId] as const,
  recent:  (orgId: string)    => ['audit', orgId, 'recent'] as const,
  activity: (orgId: string)   => ['audit', orgId, 'activity'] as const,
  verify:  (orgId: string)    => ['audit', orgId, 'verify'] as const
}

export function useAuditTrail(transactionGroupId: string, orgId: string) {
  return useQuery({
    queryKey: auditKeys.trail(transactionGroupId),
    queryFn:  () => getAuditTrail(transactionGroupId, orgId),
    enabled:  !!transactionGroupId && !!orgId
  })
}

export function useRecentAuditEvents(orgId: string, limit = 20) {
  return useQuery({
    queryKey: auditKeys.recent(orgId),
    queryFn:  () => getRecentEvents(orgId, limit),
    enabled:  !!orgId,
    staleTime: 15_000
  })
}

// Enriched activity feed — actor name + transaction description already
// joined server-side (see get_org_activity_feed RPC). Use this for
// dashboard "recent activity" widgets instead of useRecentAuditEvents,
// which returns raw audit_events rows with no human-readable fields.
export function useOrgActivityFeed(orgId: string, limit = 12) {
  return useQuery({
    queryKey: auditKeys.activity(orgId),
    queryFn:  () => getOrgActivityFeed(orgId, limit),
    enabled:  !!orgId,
    staleTime: 15_000
  })
}

export function useVerifyChain(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => verifyOrgChain(orgId),
    onSuccess: (result) => {
      qc.setQueryData(auditKeys.verify(orgId), result)
    }
  })
}
