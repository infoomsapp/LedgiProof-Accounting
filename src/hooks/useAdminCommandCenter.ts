// PATH: src/hooks/useAdminCommandCenter.ts
// Loads the command center data + auto-refreshes every 30s.
// Pauses refresh when the tab is hidden (battery-friendly).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getCommandCenter,
  type CommandCenterData
} from '../services/admin-command.service'

const REFRESH_INTERVAL_MS = 30_000

export interface UseAdminCommandCenter {
  data:            CommandCenterData | null
  loading:         boolean
  refreshing:      boolean   // distinct from initial loading
  error:           string | null
  lastRefreshedAt: Date | null
  refresh:         () => Promise<void>
}

export function useAdminCommandCenter(enabled = true): UseAdminCommandCenter {
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true

    const isFirstLoad = data === null
    if (isFirstLoad) setLoading(true)
    else             setRefreshing(true)
    setError(null)

    try {
      const fresh = await getCommandCenter()
      setData(fresh)
      setLastRefreshedAt(new Date())
    } catch (e: any) {
      setError(e?.message ?? 'Could not load command center')
    } finally {
      setLoading(false)
      setRefreshing(false)
      inFlight.current = false
    }
  }, [data])

  // Initial load
  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // Auto-refresh tick
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') refresh()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, refresh])

  // Refresh on tab focus
  useEffect(() => {
    if (!enabled) return
    function onFocus() { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [enabled, refresh])

  return {
    data,
    loading,
    refreshing,
    error,
    lastRefreshedAt,
    refresh
  }
}