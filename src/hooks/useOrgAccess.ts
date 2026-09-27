// PATH: src/hooks/useOrgAccess.ts
//
// Whether the active workspace may be used: its owner's trial is running,
// the plan is paid, or it needs a plan chosen (get_org_access()). There are
// no free plans -- every plan starts with a trial -- so 'expired' shows the
// ChoosePlan screen instead of the app.
//
// Fails open (null) on a network/RPC error: the screen is a convenience, the
// database already zeroes the quota of an expired workspace.

import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'

export type OrgAccessState = 'trialing' | 'active' | 'past_due' | 'expired' | 'exempt'

export interface OrgAccess {
  state:         OrgAccessState
  plan:          string | null
  trial_ends_at: string | null
  days_left:     number | null
  is_owner:      boolean
}

export function useOrgAccess(orgId: string | null | undefined) {
  const [access,  setAccess]  = useState<OrgAccess | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!orgId) { setAccess(null); return }
    setLoading(true)
    const { data, error } = await db.rpc('get_org_access', { p_org_id: orgId })
    setAccess(error ? null : (data as unknown as OrgAccess))
    setLoading(false)
  }, [orgId])

  useEffect(() => { void refresh() }, [refresh])

  return { access, loading, refresh }
}
