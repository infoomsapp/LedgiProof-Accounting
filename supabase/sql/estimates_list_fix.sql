-- list_estimates: the Estimates page failed to load for every account.
-- Applied as migration `estimates_list_fix`. Kept here as the reference copy.
--
-- Before: it selected c.name, a column public.clients doesn't have (it has
-- company_name and display_name), so every call failed with 42703 and
-- PostgREST answered 400.
-- Now: client_name is the company name, or the person's name -- the same
-- label the rest of the app shows for a client.

create or replace function public.list_estimates(
  p_org_id    uuid,
  p_status    public.estimate_status default null,
  p_client_id uuid    default null,
  p_limit     integer default 50,
  p_offset    integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows    jsonb;
  v_total   integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if not public.is_org_member(p_org_id) then
    raise exception 'Unauthorized — not a member of this org';
  end if;

  select count(*) into v_total
    from public.estimates e
   where e.org_id = p_org_id
     and (p_status    is null or e.status    = p_status)
     and (p_client_id is null or e.client_id = p_client_id);

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    into v_rows
  from (
    select e.id, e.estimate_number, e.status, e.issue_date, e.valid_until,
           e.total, e.currency, e.title, e.scope_description,
           e.client_id, coalesce(c.company_name, c.display_name) as client_name,
           e.template_category,
           e.sent_at, e.viewed_at, e.accepted_at, e.rejected_at,
           e.converted_at, e.converted_to_invoice_id,
           e.created_at, e.updated_at
      from public.estimates e
      left join public.clients c on c.id = e.client_id
     where e.org_id = p_org_id
       and (p_status    is null or e.status    = p_status)
       and (p_client_id is null or e.client_id = p_client_id)
     order by e.created_at desc
     limit p_limit
    offset p_offset
  ) t;

  return jsonb_build_object(
    'total',  v_total,
    'limit',  p_limit,
    'offset', p_offset,
    'rows',   v_rows
  );
end;
$$;

-- ── pgcrypto outside the search path (migration pgcrypto_search_path) ────────
-- create_estimate, send_estimate and convert_estimate_to_invoice call
-- gen_random_bytes() and the workspace_member_messages hash chain calls
-- digest(); pgcrypto lives in schema "extensions" but these functions only
-- searched "public", so creating, sending or converting an estimate -- and
-- sending a team message -- failed with 42883 (function does not exist).
alter function public.create_estimate(uuid, uuid, character varying, uuid, public.estimate_template_category, text, date, character, text, text, text)
  set search_path = public, extensions;
alter function public.send_estimate(uuid, text, text)
  set search_path = public, extensions;
alter function public.convert_estimate_to_invoice(uuid)
  set search_path = public, extensions;
alter function public.lp_member_messages_hash_chain()
  set search_path = public, extensions, pg_temp;

-- ── create_estimate without a template (migration create_estimate_no_template)
-- v_template was a RECORD, assigned only when a template is chosen, yet the
-- INSERT reads v_template.name / default_notes / ... either way: "record
-- v_template is not assigned yet" (55000) for every estimate started blank.
-- As a %ROWTYPE it starts as all-NULL fields, so the COALESCEs fall through.
do $$
declare
  v_fn  regprocedure := 'public.create_estimate(uuid, uuid, character varying, uuid, public.estimate_template_category, text, date, character, text, text, text)';
  v_def text := pg_get_functiondef(v_fn);
begin
  if position('v_template       RECORD;' in v_def) = 0 then
    raise exception 'create_estimate: v_template declaration not found';
  end if;
  execute replace(v_def, 'v_template       RECORD;', 'v_template       public.estimate_templates%ROWTYPE;');
end;
$$;
