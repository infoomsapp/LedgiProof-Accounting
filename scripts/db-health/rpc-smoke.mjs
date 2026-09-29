// PATH: scripts/db-health/rpc-smoke.mjs
//
// Prints a SQL smoke test that calls every RPC the web app, the edge
// functions and the mobile app use, as a real signed-in owner, and reports
// every call that fails. Paste the output into the Supabase SQL editor.
//
//   node scripts/db-health/rpc-smoke.mjs [path-to-ledgiproof-mobile] > smoke.sql
//
// Everything runs in ONE transaction that always ends in an exception, so
// nothing is written -- not even by the RPCs that write (pg_notify and pg_net
// requests are transactional too). Arguments are synthesized from each
// parameter's name and type (org/client/user ids are real, other ids random),
// so "not found" / "unauthorized" / validation errors are expected: read the
// list for the other kind -- 42703 undefined column, 42883 undefined function,
// 42804 / 42P13 result shape, 42702 ambiguous, 55000 unassigned record,
// 42725 ambiguous overload, 42501 permission denied on something the app
// calls as a user. See README.md.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const mobile = process.argv[2] ?? join(root, '..', 'ledgiproof-mobile')

const dirs = [join(root, 'src'), join(root, 'supabase', 'functions'), join(mobile, 'lib')]
const exts = /\.(ts|tsx|dart)$/

function* walk(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (exts.test(name)) yield p
  }
}

const names = new Set()
for (const dir of dirs) {
  for (const file of walk(dir)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/g)) names.add(m[1])
  }
}
// Service-only secret check: calling it proves nothing.
names.delete('verify_scheduler_secret')

const list = [...names].sort().map(n => `'${n}'`).join(',')

process.stdout.write(`-- ${names.size} RPCs, generated ${new Date().toISOString()}
do $smoke$
declare
  v_user uuid; v_org uuid; v_client uuid;
  f record; i int; v_args text[]; v_name text; v_type regtype; v_val text; v_call text;
  v_out text := ''; v_ok int := 0; v_state text; v_msg text;
begin
  -- An owner of an org that has a client, so client-scoped RPCs get a real id.
  select c.id, c.org_id into v_client, v_org from public.clients c limit 1;
  select user_id into v_user from public.organization_memberships
   where org_id = v_org and is_active and role = 'owner' limit 1;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated', 'email', 'owner@test.dev')::text, true);

  -- RPCs the app calls that don't exist at all.
  select coalesce(string_agg(E'\\n' || n || ' [missing] function does not exist', ''), '') into v_out
    from unnest(array[${list}]) n
   where not exists (select 1 from pg_proc p where p.proname = n and p.pronamespace = 'public'::regnamespace);

  for f in
    select p.proname, p.pronargs, p.pronargdefaults, p.proargnames, p.proargtypes::regtype[] as types
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.proname = any(array[${list}])
     order by p.proname
  loop
    v_args := '{}';
    for i in 1 .. (f.pronargs - f.pronargdefaults) loop
      v_name := coalesce(f.proargnames[i], '');
      v_type := f.types[i-1];
      v_val := case
        when v_name ~ 'org_id$' then quote_literal(v_org)
        when v_name ~ 'client_id$' then quote_literal(v_client)
        when v_name ~ '(user_id|actor|approver_id|p_user)$' then quote_literal(v_user)
        when v_type = 'uuid'::regtype then quote_literal(gen_random_uuid())
        when v_type = 'date'::regtype then 'current_date'
        when v_type in ('timestamptz'::regtype, 'timestamp'::regtype) then 'now()'
        when v_type in ('integer'::regtype, 'smallint'::regtype, 'bigint'::regtype) then
             case when v_name ~ 'year' then '2026' when v_name ~ 'month' then '9'
                  when v_name ~ 'quarter' then '3' else '10' end
        when v_type = 'numeric'::regtype then '1'
        when v_type = 'boolean'::regtype then 'false'
        when v_type in ('jsonb'::regtype, 'json'::regtype) then
             case when v_name ~ '(rows|items|lines|ids|list)' then '''[]''' else '''{}''' end
        when v_type::text like '%[]' then '''{}'''
        when exists (select 1 from pg_type t where t.oid = v_type and t.typtype = 'e') then
             quote_literal((select e.enumlabel from pg_enum e where e.enumtypid = v_type
                             order by e.enumsortorder limit 1))
        when v_type = 'inet'::regtype then '''127.0.0.1'''
        else '''test'''
      end;
      v_args := v_args || format('%s := %s::%s', quote_ident(v_name), v_val, v_type::text);
    end loop;
    v_call := format('select public.%I(%s)', f.proname, array_to_string(v_args, ', '));
    begin
      set local role authenticated;
      execute v_call;
      reset role;
      v_ok := v_ok + 1;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      reset role;
      v_out := v_out || format(E'\\n%s [%s] %s', f.proname, v_state, left(v_msg, 120));
    end;
  end loop;
  raise exception 'SMOKE ok=% -- failures (read for code bugs, not "not found"):%', v_ok, v_out;
end $smoke$;
`)
