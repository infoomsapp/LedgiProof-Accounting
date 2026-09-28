-- Applied as migration `period_closing_all_plans` (2026-09-28).
-- Closing the books is table stakes: QuickBooks (Simple Start up), Xero (Early up),
-- FreshBooks and Wave all include it. A small business keeping its own books needs it.
update public.plan_features set is_enabled = true, limit_value = 1
 where feature_key = 'period_closing';
