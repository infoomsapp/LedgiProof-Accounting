// PATH: src/pages/ForgotPassword.tsx
// Step 1 of the password reset flow.
// User enters their email → Supabase sends a reset link.
// Step 2 is handled by ResetPassword.tsx after the user clicks the link.

import { useState, type FormEvent } from 'react'
import { supabase }  from '../lib/supabase'
import LogoBrand     from '../components/ui/LogoBrand'
import SemaphoreSpinner from '../components/ui/SemaphoreSpinner'

interface Props {
  onBack?: () => void   // navigate back to Login
}

export default function ForgotPassword({ onBack }: Props) {
  const [email,     setEmail]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    const { error: fnErr } = await supabase.functions.invoke('send-password-reset', {
      body: { email: email.trim().toLowerCase() }
    })

    setLoading(false)

    if (fnErr) {
      setError('Could not send the reset link. Please try again.')
      return
    }

    setSent(true)
  }

  return (
    <div style={{
      height: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--lp-bg)'
    }}>
      <div style={{ width: 360, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <LogoBrand variant="full" />
        </div>

        <div style={{
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border)',
          borderRadius: 14, padding: '28px 24px'
        }}>
          {sent ? (
            // ── Success state ────────────────────────────────────────────
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>📬</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 10 }}>
                Check your inbox
              </div>
              <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
                We sent a password reset link to <strong style={{ color: 'var(--lp-text)' }}>{email}</strong>.
                It expires in 1 hour.
              </div>
              <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
                Don't see it? Check your spam folder, or{' '}
                <button
                  onClick={() => setSent(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--lp-accent)', fontSize: 12, padding: 0, fontFamily: 'inherit'
                  }}
                >
                  send again
                </button>.
              </div>
              {onBack && (
                <button
                  onClick={onBack}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--lp-text-muted)', fontSize: 13, fontFamily: 'inherit'
                  }}
                >
                  ← Back to sign in
                </button>
              )}
            </div>
          ) : (
            // ── Form ─────────────────────────────────────────────────────
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
                  Forgot your password?
                </div>
                <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.6 }}>
                  Enter the email address for your account and we'll send you a reset link.
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                      required
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    className="lp-btn lp-btn-primary"
                    disabled={loading || !email.trim()}
                    style={{ justifyContent: 'center', padding: '10px 0', marginTop: 4 }}
                  >
                    {loading
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <SemaphoreSpinner size="sm" inline />
                        Sending…
                      </span>
                    : 'Send reset link'
                  }
                  </button>
                </div>
              </form>

              {onBack && (
                <p style={{
                  textAlign: 'center', fontSize: 13,
                  color: 'var(--lp-text-muted)', marginTop: 18, marginBottom: 0
                }}>
                  <button
                    onClick={onBack}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--lp-accent)', fontSize: 13, fontWeight: 500, padding: 0,
                      fontFamily: 'inherit'
                    }}
                  >
                    ← Back to sign in
                  </button>
                </p>
              )}
            </>
          )}
        </div>

        <p style={{
          textAlign: 'center', fontSize: 11.5,
          color: 'var(--lp-text-muted)', marginTop: 20
        }}>
          LedgiProof v{import.meta.env.VITE_APP_VERSION ?? '0.1.0'}
        </p>
      </div>
    </div>
  )
}
