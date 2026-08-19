// PATH: src/pages/ResetPassword.tsx
// Step 2 of the password reset flow.
// User lands here after clicking the link from Supabase's reset email.
// Supabase processes the token from the URL and fires PASSWORD_RECOVERY
// via onAuthStateChange — we listen for it, then let the user set a new password.

import { useState, useEffect, type FormEvent } from 'react'
import { supabase }  from '../lib/supabase'
import LogoBrand     from '../components/ui/LogoBrand'
import SemaphoreSpinner from '../components/ui/SemaphoreSpinner'

interface Props {
  onDone?: () => void   // navigate to login after success
}

type Phase = 'waiting' | 'form' | 'saving' | 'done' | 'error'

export default function ResetPassword({ onDone }: Props) {
  const [phase,    setPhase]    = useState<Phase>('waiting')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    // detectSessionInUrl is false in supabase.ts (desktop-app default), so we
    // must manually exchange the token/code that Supabase appends to the URL.
    //
    // Two possible formats after clicking a recovery link:
    //   · PKCE flow  → ?code=<pkce_code>   (newer projects)
    //   · Implicit   → #access_token=...&refresh_token=...&type=recovery
    async function exchangeFromUrl() {
      const params  = new URLSearchParams(window.location.search)
      const hash    = new URLSearchParams(window.location.hash.slice(1)) // strip '#'
      const code    = params.get('code')
      const type    = hash.get('type') ?? params.get('type')
      const accessToken  = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')

      if (code) {
        // PKCE: exchange code for session
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) return // PASSWORD_RECOVERY event will fire via onAuthStateChange
      } else if (accessToken && refreshToken && type === 'recovery') {
        // Implicit: set session directly
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (!error) setPhase('form')
      }
    }
    void exchangeFromUrl()

    // Supabase fires PASSWORD_RECOVERY once it has exchanged the token.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPhase('form')
    })

    // In case the event already fired before this component mounted.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPhase('form')
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setPhase('saving')

    const { error: err } = await supabase.auth.updateUser({ password })

    if (err) {
      setError(err.message)
      setPhase('form')
      return
    }

    // Sign out so the user goes through normal login with the new password.
    await supabase.auth.signOut()
    setPhase('done')
  }

  // ── Waiting for recovery token ───────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--lp-bg)', gap: 16
      }}>
        <SemaphoreSpinner label="Verifying reset link…" />
        <p style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 8 }}>
          If this page doesn't progress,{' '}
          <a href="/forgot-password" style={{ color: 'var(--lp-accent)' }}>
            request a new link
          </a>.
        </p>
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (phase === 'done') {
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
            borderRadius: 14, padding: '28px 24px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🔐</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 10 }}>
              Password updated
            </div>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Your password has been changed successfully. Sign in with your new password.
            </div>
            <button
              className="lp-btn lp-btn-primary"
              style={{ justifyContent: 'center', padding: '10px 0', width: '100%' }}
              onClick={() => onDone?.() ?? (window.location.href = '/login')}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── New password form ────────────────────────────────────────────────────
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
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
              Set a new password
            </div>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
              Choose a strong password for your account.
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
                  New password
                </label>
                <input
                  type="password"
                  className="lp-input"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={8}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label style={{
                  fontSize: 12, color: 'var(--lp-text-muted)',
                  display: 'block', marginBottom: 6
                }}>
                  Confirm new password
                </label>
                <input
                  type="password"
                  className="lp-input"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
              </div>

              {/* Password strength hint */}
              {password.length > 0 && (
                <PasswordStrength password={password} />
              )}

              <button
                type="submit"
                className="lp-btn lp-btn-primary"
                disabled={phase === 'saving' || !password || !confirm}
                style={{ justifyContent: 'center', padding: '10px 0', marginTop: 4 }}
              >
                {phase === 'saving'
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <SemaphoreSpinner size="md" inline />
                      Saving…
                    </span>
                  : 'Update password'
                }
              </button>
            </div>
          </form>
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

// ── Password strength indicator ───────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters',          ok: password.length >= 8 },
    { label: 'Uppercase letter',        ok: /[A-Z]/.test(password) },
    { label: 'Number',                  ok: /\d/.test(password) },
    { label: 'Special character',       ok: /[^A-Za-z0-9]/.test(password) },
  ]

  const passed = checks.filter(c => c.ok).length
  const color  = passed <= 1 ? 'var(--sem-red)'   :
                 passed <= 2 ? 'var(--sem-amber)'  :
                 passed <= 3 ? '#60a5fa'            :
                               'var(--sem-green)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Bar */}
      <div style={{ display: 'flex', gap: 3 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= passed ? color : 'var(--lp-border)',
            transition: 'background 0.2s'
          }} />
        ))}
      </div>
      {/* Checks */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {checks.map(c => (
          <span key={c.label} style={{
            fontSize: 11, color: c.ok ? 'var(--sem-green)' : 'var(--lp-text-muted)'
          }}>
            {c.ok ? '✓' : '·'} {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}
