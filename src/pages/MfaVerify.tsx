// PATH: src/pages/MfaVerify.tsx
// Shown when user has 2FA enabled and just logged in with password.
// Sits between login and the app — aal1 → aal2 upgrade.

import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useAuthStore } from '../store/auth.store'
import LogoBrand        from '../components/ui/LogoBrand'
import SemaphoreSpinner   from '../components/ui/SemaphoreSpinner'

export default function MfaVerify() {
  const { verifyMfa, signOut, loading, error, clearError } = useAuthStore()
  const [code, setCode]   = useState(['','','','','',''])
  const inputs             = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => { inputs.current[0]?.focus() }, [])

  // Auto-advance on digit input
  function handleDigit(i: number, val: string) {
    if (!/^\d*$/.test(val)) return
    const next = [...code]
    next[i] = val.slice(-1)
    setCode(next)
    if (val && i < 5) inputs.current[i + 1]?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      inputs.current[i - 1]?.focus()
    }
  }

  // Paste: fill all 6 digits at once
  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setCode(text.split(''))
      inputs.current[5]?.focus()
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    clearError()
    const otp = code.join('')
    if (otp.length < 6) return
    await verifyMfa(otp)
  }

  const otp      = code.join('')
  const canSubmit = otp.length === 6 && !loading

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--lp-bg)'
    }}>
      <div className="titlebar-drag" style={{ position:'absolute', top:0, left:0, right:0, height:32 }} />

      <div style={{ width: 360, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <LogoBrand variant="full" />
        </div>

        <div style={{
          background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
          borderRadius: 14, padding: '28px 24px'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
              Two-factor authentication
            </div>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.6 }}>
              Enter the 6-digit code from your authenticator app.
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                padding: '8px 12px', borderRadius: 7, marginBottom: 16,
                background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)',
                fontSize: 12.5, color: 'var(--sem-red)', textAlign: 'center'
              }}>
                {error}
              </div>
            )}

            {/* 6-digit OTP input */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}
              onPaste={handlePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { inputs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  style={{
                    width: 42, height: 48, textAlign: 'center',
                    fontSize: 20, fontWeight: 700, fontFamily: 'monospace',
                    // CSS-TODO: rgba(255,255,255,0.05) — dark-mode subtle overlay, no var() yet
                    background: 'rgba(255,255,255,0.05)',
                    // CSS-TODO: rgba(255,255,255,0.12) — idle border overlay, no var() yet
                    border: `1.5px solid ${digit ? 'var(--lp-accent)' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 9, color: 'var(--lp-text)', outline: 'none',
                    transition: 'border-color 0.15s',
                    caretColor: 'transparent'
                  }}
                />
              ))}
            </div>

            <button
              type="submit"
              className="lp-btn lp-btn-primary"
              disabled={!canSubmit}
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
            >
              {loading
                ? <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                    <SemaphoreSpinner size="md" inline />
                    Verifying…
                  </span>
                : 'Verify'
              }
            </button>
          </form>

          <button
            onClick={signOut}
            style={{
              width: '100%', marginTop: 12, background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 12.5, color: 'var(--lp-text-muted)',
              fontFamily: 'inherit'
            }}
          >
            ← Sign in with a different account
          </button>
        </div>

        <p style={{ textAlign:'center', fontSize:11.5, color:'var(--lp-text-muted)', marginTop:16 }}>
          LedgiProof v{import.meta.env.VITE_APP_VERSION ?? '0.1.0'} · Olympus Mont Systems LLC
        </p>
      </div>
    </div>
  )
}