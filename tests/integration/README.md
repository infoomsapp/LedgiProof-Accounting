# SQL integration tests

These exercise the **money & reconciliation logic that lives in Postgres**
(RPCs + triggers) — the parts unit tests can't reach:

- `invoice.itest.ts` — `compute_invoice_totals` (line discount/tax → totals) and
  payment reconciliation (`balance_due`, status → `paid`).
- `recurring.itest.ts` — `generate_recurring_invoice` (reuses
  `next_invoice_number` + `compute_invoice_totals`, links `recurring_id`,
  advances the schedule).

Every test runs inside a transaction that is **always rolled back** — the
database is never mutated.

## Running

They need a direct Postgres connection string. Get it from the Supabase
dashboard → **Project Settings → Database → Connection string → "Direct
connection"** (or the session pooler), which includes the DB password.

```bash
# 1. Install the runner deps (once)
npm install            # picks up vitest + pg + @types/pg

# 2. Provide the connection and run
DATABASE_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres" npm run test:integration
```

Without `DATABASE_URL` the suites **skip cleanly** (they show as skipped, not
failed), so `npm test` (the fast unit suite) and CI without a database stay
green.

## CI

Add a job that runs `npm run test:integration` with `DATABASE_URL` provided as a
secret (point it at a disposable/staging database, since even though every test
rolls back, you don't want tests hitting production).

## Extending

Port any DB-verified calculation here by copying the pattern in `db.ts`
(`withRollback` + `seedRefs`). Good next candidates: AR aging buckets, firm P&L
debit/credit convention, `enforce_balanced_journal_before_lock` (attempt to lock
an unbalanced transaction → expect rejection).
