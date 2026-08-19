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
import { db } from '../lib/supabase'
import LogoBrand from '../components/ui/LogoBrand'

type Status = 'loading' | 'success' | 'error'

interface ClientPortalInvitationRow {
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  email: string
  role: 'client_owner' | 'client_contact' | 'client_viewer'
  org_id: string
  clients?: {
    display_name: string | null
    company_name: string | null
  } | null
  organizations?: {
    name: string | null
  } | null
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
    const { data: inv, error: invError } = await db
      .from('client_portal_invitations')
      .select(`
        status,
        expires_at,
        email,
        role,
        org_id,
        clients(display_name, company_name),
        organizations(name)
      `)
      .eq('token', token!)
      .single()

    if (invError || !inv) {
      setStatus('error')
      setMessage('Client portal invitation not found or already unavailable.')
      return
    }

    const invitation = inv as unknown as ClientPortalInvitationRow
    const org = invitation.organizations?.name ?? 'this workspace'
    const client =
      invitation.clients?.display_name ??
      invitation.clients?.company_name ??
      'this client account'

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

    if (!session) {
      navigate(`/signup?client_invite=${token}`, { replace: true })
      return
    }

    const { error } = await db.rpc('accept_client_portal_invitation', {
      p_token: token!
    })

    if (error) {
      setStatus('error')
      setMessage(error.message)
      return
    }

    setStatus('success')
    setMessage(`You now have access to ${client} in ${org}.`)

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