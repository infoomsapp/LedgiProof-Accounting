// PATH: src/hooks/useFirmInsights.ts
// Loads the firm parity insights (AR aging, cash flow, anomalies, P&L) in a
// single RPC call. Refreshes on focus; lighter cadence than the main dashboard.

import { useCallback, useEffect, useRef, useState } from 'react'
import { getFirmInsights, type FirmInsights } from '../services/firm-insights.service'

export interface UseFirmInsights {
  data:    FirmInsights | null
  loading: boolean
  error:   string | null
  refresh: () => Promise<void>
}

export function useFirmInsights(
  orgId: string | null | undefined,
  enabled = true,
  months = 6
): UseFirmInsights {
  const [data, setData]       = useState<FirmInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!orgId || !enabled || inFlight.current) return
    inFlight.current = true
    setError(null)
    try {
      setData(await getFirmInsights(orgId, months))
    } catch (e: any) {
      setError(e?.message ?? 'Could not load insights')
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [orgId, enabled, months])

  useEffect(() => {
    if (!enabled || !orgId) { setLoading(false); return }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, enabled])

  return { data, loading, error, refresh }
}
