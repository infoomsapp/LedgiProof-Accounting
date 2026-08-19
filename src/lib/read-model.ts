// PATH: src/lib/read-model.ts
//
// CQRS Read-Model layer — dirty signaling utilities.
//
// The read model pattern here uses a lightweight `read_model_dirty` table
// as a Postgres-native event bus:
//
//   Write path:  DB trigger (or markReadModelDirty()) upserts a row
//                → Supabase Realtime fires the change to subscribed clients
//   Read path:   useReadModelSignal() reacts → invalidates React Query cache
//                → the existing RPC is called once with fresh data
//
// This replaces 45-second polling intervals with push-based invalidation:
// reads only happen when data actually changes, not on a fixed timer.
//
// SCHEMA (apply via supabase/sql/cqrs_read_models.sql):
//
//   CREATE TABLE read_model_dirty (
//     org_id     uuid        NOT NULL,
//     model      text        NOT NULL,
//     dirtied_at timestamptz NOT NULL DEFAULT now(),
//     PRIMARY KEY (org_id, model)
//   );
//   ALTER TABLE read_model_dirty REPLICA IDENTITY FULL;

import { db } from './supabase'

// ── Model registry ─────────────────────────────────────────────────────────────

export type ReadModelName =
  | 'accountant_dashboard'   // Accountant firm — primary professional practice type
  | 'bookkeeper_dashboard'   // Bookkeeper firm
  | 'solo_dashboard'
  | 'pyme_dashboard'
  | 'firm_insights'          // Shared: AR aging, cash-flow trend, P&L (both firm types)
  | 'workspace_chat'
  | 'member_chat'

// ── markReadModelDirty ─────────────────────────────────────────────────────────

/**
 * Marks one or more read models as stale for a given org.
 *
 * Must be called after any write that would change the model's data.
 * Fire-and-forget — never awaited on the write path. Failure is logged
 * but never propagates (a stale read model degrades gracefully; the client
 * can always fall back to polling).
 *
 * The upsert touches `dirtied_at`, which triggers a Realtime UPDATE event
 * that useReadModelSignal() subscribers react to.
 */
export function markReadModelDirty(
  orgId:  string,
  models: ReadModelName | ReadModelName[]
): void {
  const names = Array.isArray(models) ? models : [models]
  const now   = new Date().toISOString()
  const rows  = names.map(model => ({ org_id: orgId, model, dirtied_at: now }))

  // `read_model_dirty` is a new table added by supabase/sql/cqrs_read_models.sql.
  // Cast to `any` until `supabase gen types typescript` is re-run after applying
  // the migration — at that point, remove this cast and use db.from('read_model_dirty').
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(db as any).from('read_model_dirty')
    .upsert(rows, { onConflict: 'org_id,model' })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) {
        console.warn('[ReadModel] markReadModelDirty failed (non-fatal):', error.message)
      }
    })
}
