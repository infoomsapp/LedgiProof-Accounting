// PATH: src/pages/MfaRequired.tsx
// Forced MFA enrollment wall for critical roles (owner, admin, accountant, approver).
// Rendered by AppShell when the user's workspace role demands MFA but no verified
// factor exists. Non-dismissable — the only escape is signing out.

import { useState, useRef, type ReactNode, type KeyboardEvent, type ClipboardEvent } from 'react'
import { useAuthStore } from '../store/auth.store'
import LogoBrand from '../components/ui/LogoBrand'
import SemaphoreSpinner from '../components/ui/SemaphoreSpinner'

interface Props {
  onMfaEnrolled: () => void
}

type Phase = 'intro' | 'enrolling' | 'confirming' | 'done' | 'error'

const CODE_LENGTH = 6

export default function MfaRequired({ onMfaEnrolled }: Props) {
  const { enrollMfa, confirmMfaEnrollment, signOut } = useAuthStore()

  const [phase,    setPhase]    = useState<Phase>('intro')
  const [qrCode,   setQrCode]   = useState<string | null>(null)
  const [secret,   setSecret]   = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [digits,   setDigits]   = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [error,    setError]    = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  async function startEnrollment() {
    setPhase('enrolling')
    setError(null)

    const result = await enrollMfa()

    if (!result) {
      setError('Could not start MFA enrollment. Try signing out and back in.')
      setPhase('error')
      return
    }

    setQrCode(result.qrCode)
    setSecret(result.secret)
    setFactorId(result.factorId)
    setPhase('confirming')
  }

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError(null)

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!text) return
    const next = Array(CODE_LENGTH).fill('')
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setDigits(next)
    inputRefs.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus()
  }

  async function handleConfirm() {
    const code = digits.join('')
    if (code.length < CODE_LENGTH || !factorId) return

    setError(null)
    setPhase('enrolling') // spinner while verifying

    try {
      await confirmMfaEnrollment(factorId, code)
      const { error: storeErr } = useAuthStore.getState()

      if (storeErr) {
        setError(storeErr)
        setPhase('confirming')
        return
      }

      setPhase('done')
    } catch {
      setError('Invalid code — check your authenticator app.')
      setPhase('confirming')
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    window.location.href = '/login'
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <FullScreenCard>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🔐</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 10 }}>
            Two-factor authentication enabled
          </div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.7, marginBottom: 24 }}>
            Your account is now protected. Future sign-ins will require your authenticator code.
          </div>
          <button
            className="lp-btn lp-btn-primary"
            style={{ justifyContent: 'center', padding: '10px 0', width: '100%' }}
            onClick={onMfaEnrolled}
          >
            Continue to LedgiProof
          </button>
        </div>
      </FullScreenCard>
    )
  }

  // ── Enrolling / spinner ───────────────────────────────────────────────────
  if (phase === 'enrolling') {
    return (
      <FullScreenCard>
        <div style={{ textAlign: 'center' }}>
          <SemaphoreSpinner size="md" inline />
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 14 }}>
            Setting up your authenticator…
          </div>
        </div>
      </FullScreenCard>
    )
  }

  // ── QR code + confirm form ────────────────────────────────────────────────
  if (phase === 'confirming' && qrCode) {
    const codeComplete = digits.join('').length === CODE_LENGTH

    return (
      <FullScreenCard wide>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
            Scan with your authenticator app
          </div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.6 }}>
            Open Google Authenticator, Authy, 1Password, or any TOTP app and scan the QR code below.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 24 }}>
          {/* QR code */}
          <div style={{
            border: '0.5px solid var(--lp-border)', borderRadius: 10,
            padding: 10, background: '#fff', flexShrink: 0
          }}>
            <img src={qrCode} alt="MFA QR code" style={{ width: 160, height: 160, display: 'block' }} />
          </div>

          {/* Manual secret + instructions */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginBottom: 6 }}>
              Can't scan? Enter this key manually:
            </div>
            <div style={{
              fontFamily: 'monospace', fontSize: 11.5, letterSpacing: '0.1em',
              background: 'var(--lp-bg)', border: '0.5px solid var(--lp-border)',
              borderRadius: 6, padding: '6px 10px', wordBreak: 'break-all',
              color: 'var(--lp-text)', marginBottom: 16
            }}>
              {secret}
            </div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', lineHeight: 1.6 }}>
              After scanning, enter the 6-digit code shown in your app to confirm enrollment.
            </div>
          </div>
        </div>

        {/* 6-digit input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginBottom: 10 }}>
            Confirmation code from your authenticator
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleDigitChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                autoFocus={i === 0}
                style={{
                  width: 42, height: 48, textAlign: 'center', fontSize: 18,
                  fontFamily: 'monospace', fontWeight: 600,
                  border: `1.5px solid ${digit ? 'var(--lp-accent)' : 'var(--lp-border)'}`,
                  borderRadius: 8, background: 'var(--lp-surface)',
                  color: 'var(--lp-text)', outline: 'none',
                  transition: 'border-color 0.15s'
                }}
              />
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)',
            fontSize: 12.5, color: 'var(--sem-red)', marginBottom: 14
          }}>
            {error}
          </div>
        )}

        <button
          className="lp-btn lp-btn-primary"
          disabled={!codeComplete}
          style={{ justifyContent: 'center', padding: '10px 0', width: '100%' }}
          onClick={handleConfirm}
        >
          Activate two-factor authentication
        </button>
      </FullScreenCard>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <FullScreenCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
          <div style={{ fontSize: 14, color: 'var(--sem-red)', marginBottom: 16 }}>
            {error ?? 'Something went wrong'}
          </div>
          <button className="lp-btn lp-btn-ghost"
            style={{ justifyContent: 'center', width: '100%' }}
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </FullScreenCard>
    )
  }

  // ── Intro screen ───────────────────────────────────────────────────────────
  return (
    <FullScreenCard>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 10 }}>
          Two-factor authentication required
        </div>
        <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.7 }}>
          Your role requires two-factor authentication to access LedgiProof.
          This protects your clients' financial data and satisfies audit standards.
        </div>
      </div>

      {/* What you'll need */}
      <div style={{
        background: 'var(--lp-bg)', border: '0.5px solid var(--lp-border)',
        borderRadius: 10, padding: '14px 16px', marginBottom: 24
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--lp-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          You'll need
        </div>
        {[
          ['📱', 'A smartphone or tablet'],
          ['🔑', 'A TOTP authenticator app: Google Authenticator, Authy, or 1Password'],
        ].map(([icon, text]) => (
          <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 13, color: 'var(--lp-text)', lineHeight: 1.5 }}>{text}</span>
          </div>
        ))}
      </div>

      <button
        className="lp-btn lp-btn-primary"
        style={{ justifyContent: 'center', padding: '10px 0', width: '100%', marginBottom: 12 }}
        onClick={startEnrollment}
      >
        Set up authenticator app
      </button>

      <button
        onClick={handleSignOut}
        disabled={signingOut}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--lp-text-muted)', fontSize: 13, fontFamily: 'inherit',
          width: '100%', textAlign: 'center', padding: '6px 0'
        }}
      >
        {signingOut ? 'Signing out…' : 'Sign out instead'}
      </button>
    </FullScreenCard>
  )
}

// ── Layout helper ─────────────────────────────────────────────────────────────

function FullScreenCard({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div style={{
      height: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--lp-bg)', padding: '0 16px'
    }}>
      <div style={{ width: '100%', maxWidth: wide ? 520 : 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <LogoBrand variant="full" />
        </div>
        <div style={{
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border)',
          borderRadius: 14, padding: '28px 24px'
        }}>
          {children}
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
