// PATH: src/pages/Login.tsx
// Same auth flow as before — App.tsx is responsible for routing
// the user to the right shell after login (super_admin → /admin,
// client_user → /client, staff_user → /).
//
// Only change vs original: accepts optional onGoToSignUp prop so the
// public router can wire it to navigate('/signup').

import { useState, type FormEvent } from 'react'
import { useAuthStore } from '../store/auth.store'
import LogoBrand from '../components/ui/LogoBrand'
import BackToSiteLink from '../components/ui/BackToSiteLink'
import GoogleSignInButton, { AuthDivider } from '../components/ui/GoogleSignInButton'

interface LoginProps {
  onGoToSignUp?:       () => void
  onGoToForgotPassword?: () => void
}

// Shown when useSessionRevocationGuard forces a sign-out mid-session
// (see src/hooks/useSessionRevocationGuard.ts) and redirects here with
// ?reason=<code>.
const REVOCATION_REASON_LABELS: Record<string, string> = {
  deactivated:       'Your account was deactivated. Contact your firm admin if this is unexpected.',
  role_changed:      'Your access was updated by an admin. Please sign in again.',
  removed_from_org:  'You were removed from this workspace. Contact your firm admin if this is unexpected.'
}

export default function Login({ onGoToSignUp, onGoToForgotPassword }: LoginProps) {
  const { signIn, loading, error, clearError } = useAuthStore()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')

  const revocationReason = new URLSearchParams(window.location.search).get('reason')
  const revocationMessage = revocationReason ? REVOCATION_REASON_LABELS[revocationReason] : null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()

    const params = new URLSearchParams(window.location.search)
    const clientInvite   = params.get('client_invite')
    const internalInvite = params.get('invite')

    await signIn(email.trim(), password)

    if (clientInvite) {
      window.location.href = `/accept-client-portal/${clientInvite}`
    } else if (internalInvite) {
      window.location.href = `/accept-invite/${internalInvite}`
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--lp-bg)'
    }}>

      <BackToSiteLink />

      <div style={{ width: 360, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <LogoBrand variant="full" />
        </div>

        <div style={{
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border)',
          borderRadius: 14, padding: '28px 24px'
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 20 }}>
            Sign in to your workspace
          </div>

          <GoogleSignInButton />
          <AuthDivider />

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {revocationMessage && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--sem-amber-bg)',
                  border: '0.5px solid var(--sem-amber-border)',
                  fontSize: 12.5, color: 'var(--sem-amber)'
                }}>
                  {revocationMessage}
                </div>
              )}

              {error && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--sem-red-bg)',
                  border: '0.5px solid var(--sem-red)',
                  fontSize: 12.5, color: 'var(--sem-red)'
                }}>
                  {error}
                </div>
              )}

              <div>
                <label style={{
                  fontSize: 12, color: 'var(--lp-text-muted)',
                  display: 'block', marginBottom: 6
                }}>
                  Email address
                </label>
                <input
                  type="email"
                  className="lp-input"
                  placeholder="you@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required autoFocus
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
                    Password
                  </label>
                  {onGoToForgotPassword && (
                    <button
                      type="button"
                      onClick={onGoToForgotPassword}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--lp-accent)', fontSize: 11.5, fontFamily: 'inherit', padding: 0
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  className="lp-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="lp-btn lp-btn-primary"
                disabled={loading}
                style={{ justifyContent: 'center', padding: '10px 0', marginTop: 4 }}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>

          {/* Sign up link */}
          {onGoToSignUp && (
            <p style={{
              textAlign: 'center', fontSize: 13,
              color: 'var(--lp-text-muted)', marginTop: 18, marginBottom: 0
            }}>
              Don't have an account?{' '}
              <button
                onClick={onGoToSignUp}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--lp-accent)', fontSize: 13, fontWeight: 500, padding: 0
                }}
              >
                Sign up
              </button>
            </p>
          )}
        </div>

        <p style={{
          textAlign: 'center', fontSize: 11.5,
          color: 'var(--lp-text-muted)', marginTop: 20
        }}>
          LedgiProof® All rights reserved 2026.
        </p>
      </div>
    </div>
  )
}