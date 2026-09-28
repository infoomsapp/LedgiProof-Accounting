-- Phase 3b: replacing an invoice's lines is one atomic step.
-- Applied 2026-09-27 as migration `phase3b_invoice_items_atomic`. Kept here
-- as the reference copy. Depends on phase3_invoices_ledger.
--
-- Before: the web and the phone "replaced" lines with DELETE then INSERT from
-- the client. authenticated has no DELETE grant on invoice_items /
-- recurring_invoice_items, and the web never checked the delete's error --
-- so every edit silently DUPLICATED the lines (the phone got an error
-- instead). Nor was it one transaction: a failed insert left no lines.
--
-- Now save_invoice_items() / save_recurring_invoice_items() replace the
-- lines and recompute totals in one transaction, as the caller (owner /
-- admin / accountant of the org). The phase-3 guard still refuses a paid,
-- partial or void invoice; an issued invoice's ledger entry is re-synced by
-- the invoices trigger when its totals change.
--
-- Also: a payment created from its bank deposit is method 'bank_transfer'
-- (the invoice_payments CHECK has no 'bank_deposit').

-- p_items: [{ item_type, description, quantity, unit_price, discount_pct, tax_rate }]
create or replace function public.save_invoice_items(p_invoice_id uuid, p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.invoices where id = p_invoice_id;
  if v_org is null then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  perform lp_private.assert_org_access(v_org, array['owner','admin','accountant']::public.lp_role[]);
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 then
    raise exception 'At most 200 lines per invoice' using errcode = '22023';
  end if;

  delete from public.invoice_items where invoice_id = p_invoice_id;

  insert into public.invoice_items (
    invoice_id, org_id, sort_order, item_type, description,
    quantity, unit_price, discount_pct, tax_rate
  )
  select p_invoice_id, v_org, (x.ord - 1)::smallint,
         coalesce(nullif(x.it ->> 'item_type', ''), 'service')::public.invoice_item_type,
         coalesce(x.it ->> 'description', ''),
         coalesce((x.it ->> 'quantity')::numeric, 1),
         coalesce((x.it ->> 'unit_price')::numeric, 0),
         coalesce((x.it ->> 'discount_pct')::numeric, 0),
         coalesce((x.it ->> 'tax_rate')::numeric, 0)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as x(it, ord);

  perform lp_private.compute_invoice_totals_impl(p_invoice_id);

  return coalesce((select jsonb_agg(to_jsonb(ii) order by ii.sort_order)
                     from public.invoice_items ii where ii.invoice_id = p_invoice_id), '[]'::jsonb);
end;
$$;

create or replace function public.save_recurring_invoice_items(p_recurring_id uuid, p_items jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.recurring_invoices where id = p_recurring_id;
  if v_org is null then
    raise exception 'Recurring invoice not found' using errcode = 'P0002';
  end if;
  perform lp_private.assert_org_access(v_org, array['owner','admin','accountant']::public.lp_role[]);
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 then
    raise exception 'At most 200 lines per invoice' using errcode = '22023';
  end if;

  delete from public.recurring_invoice_items where recurring_id = p_recurring_id;

  insert into public.recurring_invoice_items (
    recurring_id, org_id, sort_order, item_type, description,
    quantity, unit_price, discount_pct, tax_rate
  )
  select p_recurring_id, v_org, (x.ord - 1)::integer,
         coalesce(nullif(x.it ->> 'item_type', ''), 'service')::public.invoice_item_type,
         coalesce(x.it ->> 'description', ''),
         coalesce((x.it ->> 'quantity')::numeric, 1),
         coalesce((x.it ->> 'unit_price')::numeric, 0),
         coalesce((x.it ->> 'discount_pct')::numeric, 0),
         coalesce((x.it ->> 'tax_rate')::numeric, 0)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as x(it, ord);
end;
$$;

revoke all on function public.save_invoice_items(uuid, jsonb)            from public, anon;
revoke all on function public.save_recurring_invoice_items(uuid, jsonb)  from public, anon;
grant execute on function public.save_invoice_items(uuid, jsonb)           to authenticated, service_role;
grant execute on function public.save_recurring_invoice_items(uuid, jsonb) to authenticated, service_role;

-- 'bank_deposit' -> 'bank_transfer' inside post_reviewed_transactions.
do $$
declare
  d text := pg_get_functiondef('public.post_reviewed_transactions(uuid, jsonb)'::regprocedure);
begin
  if position('''bank_deposit''' in d) > 0 then
    execute replace(d, '''bank_deposit''', '''bank_transfer''');
  end if;
end $$;
