// PATH: src/hooks/useBookkeeperDashboard.ts
//
// CQRS read path for the bookkeeper dashboard.
//
// BEFORE (pull-based):
//   setInterval(refresh, 45_000) — re-fetches unconditionally every 45s
//   per tenant, regardless of whether any data changed. With N tenants
//   this creates a steady background load on the DB.
//
// AFTER (push-based):
//   1. Initial load on mount (unchanged).
//   2. useReadModelSignal subscribes to `read_model_dirty` via Supabase Realtime.
//      When a write dirtied the dashboard (transaction insert, invoice update, etc.)
//      the DB trigger upserts a row → Realtime fires → refresh() is called.
//   3. A 5-minute fallback interval remains as a safety net for Realtime
//      connection drops. This is 6× longer than before but only fires
//      when the signal hasn't already triggered a refresh.
//   4. Window focus refresh is preserved (no change from before).
//
// The write side calls markReadModelDirty(orgId, [...]) from
// transactions.service.ts and other write services after committing.
// The DB trigger on `transactions` does the same for writes that bypass
// the service layer.
//
// NOTE: This hook is for BOOKKEEPER FIRMS only.
//   AccountantDashboard uses useAccountantDashboard (dedicated hook).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getBookkeeperDashboard,
  type BookkeeperDashboardData
} from '../services/bookkeeper-dashboard.service'
import { useReadModelSignal } from './useReadModelSignal'

// Safety-net fallback — only fires when Realtime misses an event.
const FALLBACK_INTERVAL_MS = 5 * 60 * 1_000   // 5 minutes (was 45s)

export interface UseBookkeeperDashboard {
  data:            BookkeeperDashboardData | null
  loading:         boolean
  refreshing:      boolean
  error:           string | null
  lastRefreshedAt: Date | null
  refresh:         () => Promise<void>
}

export function useBookkeeperDashboard(
  orgId:   string | null | undefined,
  enabled  = true,
): UseBookkeeperDashboard {
  const [data,            setData]            = useState<BookkeeperDashboardData | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [refreshing,      setRefreshing]      = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!orgId || !enabled || inFlight.current) return
    inFlight.current = true

    const isFirst = data === null
    if (isFirst) setLoading(true); else setRefreshing(true)
    setError(null)

    try {
      const fresh = await getBookkeeperDashboard(orgId)
      setData(fresh)
      setLastRefreshedAt(new Date())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load dashboard'
      setError(msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
      inFlight.current = false
    }
  }, [orgId, enabled, data])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !orgId) { setLoading(false); return }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, enabled])

  // ── Push-based invalidation via Realtime dirty signal ─────────────────────
  useReadModelSignal(enabled ? orgId : null, 'bookkeeper_dashboard', refresh)

  // ── Fallback interval (safety net for Realtime drops) ─────────────────────
  useEffect(() => {
    if (!enabled || !orgId) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') refresh()
    }, FALLBACK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, orgId, refresh])

  // ── Refresh on window focus ───────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !orgId) return
    function onFocus() { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [enabled, orgId, refresh])

  return { data, loading, refreshing, error, lastRefreshedAt, refresh }
}
