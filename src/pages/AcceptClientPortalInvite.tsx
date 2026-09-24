// PATH: src/pages/AcceptClientPortalInvite.tsx
// Shown when a client clicks a client portal invitation link.
// URL pattern: /#/accept-client-portal/:token
//
// Flow:
//   Logged in  → call accept_client_portal_invitation() → redirect
//   Logged out → redirect to SignUp with client portal token in state/query
//
// This is intentionally separate from internal workspace invitations.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useClientPortalStore } from '../store/client-portal.store'
import { db } from '../lib/supabase'
import LogoBrand from '../components/ui/LogoBrand'
import { toSafeMessage } from '../lib/errors'

type Status = 'loading' | 'success' | 'error'

interface ClientPortalInvitationRow {
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  email: string
  role: 'client_owner' | 'client_contact' | 'client_viewer'
  org_id: string
}

function portalRoleLabel(role: ClientPortalInvitationRow['role']) {
  switch (role) {
    case 'client_owner':
      return 'Client owner'
    case 'client_contact':
      return 'Client contact'
    case 'client_viewer':
      return 'Client viewer'
    default:
      return 'Client user'
  }
}

export default function AcceptClientPortalInvite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session } = useAuthStore()

  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')
  const [orgName, setOrgName] = useState('')
  const [clientName, setClientName] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Invalid client portal invitation link.')
      return
    }
    void handleAccept()
  }, [token, session])

  async function handleAccept() {
    // RLS on client_portal_invitations only grants org staff SELECT — an
    // invitee (anonymous, or freshly signed up but not yet accepted) can't
    // read the row directly. This RPC is the token-gated equivalent (same
    // pattern as get_document_signed_url elsewhere in the app).
    const { data: preview, error: invError } = await db.rpc(
      'get_client_portal_invitation_preview', { p_token: token! }
    )

    if (invError || !preview) {
      setStatus('error')
      setMessage('Client portal invitation not found or already unavailable.')
      return
    }

    const invitation = preview as unknown as {
      status: ClientPortalInvitationRow['status']
      expires_at: string
      email: string
      role: ClientPortalInvitationRow['role']
      org_id: string
      client_name: string | null
      org_name: string | null
    }
    const org = invitation.org_name ?? 'this workspace'
    const client = invitation.client_name ?? 'this client account'

    setOrgName(org)
    setClientName(client)
    setRoleLabel(portalRoleLabel(invitation.role))
    setInviteEmail(invitation.email)

    if (invitation.status !== 'pending') {
      setStatus('error')
      setMessage(`This client portal invitation has already been ${invitation.status}.`)
      return
    }

    if (new Date(invitation.expires_at) < new Date()) {
      setStatus('error')
      setMessage('This client portal invitation has expired. Ask your accountant to send a new one.')
      return
    }

    // Real bug fixed 2026-09-24, revised same day: a logged-out visitor now
    // lands on the dedicated ClientPortalActivatePage (set-password-in-one-
    // step, same pattern AcceptInvite.tsx already uses for staff via
    // /staff-activate/:token) instead of bouncing through a separate
    // login/signup page. That page's own "Already have an account? Sign in
    // to join" link covers the case where the invited email already exists
    // (confirmed live this session: it commonly does) — the token is not
    // lost either way, since that link forwards it to /login itself.
    if (!session) {
      navigate(`/client-portal-activate/${token}`, { replace: true })
      return
    }

    const { error } = await db.rpc('accept_client_portal_invitation', {
      p_token: token!
    })

    if (error) {
      setStatus('error')
      setMessage(toSafeMessage(error, 'Could not accept the invitation'))
      return
    }

    setStatus('success')
    setMessage(`You now have access to ${client} in ${org}.`)

    // Refresh client-portal memberships now so App.tsx's routing check sees
    // the new access immediately on redirect, instead of needing a manual
    // reload to populate client-portal.store.ts for the first time.
    if (session?.user?.id) {
      await useClientPortalStore.getState().loadMemberships(session.user.id)
    }

    setTimeout(() => {
      navigate('/', { replace: true })
    }, 2000)
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--lp-bg)',
        padding: 20
      }}
    >
      <div
        className="titlebar-drag"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32 }}
      />

      <div style={{ width: 390, textAlign: 'center' }}>
        <div style={{ marginBottom: 28 }}>
          <LogoBrand variant="full" />
        </div>

        <div className="lp-card" style={{ padding: '32px 24px' }}>
          {status === 'loading' && (
            <>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '2px solid rgba(59,130,246,0.2)',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'lp-spin 0.7s linear infinite',
                  margin: '0 auto 16px'
                }}
              />
              <div style={{ fontSize: 14, color: 'var(--lp-text-muted)', marginBottom: 12 }}>
                Validating client portal invitation…
              </div>

              {(clientName || orgName) && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(59,130,246,0.06)',
                    border: '0.5px solid rgba(59,130,246,0.15)',
                    fontSize: 12.5,
                    color: 'var(--lp-text-muted)',
                    lineHeight: 1.6
                  }}
                >
                  <strong style={{ color: 'var(--lp-text)' }}>{clientName}</strong>
                  <br />
                  {orgName}
                  {roleLabel ? (
                    <>
                      <br />
                      <span style={{ fontSize: 11.5, color: '#64748b' }}>{roleLabel}</span>
                    </>
                  ) : null}
                </div>
              )}
            </>
          )}

          {status === 'success' && (
            <>
              <div style={{ fontSize: 40, marginBottom: 14 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--lp-text)', marginBottom: 8 }}>
                Client portal ready
              </div>
              <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.6 }}>
                {message}
                <br />
                Redirecting you to LedgiProof…
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 8 }}>
                Invitation invalid
              </div>

              {(clientName || orgName || inviteEmail) && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '0.5px solid var(--lp-border)',
                    fontSize: 12.5,
                    color: 'var(--lp-text-muted)',
                    lineHeight: 1.6,
                    marginBottom: 14
                  }}
                >
                  {clientName && (
                    <>
                      <strong style={{ color: 'var(--lp-text)' }}>{clientName}</strong>
                      <br />
                    </>
                  )}
                  {orgName && (
                    <>
                      {orgName}
                      <br />
                    </>
                  )}
                  {roleLabel && (
                    <>
                      <span style={{ fontSize: 11.5, color: '#64748b' }}>{roleLabel}</span>
                      <br />
                    </>
                  )}
                  {inviteEmail && (
                    <span style={{ fontSize: 11.5, color: '#64748b' }}>
                      Invited email: {inviteEmail}
                    </span>
                  )}
                </div>
              )}

              <div
                style={{
                  fontSize: 13,
                  color: 'var(--lp-text-muted)',
                  lineHeight: 1.6,
                  marginBottom: 20
                }}
              >
                {message}
              </div>

              <button
                onClick={() => navigate('/', { replace: true })}
                className="lp-btn lp-btn-ghost"
                style={{ justifyContent: 'center', width: '100%' }}
              >
                Go to LedgiProof
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes lp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}