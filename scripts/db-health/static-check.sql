-- PATH: scripts/db-health/static-check.sql
--
-- Static check of every PL/pgSQL function in public, lp_private and payroll:
-- columns, tables and functions that don't exist, ambiguous references,
-- RETURN QUERY shapes that don't match the declared result. Nothing runs;
-- plpgsql_check reads each function against the live schema.
--
-- Needs the plpgsql_check extension (installed in schema "extensions",
-- migration enable_plpgsql_check). Run it in the Supabase SQL editor.
-- Expected result: no rows, except the known entries listed in README.md.

with fns as (
  select p.oid, n.nspname || '.' || p.proname as fn,
         case when p.prorettype = 'trigger'::regtype then
           (select t.tgrelid from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal limit 1)
         end as rel,
         p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where l.lanname = 'plpgsql'
     and n.nspname in ('public', 'lp_private', 'payroll')
)
select f.fn, c.sqlstate, c.message, left(coalesce(c.query, ''), 160) as query
  from fns f,
  lateral extensions.plpgsql_check_function_tb(
            f.oid, coalesce(f.rel, 0),
            fatal_errors => false, other_warnings => false,
            performance_warnings => false, extra_warnings => false) c
 where c.level = 'error'
   and (not f.is_trigger or f.rel is not null)   -- a trigger function with no trigger can't be checked
 order by 1;
