// PATH: src/hooks/useExchangeRates.ts
//
// Session-level exchange rates cache. Refreshes once per hour — rates are
// stable enough for display purposes.
// The fetch-exchange-rates Edge Function updates the DB daily.

import { useCallback, useEffect, useState } from 'react'
import { getRatesMap }                      from '../services/exchange-rate.service'
import { convertAmount, formatCurrency }    from '../lib/currency'
import type { ExchangeRates }               from '../lib/currency'

const CACHE_TTL = 60 * 60 * 1_000  // 1 hour

let _rates:     ExchangeRates | null = null
let _cachedAt:  number               = 0

export interface UseExchangeRates {
  rates:   ExchangeRates | null
  loading: boolean
  /** Convert amount from one currency to another using cached rates. */
  convert: (amount: number, from: string, to: string) => number
  /** Convert + format in one call. */
  format:  (amount: number, fromCurrency: string, toCurrency: string) => string
}

export function useExchangeRates(): UseExchangeRates {
  const [rates,   setRates]   = useState<ExchangeRates | null>(_rates)
  const [loading, setLoading] = useState(_rates === null)

  useEffect(() => {
    if (_rates && Date.now() - _cachedAt < CACHE_TTL) {
      setRates(_rates)
      setLoading(false)
      return
    }
    setLoading(true)
    getRatesMap()
      .then(r => { _rates = r; _cachedAt = Date.now(); setRates(r) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // convertAmount now throws when a currency has no rate in `_rates` (see
  // lib/currency.ts) rather than silently returning a 1:1 amount — caught
  // here so a still-missing rate degrades honestly (NaN / "—") instead of
  // crashing whatever calls this hook.
  const convert = useCallback((amount: number, from: string, to: string): number => {
    if (!_rates || from === to) return amount
    try {
      return convertAmount(amount, from, to, _rates)
    } catch (e) {
      console.error('[useExchangeRates]', e)
      return NaN
    }
  }, [rates])  // eslint-disable-line react-hooks/exhaustive-deps

  const format = useCallback((amount: number, fromCurrency: string, toCurrency: string): string => {
    const converted = convert(amount, fromCurrency, toCurrency)
    return Number.isNaN(converted) ? '—' : formatCurrency(converted, toCurrency)
  }, [convert])

  return { rates, loading, convert, format }
}
