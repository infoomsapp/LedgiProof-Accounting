// PATH: src/hooks/useSoloDashboard.ts
// Loads SoloDashboard + Schedule C data, refreshes every 45s,
// reactive to year/quarter selection.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSoloDashboard,
  getScheduleCData,
  type SoloDashboardData,
  type ScheduleCData
} from '../services/solo-dashboard.service'

const REFRESH_INTERVAL_MS = 45_000

export interface UseSoloDashboard {
  dashboard:     SoloDashboardData | null
  scheduleC:     ScheduleCData | null
  loading:       boolean
  refreshing:    boolean
  error:         string | null
  year:          number
  quarter:       number
  setYear:       (y: number) => void
  setQuarter:    (q: number) => void
  refresh:       () => Promise<void>
}

function currentYear(): number {
  return new Date().getFullYear()
}
function currentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3)
}

export function useSoloDashboard(
  orgId: string | null | undefined,
  enabled = true
): UseSoloDashboard {
  const [year, setYear]       = useState<number>(currentYear())
  const [quarter, setQuarter] = useState<number>(currentQuarter())

  const [dashboard,  setDashboard]  = useState<SoloDashboardData | null>(null)
  const [scheduleC,  setScheduleC]  = useState<ScheduleCData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!orgId || !enabled || inFlight.current) return
    inFlight.current = true

    const isFirst = dashboard === null
    if (isFirst) setLoading(true)
    else         setRefreshing(true)
    setError(null)

    try {
      // Parallel load
      const [d, sc] = await Promise.all([
        getSoloDashboard(orgId, year, quarter),
        getScheduleCData(orgId, year)
      ])
      setDashboard(d)
      setScheduleC(sc)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
      inFlight.current = false
    }
  }, [orgId, enabled, year, quarter, dashboard])

  // Initial + reactive to year/quarter changes
  useEffect(() => {
    if (!enabled || !orgId) {
      setLoading(false)
      return
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, enabled, year, quarter])

  // Periodic refresh
  useEffect(() => {
    if (!enabled || !orgId) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') refresh()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, orgId, refresh])

  // Refresh on window focus
  useEffect(() => {
    if (!enabled || !orgId) return
    function onFocus() { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [enabled, orgId, refresh])

  return {
    dashboard, scheduleC,
    loading, refreshing, error,
    year, quarter,
    setYear, setQuarter,
    refresh
  }
}