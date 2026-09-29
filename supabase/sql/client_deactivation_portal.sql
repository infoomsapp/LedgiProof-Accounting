-- Deactivating a client suspends its portal (TaxDome model, checked 2026-09-29:
-- an archived client can't sign in and sees "Your account was deactivated";
-- reactivating the account restores access; data is kept).
--
-- * client_portal_users.suspended_at marks access the FIRM's deactivation
--   turned off, so reactivation restores exactly those links and never a
--   contact the firm revoked on purpose.
-- * current_client_id() -- what 8 client-portal RLS policies use
--   (transactions, invoices, invoice items/payments, accounts, bank
--   connections, transaction documents/messages) -- only read
--   profiles.client_id. A revoked portal user could still read those rows
--   through the API. It now requires an active portal link.
-- * No invitations to, or acceptances for, a deactivated client.
-- Error codes (area Y = client portal):
--   LY001 -- the client is deactivated: reactivate it before inviting
--   LY002 -- the invitation is for a client the firm deactivated

alter table public.client_portal_users
  add column if not exists suspended_at timestamptz;

create or replace function public.current_client_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.client_id
    from public.profiles p
   where p.id = auth.uid()
     and exists (select 1 from public.client_portal_users cpu
                  where cpu.client_id = p.client_id
                    and cpu.profile_id = p.id
                    and cpu.is_active = true);
$function$;

create or replace function lp_private.trg_client_portal_follows_client()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.is_active is distinct from old.is_active then
    if new.is_active then
      update public.client_portal_users
         set is_active = true, suspended_at = null, updated_at = now()
       where client_id = new.id and suspended_at is not null;
    else
      update public.client_portal_users
         set is_active = false, suspended_at = now(), updated_at = now()
       where client_id = new.id and is_active = true;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_client_portal_follows_client on public.clients;
create trigger trg_client_portal_follows_client
  after update of is_active on public.clients
  for each row execute function lp_private.trg_client_portal_follows_client();

-- What a signed-in portal user whose access was suspended should be told.
create or replace function public.get_my_suspended_portal_access()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'org_name',     o.name,
           'client_name',  coalesce(c.company_name, c.display_name),
           'suspended_at', cpu.suspended_at) order by cpu.suspended_at desc), '[]'::jsonb)
    from public.client_portal_users cpu
    join public.clients c       on c.id = cpu.client_id
    join public.organizations o on o.id = cpu.org_id
   where cpu.profile_id = auth.uid()
     and cpu.suspended_at is not null;
$function$;
revoke execute on function public.get_my_suspended_portal_access() from anon;

create or replace function public.create_client_portal_invitation(
  p_client_id uuid, p_email text,
  p_role client_portal_role default 'client_contact'::client_portal_role)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id     uuid;
  v_active     boolean;
  v_email      text := lower(trim(p_email));
  v_inv_id     uuid;
  v_token      varchar;
  v_expires_at timestamptz;
  v_superseded int := 0;
begin
  if v_email is null or v_email = '' then
    raise exception 'an email address is required to invite a portal user';
  end if;

  select org_id, is_active into v_org_id, v_active
    from public.clients
   where id = p_client_id;

  if not found then
    raise exception 'client % not found', p_client_id;
  end if;

  if not public.has_org_role(v_org_id,
        array['owner','admin','accountant']::public.lp_role[]) then
    raise exception 'not authorized to invite portal users for this client';
  end if;

  if not v_active then
    raise exception using errcode = 'LY001',
      message = 'This client is deactivated: reactivate it before inviting anyone to its portal';
  end if;

  -- Supersede, do not stack. Revoked rather than deleted so the history of
  -- who was invited when survives.
  update public.client_portal_invitations
     set status = 'revoked'
   where client_id = p_client_id
     and lower(trim(email)) = v_email
     and status = 'pending';
  get diagnostics v_superseded = row_count;

  insert into public.client_portal_invitations (
    org_id, client_id, email, role, invited_by
  ) values (
    v_org_id, p_client_id, v_email, p_role, auth.uid()
  )
  returning id, token, expires_at into v_inv_id, v_token, v_expires_at;

  return jsonb_build_object(
    'invitation_id', v_inv_id,
    'token',         v_token,
    'expires_at',    v_expires_at,
    'superseded',    v_superseded
  );
end;
$function$;

-- accept_client_portal_invitation: refuse invitations of a deactivated client
do $patch$
declare
  v_def  text := pg_get_functiondef('public.accept_client_portal_invitation(text)'::regprocedure);
  v_from text := '  v_my_email := lower(coalesce(auth.jwt() ->> ''email'', ''''));';
  v_to   text := '  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_inv.client_id AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE = ''LY002'',
      MESSAGE = ''This client account was deactivated by the firm: ask them to reactivate it'';
  END IF;

' || v_from;
begin
  if position(v_from in v_def) = 0 then
    raise exception 'accept_client_portal_invitation: anchor not found';
  end if;
  execute replace(v_def, v_from, v_to);
end
$patch$;
