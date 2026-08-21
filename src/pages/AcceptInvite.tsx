// PATH: src/pages/AcceptInvite.tsx
// Shown when a user clicks an invitation link.
// URL pattern: /#/accept-invite/:token
// Flow:
//   Logged in  → call accept_invitation() → redirect to dashboard
//   Logged out → redirect to SignUp with token in state

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore }  from '../store/auth.store'
import { db }            from '../lib/supabase'
import LogoBrand         from '../components/ui/LogoBrand'

export default function AcceptInvite() {
  const { token }    = useParams<{ token: string }>()
  const navigate     = useNavigate()
  const { session, profile } = useAuthStore()

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [orgName, setOrgName] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Invalid invitation link'); return }
    handleAccept()
  }, [token, session])

  async function handleAccept() {
    // Load invitation metadata by token via a SECURITY DEFINER RPC — the invitations
    // table itself has no public read policy, so a caller must know the exact token.
    const { data: inv, error: metaErr } = await db.rpc('get_staff_invitation_by_token', { p_token: token! })

    if (metaErr || !inv) {
      setStatus('error')
      setMessage('Invitation not found or already used.')
      return
    }

    const name = (inv as any).org_name ?? 'your workspace'
    setOrgName(name)

    // Not logged in — redirect to dedicated staff activation page
    if (!session) {
      navigate(`/staff-activate/${token}`, { replace: true })
      return
    }

    // Logged in — accept immediately
    const { error } = await db.rpc('accept_invitation', {
      p_token:   token!,
      p_user_id: profile!.id
    })

    if (error) {
      setStatus('error')
      setMessage(error.message)
    } else {
      setStatus('success')
      setMessage(`You joined ${name}!`)
      // Reload orgs so the new workspace appears
      setTimeout(() => navigate('/', { replace: true }), 2000)
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--lp-bg)', padding: 20
    }}>
      <div className="titlebar-drag" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32 }} />

      <div style={{ width: 360, textAlign: 'center' }}>
        <div style={{ marginBottom: 28 }}>
          <LogoBrand variant="full" />
        </div>

        <div className="lp-card" style={{ padding: '32px 24px' }}>
          {status === 'loading' && (
            <>
              <div style={{
                width: 32, height: 32, border: '2px solid rgba(59,130,246,0.2)',
                borderTopColor: '#3b82f6', borderRadius: '50%',
                animation: 'lp-spin 0.7s linear infinite',
                margin: '0 auto 16px'
              }} />
              <div style={{ fontSize: 14, color: 'var(--lp-text-muted)' }}>
                Validating invitation…
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div style={{ fontSize: 40, marginBottom: 14 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--lp-text)', marginBottom: 8 }}>
                Welcome aboard!
              </div>
              <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.6 }}>
                {message}
                <br />Redirecting to your workspace…
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 8 }}>
                Invitation invalid
              </div>
              <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
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