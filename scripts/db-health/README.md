# Database health checks

Two checks against the live Supabase database. Unit tests don't touch the
database, so they can't see a function that references a column that no
longer exists: these can. Run both after any migration.

## 1. Static check — `static-check.sql`

Paste into the Supabase SQL editor. `plpgsql_check` reads every PL/pgSQL
function in `public`, `lp_private` and `payroll` against the live schema
without running it. Expect no rows except the known entries below.

## 2. RPC smoke test — `rpc-smoke.mjs`

```bash
node scripts/db-health/rpc-smoke.mjs > smoke.sql
```

Paste `smoke.sql` into the SQL editor. It calls every RPC the web app, the
edge functions and the mobile app use (`../ledgiproof-mobile` by default, or
pass its path), as a real owner, inside one transaction that always rolls
back, so nothing is written. The result lists every failed call.

With synthesized arguments, "not found", "unauthorized", "super admin role
required" and validation messages are expected. These are the ones that mean
broken code:

| SQLSTATE | Meaning |
|---|---|
| `42703` | column doesn't exist |
| `42883` | function doesn't exist (often: pgcrypto is in `extensions`, not on the search_path) |
| `42804`, `42P13` | the result doesn't match the declared return type |
| `42702` | ambiguous column reference |
| `55000` | a RECORD variable read before it was assigned |
| `42725` | two overloads match the call |
| `42501` | permission denied on something the app calls as a user (payroll's `*_run` / `*_provider_*` / `mark_*` functions are service-role only: expected) |
| `[missing]` | the app calls an RPC that doesn't exist |

## Known entries (2026-09-28)

- `evaluate_transaction_evidence` (42804): not called by the app.
- `register_document`, `send_transaction_message`, `soft_delete_document`
  (42703, `audit_events.action`): the audit insert is wrapped in
  `exception when others`, so the action itself works but its audit row is
  lost. `audit_events` is the hash-chained transaction log; these events
  need their own home.
