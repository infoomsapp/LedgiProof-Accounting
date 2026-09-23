// PATH: src/components/ui/GoogleSignInButton.tsx
// "Continue with Google" button for Login/SignUp. Wired to
// auth.store's signInWithGoogle (a redirect flow) -- if Google OAuth
// hasn't been enabled in this Supabase project's Auth settings yet,
// the store surfaces that as a normal `error` string, same as any
// other sign-in failure.

import { useAuthStore } from '../../store/auth.store'

interface Props {
  label?: string
  disabled?: boolean
}

export default function GoogleSignInButton({ label = 'Continue with Google', disabled }: Props) {
  const { signInWithGoogle, loading } = useAuthStore()

  return (
    <button
      type="button"
      onClick={signInWithGoogle}
      disabled={disabled || loading}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '10px 0',
        borderRadius: 9,
        border: '1px solid var(--lp-border-2)',
        background: 'var(--lp-surface)',
        color: 'var(--lp-text)',
        fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500,
        cursor: disabled || loading ? 'default' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        transition: 'background 0.15s, border-color 0.15s'
      }}
      onMouseEnter={e => { if (!disabled && !loading) e.currentTarget.style.borderColor = 'var(--lp-text-muted)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--lp-border-2)' }}
    >
      <GoogleIcon />
      {label}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  )
}

export function AuthDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--lp-border)' }} />
      <span style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
      <div style={{ flex: 1, height: 1, background: 'var(--lp-border)' }} />
    </div>
  )
}
