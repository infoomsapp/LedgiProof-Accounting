// PATH: src/lib/currency.ts
//
// Shared currency utilities — import from here instead of using
// Intl.NumberFormat directly in components.
//
// Rate convention ("usd_rate"):
//   1 USD = usd_rate units of currency
//   e.g. EUR usd_rate = 1.10  →  1 USD = 1.10 EUR
//
// Conversion:
//   toUSD(amount, ccy)        = amount / rates[ccy]
//   fromUSD(amount, ccy)      = amount * rates[ccy]
//   convertAmount(amt, A, B)  = toUSD(amt, A) * rates[B]

export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'MXN', 'ARS', 'COP',
] as const
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

const SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', MXN: 'MX$', ARS: 'AR$', COP: 'CO$',
}

export function getSymbol(currency: string): string {
  return SYMBOLS[currency] ?? currency
}

// ── Formatters ────────────────────────────────────────────────────────────────

export function formatCurrency(
  amount:   number,
  currency: string = 'USD',
  opts?:    { compact?: boolean; maximumFractionDigits?: number }
): string {
  const ccy = currency || 'USD'
  if (opts?.compact) {
    const abs = Math.abs(amount)
    const sym = getSymbol(ccy)
    if (abs >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sym}${(amount / 1_000).toFixed(1)}K`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: ccy,
    ...(opts?.maximumFractionDigits !== undefined
      ? { maximumFractionDigits: opts.maximumFractionDigits }
      : {}),
  }).format(amount)
}

export function formatCompact(amount: number, currency = 'USD'): string {
  return formatCurrency(amount, currency, { compact: true })
}

// ── FX conversion ─────────────────────────────────────────────────────────────
// rates: Record<currency, usd_rate>  (e.g. { EUR: 1.10, MXN: 17.5, USD: 1.0 })

export type ExchangeRates = Record<string, number>

// Throws rather than silently falling back to a 1:1 rate when a currency has
// no entry in `rates` — a missing rate (e.g. ARS/COP, which the free Frankfurter
// FX source this app uses doesn't carry) must never be mistaken for "already
// in USD". Callers that can legitimately hit a missing rate should catch this
// explicitly rather than let it produce a silently wrong converted amount.
export function toUSD(amount: number, currency: string, rates: ExchangeRates): number {
  if (currency === 'USD') return amount
  const r = rates[currency]
  if (!r) throw new Error(`No exchange rate available for "${currency}" — cannot convert to USD`)
  return amount / r
}

export function fromUSD(amount: number, currency: string, rates: ExchangeRates): number {
  if (currency === 'USD') return amount
  const r = rates[currency]
  if (!r) throw new Error(`No exchange rate available for "${currency}" — cannot convert from USD`)
  return amount * r
}

export function convertAmount(
  amount: number,
  from:   string,
  to:     string,
  rates:  ExchangeRates,
): number {
  if (from === to) return amount
  return fromUSD(toUSD(amount, from, rates), to, rates)
}

// ── FX gain/loss ─────────────────────────────────────────────────────────────
// Realized gain/loss when a foreign-currency invoice is paid at a different rate.
// Positive = FX gain, negative = FX loss (expressed in USD).
//
// Example: invoice €1000 when 1 USD = 1.10 EUR (basis = $909.09)
//          payment received when 1 USD = 1.20 EUR (settled = $833.33)
//          gain_loss = 833.33 - 909.09 = -$75.76 (loss — EUR weakened vs USD)

export function calcFxGainLoss(p: {
  invoiceAmount:    number   // invoice total in invoice currency
  invoiceCurrency:  string
  fxRateAtCreation: number   // usd_rate when invoice was created
  paymentAmount:    number   // payment amount (may be partial)
  paymentCurrency:  string
  fxRateAtPayment:  number   // usd_rate when payment was received
}): number {
  if (p.invoiceCurrency === 'USD' && p.paymentCurrency === 'USD') return 0

  const basisUsd    = p.invoiceCurrency  === 'USD' ? p.invoiceAmount : p.invoiceAmount  / p.fxRateAtCreation
  const settledUsd  = p.paymentCurrency  === 'USD' ? p.paymentAmount : p.paymentAmount  / p.fxRateAtPayment

  // Scale basis to the proportion covered by this payment
  const proportion  = p.invoiceAmount > 0 ? Math.min(p.paymentAmount / p.invoiceAmount, 1) : 0
  return settledUsd - basisUsd * proportion
}
