-- PATH: supabase/sql/client_portal_invitations.sql
--
-- Client portal invite flow — bookkeeper/accountant firm invites a client
-- contact to join their client's portal on LedgiProof.
--
-- BACKFILL NOTE: this schema was already live on the project (built and
-- deployed in an earlier session) but had never been captured in a checked-in
-- SQL file — only reflected in the hand-maintained src/types/database.types.ts.
-- This file documents the live schema for the repo; it is written to be safe
-- to re-run against a fresh project (guards on type/table creation) but is
-- NOT expected to change anything on the already-provisioned project.
--
-- Flow: create_client_portal_invitation (RPC) → row in
-- client_portal_invitations → send-client-invitation edge function (Resend
-- email) → client opens /accept-client-portal/:token →
-- accept_client_portal_invitation (RPC) → row in client_portal_users.

-- ── Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.client_portal_role AS ENUM (
    'client_owner', 'client_contact', 'client_viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.client_portal_invitation_status AS ENUM (
    'pending', 'accepted', 'expired', 'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── client_portal_users — accepted portal members, one row per client per
--    portal user (a person can belong to multiple clients' portals) ───────
CREATE TABLE IF NOT EXISTS public.client_portal_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        public.client_portal_role NOT NULL DEFAULT 'client_contact',
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by  UUID REFERENCES public.profiles(id),
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, profile_id)
);

ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_portal_users_select ON public.client_portal_users;
CREATE POLICY client_portal_users_select ON public.client_portal_users
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.has_org_role(org_id, ARRAY['owner','admin','accountant','approver','auditor']::public.lp_role[])
  );

DROP POLICY IF EXISTS client_portal_users_write ON public.client_portal_users;
CREATE POLICY client_portal_users_write ON public.client_portal_users
  FOR ALL USING (public.has_org_role(org_id, ARRAY['owner','admin']::public.lp_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']::public.lp_role[]));

-- ── client_portal_invitations — pending/resolved invites ───────────────────
CREATE TABLE IF NOT EXISTS public.client_portal_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email       VARCHAR NOT NULL,
  role        public.client_portal_role NOT NULL DEFAULT 'client_contact',
  token       VARCHAR NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status      public.client_portal_invitation_status NOT NULL DEFAULT 'pending',
  invited_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.client_portal_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_portal_invitations_select ON public.client_portal_invitations;
CREATE POLICY client_portal_invitations_select ON public.client_portal_invitations
  FOR SELECT USING (public.has_org_role(org_id, ARRAY['owner','admin','accountant']::public.lp_role[]));

DROP POLICY IF EXISTS client_portal_invitations_write ON public.client_portal_invitations;
CREATE POLICY client_portal_invitations_write ON public.client_portal_invitations
  FOR ALL USING (public.has_org_role(org_id, ARRAY['owner','admin']::public.lp_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']::public.lp_role[]));

-- ── create_client_portal_invitation ─────────────────────────────────────────
-- Called by the frontend (client-portal.service.ts) when an owner/admin
-- invites a contact to a client's portal. Resolves org_id from the client,
-- checks the caller's role, inserts the invite row (token + expiry are
-- column defaults). The frontend then calls the send-client-invitation edge
-- function with the returned token to actually send the branded email.
CREATE OR REPLACE FUNCTION public.create_client_portal_invitation(
  p_client_id UUID,
  p_email     TEXT,
  p_role      public.client_portal_role DEFAULT 'client_contact'::public.client_portal_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_inv_id UUID;
  v_token VARCHAR;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT org_id INTO v_org_id
    FROM public.clients
   WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client % not found', p_client_id;
  END IF;

  IF NOT public.has_org_role(v_org_id, ARRAY['owner','admin']::public.lp_role[]) THEN
    RAISE EXCEPTION 'not authorized to invite portal users for this client';
  END IF;

  INSERT INTO public.client_portal_invitations (
    org_id, client_id, email, role, invited_by
  )
  VALUES (
    v_org_id, p_client_id, LOWER(TRIM(p_email)), p_role, auth.uid()
  )
  RETURNING id, token, expires_at INTO v_inv_id, v_token, v_expires_at;

  RETURN jsonb_build_object(
    'invitation_id', v_inv_id,
    'token', v_token,
    'expires_at', v_expires_at
  );
END;
$function$;

-- ── accept_client_portal_invitation ─────────────────────────────────────────
-- Called by AcceptClientPortalInvite.tsx once the invited person is
-- authenticated (signs up first if needed, then lands back here with the
-- token). Validates the invite is pending and not expired, upserts the
-- client_portal_users membership, marks the invite accepted.
CREATE OR REPLACE FUNCTION public.accept_client_portal_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv      public.client_portal_invitations%ROWTYPE;
  v_profile  UUID;
  v_link_id  UUID;
BEGIN
  v_profile := auth.uid();

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'must be authenticated to accept invitation';
  END IF;

  SELECT * INTO v_inv
    FROM public.client_portal_invitations
   WHERE token  = p_token
     AND status = 'pending'
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found or no longer pending';
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.client_portal_invitations
       SET status = 'expired'
     WHERE id = v_inv.id;

    RAISE EXCEPTION 'invitation has expired';
  END IF;

  INSERT INTO public.client_portal_users (
    org_id, client_id, profile_id, role, is_primary,
    invited_by, invited_at, accepted_at, is_active
  )
  VALUES (
    v_inv.org_id, v_inv.client_id, v_profile, v_inv.role, FALSE,
    v_inv.invited_by, v_inv.invited_at, NOW(), TRUE
  )
  ON CONFLICT (client_id, profile_id) DO UPDATE
    SET role        = EXCLUDED.role,
        is_active   = TRUE,
        accepted_at = NOW(),
        updated_at  = NOW()
  RETURNING id INTO v_link_id;

  UPDATE public.client_portal_invitations
     SET status      = 'accepted',
         accepted_by = v_profile,
         accepted_at = NOW()
   WHERE id = v_inv.id;

  RETURN v_link_id;
END;
$function$;
