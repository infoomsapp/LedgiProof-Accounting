// PATH: src/hooks/useAccountantDashboard.ts
//
// CQRS read path — dedicated hook for ACCOUNTANT FIRMS (is_accountant_firm = true).
//
// Push-based: subscribes to the 'accountant_dashboard' dirty signal via Supabase
// Realtime. A refresh fires only when a write (transaction, journal entry, invoice)
// marks the model dirty — no unconditional polling.
//
// Fallback:       5-minute safety-net interval for Realtime drops.
// Focus refresh:  re-fetches when the window regains focus.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAccountantDashboard,
  type AccountantDashboardData,
} from '../services/accountant-dashboard.service'
import { useReadModelSignal } from './useReadModelSignal'

const FALLBACK_INTERVAL_MS = 5 * 60 * 1_000

export interface UseAccountantDashboard {
  data:            AccountantDashboardData | null
  loading:         boolean
  refreshing:      boolean
  error:           string | null
  lastRefreshedAt: Date | null
  refresh:         () => Promise<void>
}

export function useAccountantDashboard(
  orgId:   string | null | undefined,
  enabled  = true,
): UseAccountantDashboard {
  const [data,            setData]            = useState<AccountantDashboardData | null>(null)
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
      const fresh = await getAccountantDashboard(orgId)
      setData(fresh)
      setLastRefreshedAt(new Date())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load accountant dashboard'
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

  // ── Push invalidation — fires when accountant_dashboard is marked dirty ────
  useReadModelSignal(enabled ? orgId : null, 'accountant_dashboard', refresh)

  // ── Fallback interval (safety net for Realtime drops) ─────────────────────
  useEffect(() => {
    if (!enabled || !orgId) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') refresh()
    }, FALLBACK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, orgId, refresh])

  // ── Focus refresh ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !orgId) return
    function onFocus() { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [enabled, orgId, refresh])

  return { data, loading, refreshing, error, lastRefreshedAt, refresh }
}
