-- Activity log for what isn't a transaction: documents and messages.
-- Applied as migration `activity_events`. Kept here as the reference copy.
--
-- Before: register_document, soft_delete_document and send_transaction_message
-- wrote to audit_events with columns it doesn't have (action, entity_type,
-- entity_id -- audit_events is the transaction hash chain), inside
-- "exception when others": the action went through and its audit row was
-- dropped, every time. Uploads and messages are hash-chained in their own
-- tables, but who deleted a document lived only in documents.deleted_by,
-- a column anyone allowed to update the row could rewrite.
--
-- Now: public.activity_events, one hash chain per org (entry_hash = sha256 of
-- the previous entry's hash + this entry), append-only (LG001 on any update
-- or delete). The three functions write to it and the write is REQUIRED: if
-- it fails, the upload / delete / message fails with it. lp_private.
-- verify_activity_chain(org) recomputes the chain and returns the first
-- entry that doesn't match (none = intact).

create table if not exists public.activity_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  actor_id      uuid,
  action        text not null check (action in ('document.uploaded', 'document.deleted', 'message.sent')),
  entity_type   text not null,
  entity_id     uuid not null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default clock_timestamp(),
  previous_hash char(64),
  entry_hash    char(64) not null
);

create index if not exists activity_events_org_created on public.activity_events (org_id, created_at);
create index if not exists activity_events_entity on public.activity_events (entity_type, entity_id);

alter table public.activity_events enable row level security;

drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events
  for select to authenticated using (public.is_org_member(org_id));

-- Written only by server functions (SECURITY DEFINER, owner role).
revoke all on public.activity_events from anon, authenticated;
grant select on public.activity_events to authenticated;

-- ── The chain ───────────────────────────────────────────────────────────────

create or replace function lp_private.activity_entry_hash(e public.activity_events)
returns char(64)
language sql immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(
    coalesce(e.previous_hash, '') || '|' || e.org_id || '|' || coalesce(e.actor_id::text, '') || '|' ||
    e.action || '|' || e.entity_type || '|' || e.entity_id || '|' || e.metadata::text || '|' ||
    to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'sha256'), 'hex')::char(64)
$$;

create or replace function lp_private.trg_activity_events_chain()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- One writer per org at a time, so two entries can't claim the same parent.
  perform pg_advisory_xact_lock(hashtextextended('activity_events:' || new.org_id, 0));
  new.created_at := clock_timestamp();
  select entry_hash into new.previous_hash
    from public.activity_events
   where org_id = new.org_id
   order by created_at desc, id desc
   limit 1;
  new.entry_hash := lp_private.activity_entry_hash(new);
  return new;
end;
$$;

create or replace function lp_private.trg_activity_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = 'LG001',
    message = 'The activity log can''t be changed or deleted';
end;
$$;

drop trigger if exists trg_activity_events_chain on public.activity_events;
create trigger trg_activity_events_chain
  before insert on public.activity_events
  for each row execute function lp_private.trg_activity_events_chain();

drop trigger if exists trg_activity_events_append_only on public.activity_events;
create trigger trg_activity_events_append_only
  before update or delete on public.activity_events
  for each row execute function lp_private.trg_activity_events_append_only();

-- The first entry whose stored hashes don't match a recomputation, or no row.
create or replace function lp_private.verify_activity_chain(p_org_id uuid)
returns table(id uuid, created_at timestamptz, problem text)
language sql stable
set search_path = public
as $$
  with ordered as (
    select e as rec, lag(e.entry_hash) over (order by e.created_at, e.id) as expected_previous
      from public.activity_events e
     where e.org_id = p_org_id
  )
  select (o.rec).id, (o.rec).created_at,
         case when (o.rec).previous_hash is distinct from o.expected_previous
              then 'previous_hash doesn''t match the entry before it'
              else 'entry_hash doesn''t match its contents' end
    from ordered o
   where (o.rec).previous_hash is distinct from o.expected_previous
      or (o.rec).entry_hash <> lp_private.activity_entry_hash(o.rec)
   order by (o.rec).created_at, (o.rec).id
   limit 1
$$;

revoke all on function lp_private.activity_entry_hash(public.activity_events) from public, anon, authenticated;
revoke all on function lp_private.trg_activity_events_chain()               from public, anon, authenticated;
revoke all on function lp_private.trg_activity_events_append_only()         from public, anon, authenticated;
revoke all on function lp_private.verify_activity_chain(uuid)               from public, anon, authenticated;

-- ── The three writers: to activity_events, and no longer optional ──────────

create or replace function pg_temp.patch_function(p_fn regprocedure, p_from text[], p_to text[])
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  i     int;
begin
  for i in 1 .. array_length(p_from, 1) loop
    if position(p_from[i] in v_def) = 0 then
      raise exception '%: text to replace not found: %', p_fn, p_from[i];
    end if;
    v_def := replace(v_def, p_from[i], p_to[i]);
  end loop;
  execute v_def;
end;
$$;

select pg_temp.patch_function(
  (select p.oid::regprocedure from pg_proc p where p.proname = 'register_document' and p.pronamespace = 'public'::regnamespace),
  array['INSERT INTO public.audit_events (',
        E'  EXCEPTION WHEN OTHERS THEN\n    RAISE NOTICE ''audit insert skipped: %'', SQLERRM;\n'],
  array['INSERT INTO public.activity_events (', '']);

select pg_temp.patch_function('public.soft_delete_document(uuid)',
  array['INSERT INTO public.audit_events (',
        E'  EXCEPTION WHEN OTHERS THEN\r\n    RAISE NOTICE ''audit insert skipped: %'', SQLERRM;\r\n',
        '-- Audit (soft-fail)'],
  array['INSERT INTO public.activity_events (', '', '-- Audit (required)']);

select pg_temp.patch_function(
  (select p.oid::regprocedure from pg_proc p where p.proname = 'send_transaction_message' and p.pronamespace = 'public'::regnamespace),
  array['INSERT INTO public.audit_events (',
        E'  EXCEPTION\r\n    -- audit_events schema may vary; don''t block message send if audit insert fails\r\n    WHEN OTHERS THEN\r\n      RAISE NOTICE ''audit_events insert skipped: %'', SQLERRM;\r\n',
        '-- Insert audit_events row (immutable audit trail)'],
  array['INSERT INTO public.activity_events (', '', '-- Activity log row (required)']);
