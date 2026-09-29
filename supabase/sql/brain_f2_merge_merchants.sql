-- Brain v3 · F2 — "this is the same merchant as…".
-- Applied as migration `brain_f2_merge_merchants`. Kept here as the reference copy.
--
-- merchant_identity (F1) only joins two spellings on its own when ONE
-- confirmed merchant is clearly the closest. When it can't tell, the person
-- can: public.merge_merchants(org, client, from, to) writes a workspace
-- alias (lp_private.merchant_aliases, kind 'merge') and moves what was
-- learned under `from` onto `to` (confirmations to the same account add up;
-- `to`'s own account wins otherwise). From then on every line spelled like
-- `from` is `to` for suggestions, learning and For review.
--   LN001 -- two different, non-empty merchants.
--   LN002 -- owners, admins and accountants only (they teach the Brain).

create or replace function public.merge_merchants(
  p_org_id uuid, p_client_id uuid, p_from_key text, p_to_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text := btrim(lower(coalesce(p_from_key, '')));
  v_to   text := btrim(lower(coalesce(p_to_key, '')));
  v_cat  text := case when p_client_id is null then 'learned' else 'learned:' || p_client_id end;
  f      public.user_patterns%rowtype;
  t      public.user_patterns%rowtype;
begin
  if not public.has_org_role(p_org_id, array['owner','admin','accountant']::public.lp_role[]) then
    raise exception using errcode = 'LN002',
      message = 'Only owners, admins and accountants can merge merchants';
  end if;
  if v_from = '' or v_to = '' or v_from = v_to then
    raise exception using errcode = 'LN001',
      message = 'Choose two different merchants to merge';
  end if;

  delete from lp_private.merchant_aliases
   where kind = 'merge' and org_id = p_org_id
     and client_id is not distinct from p_client_id and pattern = v_from;
  insert into lp_private.merchant_aliases (kind, org_id, client_id, pattern, canonical, created_by)
  values ('merge', p_org_id, p_client_id, v_from, v_to, auth.uid());
  -- Anything that was merged INTO `from` now goes straight to `to`.
  update lp_private.merchant_aliases
     set canonical = v_to
   where kind = 'merge' and org_id = p_org_id
     and client_id is not distinct from p_client_id and canonical = v_from;

  select * into f from public.user_patterns
   where org_id = p_org_id and category = v_cat and keyword = v_from;
  if found then
    select * into t from public.user_patterns
     where org_id = p_org_id and category = v_cat and keyword = v_to;
    if found then
      if t.account_id = f.account_id then
        update public.user_patterns set match_count = t.match_count + f.match_count where id = t.id;
      end if;
      delete from public.user_patterns where id = f.id;
    else
      update public.user_patterns set keyword = v_to, merchant_name = v_to where id = f.id;
    end if;
  end if;

  return jsonb_build_object('from', v_from, 'to', v_to);
end;
$$;

revoke all on function public.merge_merchants(uuid, uuid, text, text) from public, anon;
grant execute on function public.merge_merchants(uuid, uuid, text, text) to authenticated;
