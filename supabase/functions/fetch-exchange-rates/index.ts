// PATH: supabase/functions/fetch-exchange-rates/index.ts
//
// Fetches latest ECB rates from frankfurter.app (free, no API key required)
// and upserts into the exchange_rates table.
//
// Rate stored: usd_rate = "1 USD = N of this currency"
// Source:      https://api.frankfurter.app/latest?base=USD
//
// Deploy:   supabase functions deploy fetch-exchange-rates --no-verify-jwt
// Invoke:   POST /functions/v1/fetch-exchange-rates with x-scheduler-secret
//           (same vault secret as invoice-scheduler; checked by
//           verify_scheduler_secret). pg_cron job refresh-exchange-rates,
//           00:05 UTC daily -- see supabase/sql/security_ledger_guards.sql.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { safeMessage } from '../_shared/errors.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')                ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')   ?? ''
const FRANKFURTER_URL      = 'https://api.frankfurter.app/latest?base=USD&symbols=EUR,GBP,CAD,MXN'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: ok } = await db.rpc('verify_scheduler_secret', {
    p: req.headers.get('x-scheduler-secret') ?? '',
  })
  if (ok !== true) return new Response('Unauthorized', { status: 401 })

  try {
    const res = await fetch(FRANKFURTER_URL)
    if (!res.ok) throw new Error(`Frankfurter API responded ${res.status}: ${await res.text()}`)

    const payload = await res.json() as {
      base:  string
      date:  string
      rates: Record<string, number>
    }

    const fetchedAt = new Date().toISOString()

    const rows = Object.entries(payload.rates).map(([currency, usdRate]) => ({
      currency,
      usd_rate:   usdRate,
      fetched_at: fetchedAt,
    }))

    // Always keep USD itself seeded (rate = 1.0, never fetched from API)
    rows.push({ currency: 'USD', usd_rate: 1.0, fetched_at: fetchedAt })

    const { error } = await db
      .from('exchange_rates')
      .upsert(rows, { onConflict: 'currency' })

    if (error) throw new Error(safeMessage(error, 'Failed to save exchange rates'))

    console.log(`[fetch-exchange-rates] Updated ${rows.length} rates for ${payload.date}`)

    return new Response(
      JSON.stringify({ ok: true, updated: rows.length, date: payload.date }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    console.error('[fetch-exchange-rates]', err)
    return new Response(
      JSON.stringify({ ok: false, error: safeMessage(err, 'Failed to fetch exchange rates') }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
