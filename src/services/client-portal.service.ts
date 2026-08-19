// PATH: src/services/client-portal.service.ts
//
// Service layer for client portal invitations.
//
// Architecture (per Constitution + Addendum #1):
//   · This service is SEPARATE from team invitations (which live in
//     Clients.tsx as direct INSERT to public.invitations).
//   · All writes go through SECURITY DEFINER RPC `create_client_portal_invitation`,
//     never INSERT directly to public.client_portal_invitations.
//   · Reads use `has_org_role(['owner','admin','accountant'])` via RLS.
//
// What this service DOES NOT do (intentional):
//   · Does NOT cross-import workspace-chat.service or chat-tx.service
//   · Does NOT expose org_id to anonymous callers
//   · Does NOT bypass the RPC (no direct table INSERTs for create)

import { db } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ClientPortalRole =
  | 'client_owner'
  | 'client_contact'
  | 'client_viewer'

export type ClientPortalInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'expired'
  | 'revoked'

export interface ClientPortalInvitation {
  id:          string
  org_id:      string
  client_id:   string
  email:       string
  role:        ClientPortalRole
  token:       string
  status:      ClientPortalInvitationStatus
  invited_by:  string
  invited_at:  string
  expires_at:  string
  accepted_by: string | null
  accepted_at: string | null
  created_at:  string
}

export interface ClientPortalInvitationWithClient extends ClientPortalInvitation {
  clients?: {
    id:           string
    display_name: string | null
    company_name: string | null
  } | null
}

export const CLIENT_PORTAL_ROLE_CONFIG: Record<ClientPortalRole, {
  label:       string
  description: string
  color:       string
  bg:          string
}> = {
  client_owner: {
    label:       'Owner',
    description: 'Full access — can manage team, billing, and all data',
    color:       '#a78bfa',
    bg:          'rgba(167,139,250,0.10)'
  },
  client_contact: {
    label:       'Contact',
    description: 'Operational access — view + respond to bookkeeper queries',
    color:       '#60a5fa',
    bg:          'rgba(96,165,250,0.10)'
  },
  client_viewer: {
    label:       'Viewer',
    description: 'Read-only — view reports and documents, cannot modify',
    color:       '#94a3b8',
    bg:          'rgba(148,163,184,0.10)'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create invitation
// ─────────────────────────────────────────────────────────────────────────────
// Uses the RPC create_client_portal_invitation (SECURITY DEFINER).
// The RPC handles:
//   · org_id resolution from client_id
//   · invited_by from auth.uid()
//   · token generation (gen_random_bytes(32))
//   · expires_at default (now + 7 days)
//   · status default 'pending'

export async function createClientPortalInvitation(input: {
  clientId: string
  email:    string
  role:     ClientPortalRole
}): Promise<{ invitation_id: string; token: string; expires_at: string }> {
  const trimmedEmail = input.email.trim().toLowerCase()

  if (trimmedEmail.length === 0) {
    throw new Error('Email is required')
  }
  if (!trimmedEmail.includes('@')) {
    throw new Error('Invalid email format')
  }

  const { data, error } = await db.rpc('create_client_portal_invitation', {
    p_client_id: input.clientId,
    p_email:     trimmedEmail,
    p_role:      input.role
  })

  if (error) throw new Error(error.message)
  return data as unknown as { invitation_id: string; token: string; expires_at: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// List invitations for an org
// ─────────────────────────────────────────────────────────────────────────────
// RLS handles scoping: bookkeeper sees only their org's invitations.
// Joins the `clients` table to display which client each invitation is for.

export async function listClientPortalInvitations(
  orgId: string,
  options: { includeAccepted?: boolean } = {}
): Promise<ClientPortalInvitationWithClient[]> {
  const statuses: ClientPortalInvitationStatus[] = options.includeAccepted
    ? ['pending', 'accepted', 'expired', 'revoked']
    : ['pending']

  const { data, error } = await db
    .from('client_portal_invitations')
    .select(`
      id,
      org_id,
      client_id,
      email,
      role,
      token,
      status,
      invited_by,
      invited_at,
      expires_at,
      accepted_by,
      accepted_at,
      created_at,
      clients (
        id,
        display_name,
        company_name
      )
    `)
    .eq('org_id', orgId)
    .in('status', statuses)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ClientPortalInvitationWithClient[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Revoke invitation
// ─────────────────────────────────────────────────────────────────────────────
// Updates status to 'revoked'. RLS requires owner/admin role.
// We do NOT delete — we keep the row for audit trail.

export async function revokeClientPortalInvitation(
  invitationId: string
): Promise<void> {
  const { error } = await db
    .from('client_portal_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('status', 'pending')  // can only revoke pending ones

  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the public invitation URL
// ─────────────────────────────────────────────────────────────────────────────
// Format must match the route in App.tsx and the page AcceptClientPortalInvite.tsx.

export function buildClientPortalInvitationUrl(token: string): string {
  return `${window.location.origin}/accept-client-portal/${token}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Send invitation email via edge function
// ─────────────────────────────────────────────────────────────────────────────
// Never throws (a failed email must not roll back the already-created
// invitation row) — but DOES report success/failure so the caller can tell
// the user the email didn't go out instead of silently claiming "sent".

export interface SendInvitationEmailResult {
  sent:  boolean
  error?: string
}

export async function sendClientInvitationEmail(params: {
  toEmail:       string
  invitationUrl: string
  clientName:    string
  firmName:      string
  role:          ClientPortalRole
  expiresAt:     string
}): Promise<SendInvitationEmailResult> {
  const { data: { session } } = await db.auth.getSession()
  if (!session?.access_token) {
    console.warn('[client-portal] No session — skipping invitation email')
    return { sent: false, error: 'Not signed in' }
  }

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const res = await fetch(`${supabaseUrl}/functions/v1/send-client-invitation`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        to_email:       params.toEmail,
        invitation_url: params.invitationUrl,
        client_name:    params.clientName,
        firm_name:      params.firmName,
        role:           params.role,
        expires_at:     params.expiresAt
      })
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[client-portal] Failed to send invitation email:', res.status, text)
      let msg = `Email service returned ${res.status}`
      try { msg = JSON.parse(text)?.error ?? msg } catch { /* not JSON */ }
      return { sent: false, error: msg }
    }

    return { sent: true }
  } catch (err: any) {
    console.error('[client-portal] Unexpected error sending invitation email:', err)
    return { sent: false, error: err?.message ?? 'Network error' }
  }
}
