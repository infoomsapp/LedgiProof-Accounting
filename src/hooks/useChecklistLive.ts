// PATH: src/hooks/useChecklistLive.ts
//
// Checklist work now happens on the phone as well as here, so this page has to
// hear the app's changes (a task ticked, a checklist created or completed, a
// template paused) without a reload. Listens to the four checklist tables for
// one organization and calls onChange once per burst; Row Level Security decides
// which events reach this session.
//
// Same recovery rules as the chat hooks: a Realtime event is only a hint, so a
// reconnect and a tab coming back to the foreground both count as a change.

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const COALESCE_MS = 300
const TABLES = ['checklist_runs', 'checklist_run_items', 'recurring_checklists', 'recurring_checklist_items'] as const

export function useChecklistLive(orgId: string | null | undefined, onChange: () => void) {
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  const instanceId = useRef(Math.random().toString(36).slice(2))

  useEffect(() => {
    if (!orgId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; onChangeRef.current() }, COALESCE_MS)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') fire() }

    let channel = supabase.channel(`checklists-${orgId}-${instanceId.current}`)
    for (const table of TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` },
        fire
      )
    }
    let subscribedBefore = false
    channel.subscribe(status => {
      if (status !== 'SUBSCRIBED') return
      if (subscribedBefore) fire()
      subscribedBefore = true
    })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [orgId])
}
