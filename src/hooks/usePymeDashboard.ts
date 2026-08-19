// PATH: src/hooks/usePymeDashboard.ts
// Loads PYME dashboard via get_pyme_dashboard RPC.
// Auto-refreshes every 45s + on window focus.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getPymeDashboard,
  type PymeDashboardData
} from '../services/pyme-dashboard.service'

const REFRESH_INTERVAL_MS = 45_000

export interface UsePymeDashboard {
  data:            PymeDashboardData | null
  loading:         boolean
  refreshing:      boolean
  error:           string | null
  lastRefreshedAt: Date | null
  refresh:         () => Promise<void>
}

export function usePymeDashboard(
  clientId: string | null | undefined,
  enabled  = true
): UsePymeDashboard {
  const [data,            setData]            = useState<PymeDashboardData | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [refreshing,      setRefreshing]      = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!clientId || !enabled || inFlight.current) return
    inFlight.current = true

    const isFirst = data === null
    if (isFirst) setLoading(true); else setRefreshing(true)
    setError(null)

    try {
      const fresh = await getPymeDashboard(clientId)
      setData(fresh)
      setLastRefreshedAt(new Date())
    } catch (e: any) {
      setError(e?.message ?? 'Could not load dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
      inFlight.current = false
    }
  }, [clientId, enabled, data])

  // Initial load
  useEffect(() => {
    if (!enabled || !clientId) {
      setLoading(false)
      return
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, enabled])

  // Periodic refresh
  useEffect(() => {
    if (!enabled || !clientId) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') refresh()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, clientId, refresh])

  // Refresh on window focus
  useEffect(() => {
    if (!enabled || !clientId) return
    function onFocus() { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [enabled, clientId, refresh])

  return { data, loading, refreshing, error, lastRefreshedAt, refresh }
}