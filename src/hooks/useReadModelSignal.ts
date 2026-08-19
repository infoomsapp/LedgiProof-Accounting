// PATH: src/hooks/useReadModelSignal.ts
//
// CQRS — React hook that subscribes to Realtime dirty signals for a
// specific read model and org, then calls onDirty() when the signal fires.
//
// Usage (inside useBookkeeperDashboard, useSoloDashboard, etc.):
//
//   useReadModelSignal(orgId, 'bookkeeper_dashboard', refresh)
//
// The hook opens one Supabase Realtime channel per (orgId, model) pair
// and closes it on unmount or when the orgId changes.
//
// The onDirty callback should be stable (wrapped in useCallback) to prevent
// the channel from being torn down and re-opened on every render.

import { useEffect, useRef } from 'react'
import { db }                 from '../lib/supabase'
import type { ReadModelName } from '../lib/read-model'

export function useReadModelSignal(
  orgId:   string | null | undefined,
  model:   ReadModelName,
  onDirty: () => void
): void {
  // Stable random suffix per hook mount — prevents channel-name collisions
  // when multiple instances subscribe to the same (model, orgId), and avoids
  // the StrictMode double-invoke problem where removeChannel on a shared name
  // would tear down sibling subscriptions.
  const instanceId = useRef(Math.random().toString(36).slice(2))

  // Always keep the ref current so the callback never goes stale inside the
  // Realtime handler, without requiring it to be a channel-effect dependency.
  const onDirtyRef = useRef(onDirty)
  useEffect(() => { onDirtyRef.current = onDirty })

  useEffect(() => {
    if (!orgId) return

    const channelName = `rm-${model}-${orgId}-${instanceId.current}`

    const channel = db
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'read_model_dirty',
          filter: `org_id=eq.${orgId}`,
        },
        (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          const row = payload.new ?? payload.old
          if (row?.['model'] === model) {
            onDirtyRef.current()
          }
        }
      )
      .subscribe((status: string) => {
        if (import.meta.env.DEV) {
          console.debug(`[ReadModelSignal] ${channelName} → ${status}`)
        }
      })

    return () => {
      db.removeChannel(channel)
    }
  }, [orgId, model])   // onDirty and instanceId intentionally excluded — refs handle them
}
