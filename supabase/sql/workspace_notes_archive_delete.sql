-- Notes can be archived, restored and deleted (web Notes page + chat Notes tab).
-- Market practice checked 2026-09-29: TaxDome (archive first, delete from the
-- Archived tab), Xero Practice Manager (archive/restore only). LedgiProof
-- follows TaxDome: Archive -> Archived tab -> Restore or Delete permanently.
-- A deletion leaves a trace in the append-only activity_events chain
-- (who, when, whose note, sha256 of the text) so the record of a control
-- (a note that needed a second person's approval) never vanishes silently.
-- Error codes:
--   LK003 -- the note is archived: restore it before approving / completing
--   LK004 -- only an archived note can be deleted
--   LK005 -- only the author or an owner/admin/accountant can delete a note

alter table public.workspace_notes
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);

-- the note's own notifications go with it
alter table public.notifications drop constraint if exists notifications_note_id_fkey;
alter table public.notifications
  add constraint notifications_note_id_fkey foreign key (note_id)
  references public.workspace_notes(id) on delete cascade;

create or replace function public.archive_workspace_note(p_note_id uuid, p_archive boolean default true)
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
  if not exists (select 1 from public.organization_memberships
                  where org_id = v_note.org_id and user_id = v_user_id and is_active = true) then
    raise exception 'unauthorized: not a member of this organization';
  end if;

  update public.workspace_notes
     set archived_at = case when p_archive then now() end,
         archived_by = case when p_archive then v_user_id end
   where id = p_note_id;

  return jsonb_build_object('note_id', p_note_id, 'archived', p_archive);
end;
$function$;

create or replace function public.delete_workspace_note(p_note_id uuid)
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
  if not (v_note.created_by = v_user_id or exists (
            select 1 from public.organization_memberships
             where org_id = v_note.org_id and user_id = v_user_id and is_active = true
               and role in ('owner', 'admin', 'accountant'))) then
    raise exception using errcode = 'LK005',
      message = 'Only the author or an owner, admin or accountant can delete this note';
  end if;
  if v_note.archived_at is null then
    raise exception using errcode = 'LK004', message = 'Archive the note before deleting it';
  end if;

  insert into public.activity_events (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_note.org_id, v_user_id, 'note.deleted', 'workspace_note', p_note_id,
          jsonb_build_object(
            'client_id',         v_note.client_id,
            'created_by',        v_note.created_by,
            'created_at',        v_note.created_at,
            'requires_approval', v_note.requires_approval,
            'approved_by',       v_note.approved_by,
            'body_sha256',       encode(extensions.digest(v_note.body, 'sha256'), 'hex')));

  delete from public.workspace_notes where id = p_note_id;

  return jsonb_build_object('note_id', p_note_id, 'deleted', true);
end;
$function$;

create or replace function public.approve_workspace_note(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_note    public.workspace_notes;
  v_role    public.lp_role;
begin
  if v_user_id is null then
    raise exception 'unauthorized: no session';
  end if;

  select * into v_note from public.workspace_notes where id = p_note_id;
  if not found then
    raise exception 'note not found';
  end if;
  if v_note.archived_at is not null then
    raise exception using errcode = 'LK003', message = 'This note is archived: restore it first';
  end if;
  if v_note.approved_at is not null then
    raise exception 'note already approved';
  end if;
  if v_note.created_by = v_user_id then
    raise exception 'creator cannot approve their own note (segregation of duties)';
  end if;

  select role into v_role from public.organization_memberships
   where org_id = v_note.org_id and user_id = v_user_id and is_active = true;

  if v_role is null or v_role not in ('owner', 'admin', 'accountant') then
    raise exception 'unauthorized: cannot approve notes in this organization';
  end if;

  update public.workspace_notes
     set approved_by = v_user_id, approved_at = now()
   where id = p_note_id;

  insert into public.notifications (org_id, user_id, type, title, body, note_id)
  values (v_note.org_id, v_note.created_by, 'note_approved',
          'Your note was approved', left(v_note.body, 140), p_note_id);

  return jsonb_build_object('note_id', p_note_id, 'approved', true);
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
  if v_note.archived_at is not null then
    raise exception using errcode = 'LK003', message = 'This note is archived: restore it first';
  end if;
  if v_note.requires_approval and v_note.approved_by is null then
    raise exception using errcode = 'LK002',
      message = 'This note needs a second person''s approval before it can be marked done';
  end if;

  update public.workspace_notes set completed_at = now() where id = p_note_id;

  return jsonb_build_object('note_id', p_note_id, 'completed', true);
end;
$function$;

-- reminders skip archived notes
select cron.alter_job(
  (select jobid from cron.job where jobname = 'workspace-note-reminders'),
  command := $cron$
  WITH due AS (
    SELECT wn.id, wn.org_id, wn.created_by, wn.body,
           COALESCE(c.company_name, c.display_name) AS client_name
      FROM public.workspace_notes wn
      LEFT JOIN public.clients c ON c.id = wn.client_id
     WHERE wn.due_at IS NOT NULL
       AND wn.due_at <= now()
       AND wn.reminder_sent_at IS NULL
       AND wn.completed_at IS NULL
       AND wn.approved_at IS NULL
       AND wn.archived_at IS NULL
  )
  INSERT INTO public.notifications (org_id, user_id, type, title, body, note_id)
  SELECT org_id, created_by, 'note_reminder',
         'Reminder · ' || COALESCE(client_name, 'a client'),
         left(body, 140),
         id
    FROM due;

  UPDATE public.workspace_notes
     SET reminder_sent_at = now()
   WHERE due_at IS NOT NULL
     AND due_at <= now()
     AND reminder_sent_at IS NULL
     AND completed_at IS NULL
     AND approved_at IS NULL
     AND archived_at IS NULL;
  $cron$);

revoke execute on function public.archive_workspace_note(uuid, boolean) from anon;
revoke execute on function public.delete_workspace_note(uuid) from anon;

-- activity_events only accepts known actions
alter table public.activity_events drop constraint activity_events_action_check;
alter table public.activity_events add constraint activity_events_action_check
  check (action = any (array['document.uploaded', 'document.deleted', 'message.sent', 'note.deleted']));
