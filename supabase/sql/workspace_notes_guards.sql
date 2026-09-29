-- Workspace notes (Notes page + the Notes tab of a client's chat) are the
-- firm's internal accounting notes. Found in the 2026-09-29 walkthrough:
--   * RLS also let a client's portal users SELECT them straight from the API
--     (the UI hides the tab from clients, the table did not);
--   * create_workspace_note accepted a client of another workspace;
--   * complete_workspace_note closed a note that still needed a second
--     person's approval, skipping the segregation-of-duties step.
-- Error codes (area K = notes):
--   LK001 -- the client is not one of this workspace's clients
--   LK002 -- the note needs a second person's approval before it can be done

drop policy if exists workspace_notes_select_member on public.workspace_notes;
create policy workspace_notes_select_member on public.workspace_notes
  for select using (
    exists (select 1 from public.organization_memberships m
             where m.org_id = workspace_notes.org_id
               and m.user_id = auth.uid()
               and m.is_active = true)
  );

create or replace function public.create_workspace_note(
  p_org_id uuid, p_client_id uuid, p_body text,
  p_requires_approval boolean default false,
  p_due_at timestamp with time zone default null,
  p_context_ref jsonb default null,
  p_conversation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id     uuid := auth.uid();
  v_note_id     uuid;
  v_client_name text;
begin
  if v_user_id is null then
    raise exception 'unauthorized: no session';
  end if;

  if not exists (
    select 1 from public.organization_memberships
     where org_id = p_org_id and user_id = v_user_id and is_active = true
  ) then
    raise exception 'unauthorized: not a member of this organization';
  end if;

  select coalesce(c.company_name, c.display_name) into v_client_name
    from public.clients c where c.id = p_client_id and c.org_id = p_org_id;
  if not found then
    raise exception using errcode = 'LK001',
      message = 'This client is not one of this workspace''s clients';
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'note body is required';
  end if;

  insert into public.workspace_notes (
    org_id, client_id, conversation_id, context_ref, body,
    created_by, requires_approval, due_at
  ) values (
    p_org_id, p_client_id, p_conversation_id, p_context_ref, trim(p_body),
    v_user_id, coalesce(p_requires_approval, false), p_due_at
  )
  returning id into v_note_id;

  if coalesce(p_requires_approval, false) then
    insert into public.notifications (org_id, user_id, type, title, body, note_id)
    select p_org_id, om.user_id, 'note_pending_approval',
           'Note needs approval · ' || coalesce(v_client_name, 'a client'),
           left(trim(p_body), 140),
           v_note_id
      from public.organization_memberships om
     where om.org_id = p_org_id and om.is_active = true
       and om.role in ('owner', 'admin', 'accountant')
       and om.user_id <> v_user_id;
  end if;

  return jsonb_build_object('note_id', v_note_id);
end;
$function$;

create or replace function public.complete_workspace_note(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_note    public.workspace_notes;
begin
  if v_user_id is null then
    raise exception 'unauthorized: no session';
  end if;

  select * into v_note from public.workspace_notes where id = p_note_id;
  if not found then
    raise exception 'note not found';
  end if;
  if not exists (
    select 1 from public.organization_memberships
     where org_id = v_note.org_id and user_id = v_user_id and is_active = true
  ) then
    raise exception 'unauthorized: not a member of this organization';
  end if;
  if v_note.requires_approval and v_note.approved_by is null then
    raise exception using errcode = 'LK002',
      message = 'This note needs a second person''s approval before it can be marked done';
  end if;

  update public.workspace_notes set completed_at = now() where id = p_note_id;

  return jsonb_build_object('note_id', p_note_id, 'completed', true);
end;
$function$;
