-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-Currency Infrastructure
-- Apply in: Supabase Dashboard → SQL Editor → Run
--
-- Rate convention: usd_rate = "1 USD = usd_rate units of currency"
-- Example: EUR usd_rate = 1.10  →  1 USD = 1.10 EUR
--
-- Conversion:
--   foreign → USD:  amount / usd_rate
--   USD → foreign:  amount * usd_rate
--   A → B:          (amount / rate_A) * rate_B
--
-- Rates are fetched daily by the fetch-exchange-rates Edge Function
-- from frankfurter.app (ECB-sourced, free, no API key required).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. exchange_rates ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  currency    text        NOT NULL PRIMARY KEY,   -- ISO 4217 (e.g. 'EUR')
  usd_rate    numeric     NOT NULL,               -- 1 USD = usd_rate of this currency
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed USD itself so callers never need to special-case it
INSERT INTO public.exchange_rates (currency, usd_rate, fetched_at)
VALUES ('USD', 1.0, now())
ON CONFLICT (currency) DO NOTHING;

-- RLS: all authenticated users can read; only service role can write
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users can read exchange rates" ON public.exchange_rates;
CREATE POLICY "authenticated users can read exchange rates"
  ON public.exchange_rates FOR SELECT
  TO authenticated
  USING (true);

-- Explicit grants so the Edge Function (service_role) can write
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.exchange_rates TO service_role;

-- ── 2. get_exchange_rate RPC ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_exchange_rate(p_currency text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT usd_rate FROM public.exchange_rates WHERE currency = upper(p_currency);
$$;

-- ── 3. FX rate snapshot columns ───────────────────────────────────────────────
--
-- invoices.fx_rate_at_creation:
--   The usd_rate at the moment the invoice was issued.
--   Used to compute the USD basis for realized FX gain/loss when payment arrives.
--   NULL for USD invoices (no conversion needed).
--
-- invoice_payments.fx_rate_at_payment:
--   The usd_rate at the moment payment was received.
--   NULL for USD payments.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fx_rate_at_creation numeric NULL;

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS fx_rate_at_payment  numeric NULL;

-- ── 4. get_fx_gains_losses RPC ────────────────────────────────────────────────
--
-- Returns realized FX gains/losses for an org: invoices issued in a foreign
-- currency where the payment was settled at a different exchange rate.
-- Threshold: |gain_loss_usd| > 0.01 to filter rounding noise.

CREATE OR REPLACE FUNCTION public.get_fx_gains_losses(p_org_id uuid)
RETURNS TABLE (
  invoice_id           uuid,
  invoice_number       text,
  client_name          text,
  currency             text,
  invoice_amount       numeric,
  fx_rate_at_creation  numeric,
  payment_amount       numeric,
  fx_rate_at_payment   numeric,
  invoice_basis_usd    numeric,
  payment_usd          numeric,
  gain_loss_usd        numeric,
  payment_date         date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.invoice_number,
    c.display_name                                                      AS client_name,
    i.currency,
    i.total                                                             AS invoice_amount,
    i.fx_rate_at_creation,
    ip.amount                                                           AS payment_amount,
    ip.fx_rate_at_payment,
    ROUND(i.total   / NULLIF(i.fx_rate_at_creation, 0), 2)             AS invoice_basis_usd,
    ROUND(ip.amount / NULLIF(ip.fx_rate_at_payment,  0), 2)            AS payment_usd,
    ROUND(
      ip.amount / NULLIF(ip.fx_rate_at_payment,  0) -
      i.total   / NULLIF(i.fx_rate_at_creation, 0),
    2)                                                                  AS gain_loss_usd,
    ip.payment_date
  FROM  public.invoices          i
  JOIN  public.clients           c  ON c.id  = i.client_id
  JOIN  public.invoice_payments  ip ON ip.invoice_id = i.id
  WHERE i.org_id              = p_org_id
    AND i.currency           <> 'USD'
    AND i.fx_rate_at_creation IS NOT NULL
    AND ip.fx_rate_at_payment  IS NOT NULL
    AND ABS(
      ip.amount / NULLIF(ip.fx_rate_at_payment,  0) -
      i.total   / NULLIF(i.fx_rate_at_creation, 0)
    ) > 0.01
  ORDER BY ip.payment_date DESC;
$$;

-- ── 5. Post-apply checklist ───────────────────────────────────────────────────
--
-- 1. Verify table:   SELECT * FROM exchange_rates;
-- 2. Deploy edge fn: supabase functions deploy fetch-exchange-rates
-- 3. Seed rates:     POST https://<project>.supabase.co/functions/v1/fetch-exchange-rates
--                    (or invoke from Dashboard → Edge Functions)
-- 4. Verify rates:   SELECT * FROM exchange_rates ORDER BY currency;
-- 5. Regenerate types:
--      supabase gen types typescript --project-id <id> > src/types/database.types.ts
--    Then remove `as any` casts in exchange-rate.service.ts.
-- 6. Optional cron (runs daily at 00:05 UTC — requires pg_cron extension):
--      SELECT cron.schedule(
--        'refresh-exchange-rates',
--        '5 0 * * *',
--        $$SELECT net.http_post(url := '<project-url>/functions/v1/fetch-exchange-rates',
--                               headers := '{"x-cron-source":"supabase"}'::jsonb,
--                               body := '{}'::jsonb) AS request_id;$$
--      );
