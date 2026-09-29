-- Firm "Reports" comparison (get_firm_client_summary).
-- Before: revenue/expenses summed every entry since inception (not the chosen
-- year), used the original-currency amount instead of amount_usd, and kept
-- its own copy of the ledger filters. Now it reads the one ledger source
-- (lp_private.ledger_lines): P&L is year-to-date through the chosen month,
-- and "balanced" means debits = credits over everything up to that date.

create or replace function lp_private.get_firm_client_summary_impl(
  p_org_id uuid, p_as_of_year integer, p_as_of_month integer default 12)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_from   date := make_date(p_as_of_year, 1, 1);
  v_to     date := (make_date(p_as_of_year, p_as_of_month, 1) + interval '1 month - 1 day')::date;
  v_result jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'client_id',      c.id,
      'client_name',    coalesce(c.company_name, c.display_name),
      'total_revenue',  pl.revenue,
      'total_expenses', pl.expenses,
      'net_income',     pl.revenue - pl.expenses,
      'is_balanced',    abs(tb.debits - tb.credits) < 0.01
    ) order by coalesce(c.company_name, c.display_name)
  ), '[]'::jsonb)
  into v_result
  from public.clients c
  cross join lateral (
    select
      coalesce(sum(case when l.entry_type = 'credit' then l.amount else -l.amount end)
               filter (where a.type = 'income'), 0)  as revenue,
      coalesce(sum(case when l.entry_type = 'debit'  then l.amount else -l.amount end)
               filter (where a.type = 'expense'), 0) as expenses
    from lp_private.ledger_lines(p_org_id, c.id, v_from, v_to) l
    join public.accounts a on a.id = l.account_id
  ) pl
  cross join lateral (
    select coalesce(sum(l.amount) filter (where l.entry_type = 'debit'), 0)  as debits,
           coalesce(sum(l.amount) filter (where l.entry_type = 'credit'), 0) as credits
    from lp_private.ledger_lines(p_org_id, c.id, null, v_to) l
  ) tb
  where c.org_id = p_org_id and c.is_active = true;

  return v_result;
end;
$function$;
