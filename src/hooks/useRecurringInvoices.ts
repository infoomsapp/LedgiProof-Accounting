// PATH: src/hooks/useRecurringInvoices.ts
// Loads the org's recurring invoice schedules.

import { useCallback, useEffect, useState } from 'react'
import {
  getRecurringInvoices,
  type RecurringInvoiceWithClient
} from '../services/recurring-invoice.service'

export interface UseRecurringInvoices {
  data:    RecurringInvoiceWithClient[]
  loading: boolean
  error:   string | null
  refresh: () => Promise<void>
}

export function useRecurringInvoices(
  orgId: string | null | undefined,
  enabled = true
): UseRecurringInvoices {
  const [data, setData]       = useState<RecurringInvoiceWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!orgId || !enabled) { setLoading(false); return }
    setError(null)
    try {
      setData(await getRecurringInvoices(orgId))
    } catch (e: any) {
      setError(e?.message ?? 'Could not load recurring invoices')
    } finally {
      setLoading(false)
    }
  }, [orgId, enabled])

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, error, refresh }
}
