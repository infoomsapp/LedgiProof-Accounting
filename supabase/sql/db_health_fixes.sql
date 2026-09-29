-- Functions that could never work, found by scripts/db-health (2026-09-28).
-- Applied as migration `db_health_fixes`. Kept here as the reference copy.
--
-- Each fix patches the live definition in place and refuses to run if the
-- text it replaces isn't there (so it can't silently half-apply).
--
--   · Chart-of-accounts import (preview_coa_import, import_coa_batch) used a
--     column accounts.account_type that doesn't exist (it's "type") and never
--     set normal_balance, which is NOT NULL: every import failed. New accounts
--     get the normal side of their type (asset/expense debit, the rest
--     credit); an overwrite keeps the existing side unless the type changes,
--     so contra accounts (accumulated depreciation, draws) stay as they are.
--   · A document a client uploads to a transaction: the insert trigger read
--     NEW.client_id, a column transaction_documents doesn't have, so every
--     client upload failed. The client comes from the transaction.
--   · open_review_with_message existed twice (with and without p_opened_by);
--     called without p_opened_by -- how the app calls it -- Postgres couldn't
--     pick one (42725). The old 6-argument version is dropped.
--   · Team members list (get_users_in_scope): "is_active" was ambiguous with
--     the output column, and varchar columns were returned as text.
--   · payroll_create_employee takes payroll.* enum arguments; authenticated
--     had no USAGE on schema payroll, so the call failed before it started.
--     USAGE only lets it name the types: payroll's tables keep RLS with no
--     policies, and the schema isn't exposed through the API.
--   · Super-admin pages: get_user_directory_admin / get_user_org_context_admin
--     returned varchar as text; get_recent_admin_events read actor_email /
--     target_email, which impersonation_audit doesn't have (emails come from
--     profiles).

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

-- ── Chart-of-accounts import ────────────────────────────────────────────────

select pg_temp.patch_function('public.preview_coa_import(uuid, jsonb, uuid)',
  array['SELECT id, code, name, account_type', 'v_existing.account_type'],
  array['SELECT id, code, name, type',         'v_existing.type']);

select pg_temp.patch_function('public.import_coa_batch(uuid, jsonb, uuid)',
  array[
    'code, name, account_type, description,',
    'v_type, v_description,',
    'account_type = v_type,'
  ],
  array[
    'code, name, type, normal_balance, description,',
    'v_type, (case when v_type in (''asset'', ''expense'') then ''debit'' else ''credit'' end)::public.entry_type_enum, v_description,',
    'normal_balance = case when type = v_type then normal_balance else (case when v_type in (''asset'', ''expense'') then ''debit'' else ''credit'' end)::public.entry_type_enum end, type = v_type,'
  ]);

-- ── Client uploads to a transaction ─────────────────────────────────────────

select pg_temp.patch_function('public.notify_client_document_uploaded()',
  array['''client_id'', NEW.client_id'],
  array['''client_id'', (select t.client_id from public.transactions t where t.id = NEW.transaction_id)']);

-- ── Asking the client about a transaction ───────────────────────────────────

drop function if exists public.open_review_with_message(uuid, uuid, text, text, uuid, integer);

-- ── Team members list ───────────────────────────────────────────────────────

select pg_temp.patch_function('public.get_users_in_scope(uuid)',
  array[
    E'AS $function$\r\n',
    'p.lp_user_code,',
    'p.email,',
    'p.display_name,'
  ],
  array[
    E'AS $function$\r\n#variable_conflict use_column\r\n',
    'p.lp_user_code::text,',
    'p.email::text,',
    'p.display_name::text,'
  ]);

-- ── Payroll: naming its enum types ──────────────────────────────────────────

grant usage on schema payroll to authenticated;

-- ── Super-admin pages ───────────────────────────────────────────────────────

select pg_temp.patch_function('public.get_user_directory_admin()',
  array['p.lp_user_code,',       'p.display_name,'],
  array['p.lp_user_code::text,', 'p.display_name::text,']);

select pg_temp.patch_function('public.get_user_org_context_admin(uuid)',
  array['SELECT o.id, o.name, o.slug, om.role'],
  array['SELECT o.id, o.name::text, o.slug::text, om.role']);

select pg_temp.patch_function('public.get_recent_admin_events(integer)',
  array[
    'ia.actor_email        AS actor',
    'COALESCE(ia.target_email, ''user'')'
  ],
  array[
    '(select pa.email::text from public.profiles pa where pa.id = ia.actor_user_id) AS actor',
    'COALESCE((select pt.email::text from public.profiles pt where pt.id = ia.context_user_id), ''user'')'
  ]);

-- ── Asking the client: the message's sender (migration open_review_sender) ──
-- The opening message was saved as sender_role 'system' with the asker as
-- sender_id; transaction_messages_sender_ck allows 'system' only with no
-- sender, so every "ask the client" failed (23514). A person asked it: it is
-- the bookkeeper's message.
select pg_temp.patch_function('public.open_review_with_message(uuid, uuid, text, text, uuid, uuid, integer)',
  array[E'''system'',\n    p_question,'],
  array[E'''bookkeeper'',\n    p_question,']);

-- ── Automatic messages have no sender (migration system_message_sender) ────
-- open_or_get_transaction_conversation ("Resolution conversation opened…")
-- and accept_document_and_close ("Document accepted…") saved their automatic
-- message as sender_role 'system' WITH a sender id, which
-- transaction_messages_sender_ck forbids: opening a conversation on a red or
-- amber transaction always failed. Who opened / accepted it is already on the
-- conversation and the review; the message itself is the system's.
select pg_temp.patch_function('public.open_or_get_transaction_conversation(uuid, uuid)',
  array[E'    auth.uid(),\r\n    ''system'','],
  array[E'    NULL,\r\n    ''system'',']);
select pg_temp.patch_function('public.accept_document_and_close(uuid, uuid, smallint)',
  array['v_tx.org_id, v_tx.id, p_reviewer_id, ''system'','],
  array['v_tx.org_id, v_tx.id, NULL, ''system'',']);
