-- ─────────────────────────────────────────────────────────────────────────────
-- CQRS Read Model Infrastructure
-- Apply in: Supabase Dashboard → SQL Editor → Run
--
-- LedgiProof distinguishes two professional firm types:
--   · Accountant Firm  (is_accountant_firm = true)  — PRIMARY practice type.
--     Partners, controllers, senior accountants. Full CPA-firm workflow:
--     journal entries, period close, GAAP compliance, multi-client practice.
--   · Bookkeeper Firm  (is_accountant_firm = false) — Day-to-day transactional.
--     Bookkeepers, reconciliation, invoicing, payroll for small businesses.
--
-- Both firm types share the same underlying RPC (get_bookkeeper_dashboard) but
-- maintain SEPARATE read model rows so each firm type's Realtime subscription
-- fires only for its own dirty signals. Writes dirty BOTH models; clients
-- subscribe only to the model that matches their org type.
--
-- Read models covered:
--   accountant_dashboard  — Accountant firm (primary)
--   bookkeeper_dashboard  — Bookkeeper firm
--   solo_dashboard        — Self-employed / solo workspace
--   pyme_dashboard        — PYME (small business) client
--   firm_insights         — Shared: AR aging, cash-flow, P&L (both firm types)
--   workspace_chat        — Unread message counts on dashboards
--   member_chat           — Internal team conversation counts
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. read_model_dirty table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.read_model_dirty (
  org_id     uuid        NOT NULL,
  model      text        NOT NULL,
  dirtied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, model)
);

-- Full replica identity so Realtime includes the old row on UPDATE events
ALTER TABLE public.read_model_dirty REPLICA IDENTITY FULL;

-- Enable Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname  = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'read_model_dirty'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.read_model_dirty;
  END IF;
END;
$$;

-- RLS
ALTER TABLE public.read_model_dirty ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can read own org dirty signals" ON public.read_model_dirty;
CREATE POLICY "members can read own org dirty signals"
  ON public.read_model_dirty
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id    = read_model_dirty.org_id
        AND om.user_id   = auth.uid()
        AND om.is_active = true
    )
  );

-- ── 2. mark_read_model_dirty() ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_read_model_dirty(
  p_org_id uuid,
  p_models text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_model text;
BEGIN
  FOREACH v_model IN ARRAY p_models LOOP
    INSERT INTO public.read_model_dirty (org_id, model, dirtied_at)
    VALUES (p_org_id, v_model, now())
    ON CONFLICT (org_id, model)
    DO UPDATE SET dirtied_at = now();
  END LOOP;
END;
$$;

-- ── 3. Trigger functions ──────────────────────────────────────────────────────
--
-- Ordering convention: accountant_dashboard is always listed FIRST because
-- it is the primary professional firm type. Bookkeeper_dashboard follows.
-- Solo and PYME models are only included where their data is affected.

-- Transactions — affect all firm dashboards
CREATE OR REPLACE FUNCTION public.trg_transactions_dirty()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.mark_read_model_dirty(
    NEW.org_id,
    ARRAY[
      'accountant_dashboard',   -- primary
      'bookkeeper_dashboard',
      'firm_insights',          -- shared AR aging + cash-flow for both firm types
      'solo_dashboard',
      'pyme_dashboard'
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_dirty ON public.transactions;
CREATE TRIGGER trg_transactions_dirty
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_transactions_dirty();

-- Invoices — affect firm dashboards + PYME (invoices belong to firms AND their clients)
CREATE OR REPLACE FUNCTION public.trg_invoices_dirty()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.mark_read_model_dirty(
    NEW.org_id,
    ARRAY[
      'accountant_dashboard',   -- primary (AR aging widget, outstanding AR)
      'bookkeeper_dashboard',
      'firm_insights',
      'pyme_dashboard'
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_dirty ON public.invoices;
CREATE TRIGGER trg_invoices_dirty
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_dirty();

-- Journal entries — affect firm dashboards + insights (P&L, balance sheet)
CREATE OR REPLACE FUNCTION public.trg_journal_entries_dirty()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.mark_read_model_dirty(
    NEW.org_id,
    ARRAY[
      'accountant_dashboard',   -- primary (journal entries are core accountant workflow)
      'bookkeeper_dashboard',
      'firm_insights',          -- P&L trend, cash-flow chart
      'solo_dashboard'
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_dirty ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_dirty
  AFTER INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_journal_entries_dirty();

-- Workspace messages — unread counts on firm dashboards
CREATE OR REPLACE FUNCTION public.trg_workspace_messages_dirty()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.mark_read_model_dirty(
    NEW.org_id,
    ARRAY[
      'accountant_dashboard',   -- primary
      'bookkeeper_dashboard',
      'workspace_chat'
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_messages_dirty ON public.workspace_messages;
CREATE TRIGGER trg_workspace_messages_dirty
  AFTER INSERT ON public.workspace_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_workspace_messages_dirty();

-- ── 4. Backfill ───────────────────────────────────────────────────────────────
--
-- Seeds one row per (org_id, model) for every existing org so that
-- Realtime subscriptions have a row to match on immediately — without this,
-- a new subscription receives no events until the first write.
--
-- dirtied_at is set 1 hour in the past so the client treats the snapshot as
-- "already refreshed" and doesn't immediately trigger a reload on mount.

INSERT INTO public.read_model_dirty (org_id, model, dirtied_at)
SELECT
  o.id,
  m.model,
  now() - interval '1 hour'
FROM public.organizations o
CROSS JOIN (VALUES
  ('accountant_dashboard'),   -- primary firm type
  ('bookkeeper_dashboard'),
  ('solo_dashboard'),
  ('pyme_dashboard'),
  ('firm_insights'),
  ('workspace_chat'),
  ('member_chat')
) AS m(model)
ON CONFLICT (org_id, model) DO NOTHING;

-- ── 5. Post-apply checklist ───────────────────────────────────────────────────
--
-- After running this script:
--
--   1. Verify the table exists:
--      SELECT * FROM read_model_dirty LIMIT 5;
--
--   2. Verify triggers are active:
--      SELECT trigger_name, event_object_table FROM information_schema.triggers
--      WHERE trigger_schema = 'public' AND trigger_name LIKE '%dirty%';
--
--   3. Regenerate TypeScript types so read_model_dirty appears in Database:
--      supabase gen types typescript --project-id <your-project-id> \
--        > src/types/database.types.ts
--      Then remove the `as any` cast in src/lib/read-model.ts.
--
--   4. In Supabase Dashboard → Database → Replication, confirm
--      read_model_dirty appears under the supabase_realtime publication.
