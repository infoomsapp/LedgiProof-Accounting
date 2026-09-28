-- Customers you invoice are an address book, not a plan seat.
-- Applied as migration `customers_unlimited`. Reference copy.
--
-- public.clients holds two different things: the customer a business
-- invoices (invoices/estimates.client_id), and -- in a firm -- a client whose
-- books the firm keeps (accounts/transactions/bank_connections.client_id).
-- plan_features.clients was meant for the second, but trg_seat_clients
-- applied it to the first too: a Starter user could invoice one person.
-- QuickBooks, Xero, Wave and Zoho Books all leave customers unlimited and
-- charge on volume instead (FreshBooks Lite's 5-client cap is the outlier).
--
-- Now:
--   · In a workspace that is not a firm (organizations.is_firm = false) a
--     client is a customer: never counted.
--   · plan_features.clients = -1 on the self-employed plans (Starter,
--     Entrepreneur): "unlimited customers", which is what the pricing page and
--     get_workspace_plan now show. Firm plans keep their managed-client caps
--     (Bookkeeper 25, Accountant unlimited).
--   · Starter: 20 invoices a month (was 5), in line with Xero Early.

update public.plan_features set limit_value = -1, is_enabled = true
 where plan in ('starter', 'entrepreneur') and feature_key = 'clients';

update public.plan_features set limit_value = 20
 where plan = 'starter' and feature_key = 'invoices';

create or replace function lp_private.trg_seat_clients()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_used  integer;
begin
  if not coalesce(new.is_active, true)
     or (tg_op = 'UPDATE' and coalesce(old.is_active, true)) then
    return new;
  end if;
  -- Outside a firm a client is a customer in the address book: no seat.
  if not coalesce((select o.is_firm from public.organizations o where o.id = new.org_id), false) then
    return new;
  end if;
  if lp_private.org_effective_plan(new.org_id) in ('exempt', 'none') then
    return new;
  end if;
  perform lp_private.assert_plan_active(new.org_id);
  v_limit := lp_private.org_feature_limit(new.org_id, 'clients');
  if v_limit = -1 then
    return new;
  end if;
  select count(*) into v_used from public.clients
   where org_id = new.org_id and coalesce(is_active, true) and id <> new.id;
  if v_used >= v_limit then
    raise exception using errcode = 'LQ004',
      message = format('Your %s plan includes up to %s client(s).', lp_private.org_effective_plan(new.org_id), v_limit),
      detail  = jsonb_build_object('limit', v_limit, 'plan', lp_private.org_effective_plan(new.org_id))::text;
  end if;
  return new;
end;
$$;

-- The apps read the same rule: outside a firm, clients are unlimited.
do $$
declare
  v_def text := pg_get_functiondef('public.get_workspace_plan(uuid)'::regprocedure);
  v_old text := $o$          from (select distinct feature_key from public.plan_features) k), '{}'::jsonb),$o$;
  -- the override goes on the right of || so it wins over plan_features
  v_new text := $n$          from (select distinct feature_key from public.plan_features) k), '{}'::jsonb)
             || case when coalesce((select o.is_firm from public.organizations o where o.id = p_org_id), false)
                     then '{}'::jsonb else '{"clients": -1}'::jsonb end,$n$;
begin
  if position('"clients": -1' in v_def) > 0 then
    return;   -- already applied
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'customers_unlimited: features not found in get_workspace_plan';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$$;

revoke all on function lp_private.trg_seat_clients() from public, anon, authenticated;
grant execute on all functions in schema lp_private to service_role;
