// PATH: src/pages/SignUp.tsx
// One screen, three fields (name, email, password) or Google -- nothing to
// decide before you're in. "Who do you keep the books for?", the business
// name and the industry are asked once, right after, by AccountSetup.
//   · /signup?plan=entrepreneur&type=self_employed (Pricing page) still
//     works: both travel as signup metadata and pre-fill AccountSetup.
//   · Invites (staff or client portal) keep their fixed account type and
//     skip AccountSetup entirely.
//   · Terms/Privacy are accepted by creating the account (the line under the
//     button); consent is recorded in AccountSetup, or here for invitees.

import { useEffect, useState, type FormEvent } from 'react'
import { useAuthStore } from '../store/auth.store'
import LogoBrand from '../components/ui/LogoBrand'
import BackToSiteLink from '../components/ui/BackToSiteLink'
import GoogleSignInButton, { AuthDivider } from '../components/ui/GoogleSignInButton'
import TermsNotice from '../components/consent/TermsNotice'
import { IconUser, IconBriefcase, IconCalculator } from '../components/ui/AccountTypeIcons'
import { recordSignupConsents } from '../services/consent.service'
import type { AccountType, SubscriptionPlan } from '../types/database.types'
import { PLAN_CATALOG, priceLabel, trialLabel } from '../lib/plans'

interface SignUpProps {
  onGoToLogin:        () => void
  inviteToken?:       string
  clientInviteToken?: string
}

// ── Password strength ───────────────────────────────────────────────────────

function getStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '',       color: 'transparent' }
  let score = 0
  if (pw.length >= 8)            score++
  if (pw.length >= 12)           score++
  if (/[A-Z]/.test(pw))          score++
  if (/[0-9]/.test(pw))          score++
  if (/[^A-Za-z0-9]/.test(pw))   score++
  if (score <= 1) return { score, label: 'Weak',   color: 'var(--sem-red)' }
  if (score <= 2) return { score, label: 'Fair',   color: 'var(--sem-amber)' }
  if (score <= 3) return { score, label: 'Good',   color: 'var(--lp-accent)' }
  return              { score, label: 'Strong', color: 'var(--sem-green)' }
}

const PLAN_LABEL = (plan: SubscriptionPlan): string => {
  const trial = trialLabel(plan)
  return PLAN_CATALOG[plan].price == null
    ? PLAN_CATALOG[plan].name
    : `${PLAN_CATALOG[plan].name} (${priceLabel(plan)}/mo${trial ? ` · ${trial}` : ''})`
}

const TYPE_LABEL: Record<AccountType, string> = {
  self_employed: 'Self-employed account',
  bookkeeper:    'Bookkeeper account',
  accountant:    'Accountant / CPA firm account',
  pyme_client:   'Client account'
}

export default function SignUp({
  onGoToLogin, inviteToken, clientInviteToken
}: SignUpProps) {
  const { signUp, loading, error, clearError, user } = useAuthStore()

  const urlParams = new URLSearchParams(window.location.search)
  const planFromUrl = urlParams.get('plan') as SubscriptionPlan | null
  const typeFromUrl = urlParams.get('type') as AccountType | null

  const isInvite = !!(inviteToken || clientInviteToken)
  const initialType: AccountType | null =
    isInvite      ? 'pyme_client' :
    typeFromUrl   ? typeFromUrl   :
    null

  const accountType: AccountType | null = initialType
  const plan: SubscriptionPlan | null = planFromUrl

  const [displayName, setDisplayName] = useState('')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [done,        setDone]        = useState(false)
  const [redirectTo,  setRedirectTo]  = useState<string | null>(null)

  const strength = getStrength(password)
  const canSubmit =
    displayName.trim().length >= 2 &&
    email.includes('@') &&
    password.length >= 8 &&
    !loading

  // ── Handle submit ──────────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    clearError()
    if (!canSubmit) return

    const result = await signUp(
      email.trim().toLowerCase(),
      password,
      displayName.trim(),
      {
        ...(accountType ? { accountType } : {}),
        ...(plan ? { plan } : {}),
        ...(inviteToken ? { inviteToken } : {}),
        ...(clientInviteToken ? { clientInviteToken } : {})
      }
    )

    // Real bug fixed 2026-09-24: needsConfirmation used to be checked AFTER
    // already queuing a timed redirect to /accept-client-portal (or
    // /accept-invite) via the effect below. Both fired regardless of each
    // other: the "check your email" screen would show for ~800ms and then
    // silently get yanked to the accept page with NO session yet (email
    // unconfirmed), which just bounced the invitee right back to signup --
    // a real dead end that looked like the invite link itself was broken.
    // Confirmation-required now short-circuits straight to /login with the
    // token preserved as a query param (not React state, which a fresh tab
    // from the confirmation email would lose) -- Login.tsx already redirects
    // to the right accept-* route once sign-in actually succeeds, which
    // Supabase won't allow until the email is confirmed anyway.
    if (result?.needsConfirmation) {
      if (clientInviteToken) {
        window.location.href = `/login?client_invite=${clientInviteToken}`
      } else if (inviteToken) {
        window.location.href = `/login?invite=${inviteToken}`
      } else {
        setDone(true)
      }
      return
    }

    if (clientInviteToken) {
      setRedirectTo(`/accept-client-portal/${clientInviteToken}`)
    } else if (inviteToken) {
      setRedirectTo(`/accept-invite/${inviteToken}`)
    }
  }

  // Invitees never see AccountSetup (where everyone else's consent is
  // recorded), so record theirs here once the auto-confirmed session exists.
  useEffect(() => {
    if (user?.id && isInvite) {
      // Fire-and-forget: don't block UX if it fails
      recordSignupConsents(user.id).catch(() => {/* silent */})
    }
  }, [user?.id, isInvite])

  useEffect(() => {
    if (redirectTo && !loading) {
      const t = setTimeout(() => { window.location.href = redirectTo }, 800)
      return () => clearTimeout(t)
    }
  }, [redirectTo, loading])

  if (done) return <ConfirmationSentScreen email={email} onBack={onGoToLogin} />

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--lp-bg)',
      overflowY: 'auto', padding: '20px 16px'
    }}>

      <BackToSiteLink />

      <div style={{ width: 380, margin: 'auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <LogoBrand variant="full" />
        </div>

        {(plan || isInvite) && (
          <div style={{
            background: 'var(--chat-bubble-mine-bg)',
            // CSS-TODO: rgba(59,130,246,0.25) — accent border, no var() yet
            border: '0.5px solid rgba(59,130,246,0.25)',
            borderRadius: 11,
            padding: '11px 14px',
            marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <span style={{ color: 'var(--lp-accent)', display: 'inline-flex', flexShrink: 0 }}>
              {isInvite ? <IconMail /> : accountType === 'bookkeeper' ? <IconBriefcase /> : accountType === 'accountant' ? <IconCalculator /> : <IconUser />}
            </span>
            <div style={{ flex: 1, fontSize: 12,
              // CSS-TODO: #93c5fd — blue-300 secondary text, no var() yet
              color: '#93c5fd',
              lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, color: 'var(--lp-text)' }}>
                {isInvite ? 'You were invited to join'
                  : accountType ? TYPE_LABEL[accountType] : 'Your plan'}
              </div>
              {plan && !isInvite && (
                <div>Starting plan: <strong>{PLAN_LABEL(plan)}</strong></div>
              )}
            </div>
          </div>
        )}

        <div style={{
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border)',
          borderRadius: 14,
          padding: '24px 22px'
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)' }}>
              Create your account
            </div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 4 }}>
              Every plan starts with a free trial. No credit card required.
            </div>
          </div>

          {/* Invites are tied to the invited email address, so they sign up
              with a password; everyone else can use Google in one click. */}
          {!isInvite && (
            <>
              <GoogleSignInButton label="Sign up with Google" />
              <AuthDivider />
            </>
          )}

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

              <FormField label={accountType === 'bookkeeper' ? 'Your name' : 'Full name'}>
                <input
                  type="text"
                  className="lp-input"
                  placeholder="Jane Smith"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  required autoFocus minLength={2}
                />
              </FormField>

              <FormField label="Email address">
                <input
                  type="email"
                  className="lp-input"
                  placeholder={accountType === 'bookkeeper' ? 'you@firm.com' : 'you@email.com'}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </FormField>

              <FormField label="Password">
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="lp-input"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required minLength={8}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(p => !p)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute', right: 10, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--lp-text-muted)', padding: 4,
                      display: 'flex', alignItems: 'center'
                    }}
                  >
                    {showPw ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>

                {password.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 3, borderRadius: 2,
                      // CSS-TODO: rgba(255,255,255,0.07) — dark-mode track overlay, no var() yet
                      background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${(strength.score / 5) * 100}%`,
                        background: strength.color,
                        transition: 'width 0.3s, background 0.3s'
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: strength.color, marginTop: 3 }}>
                      {strength.label}
                    </div>
                  </div>
                )}
              </FormField>

              <button
                type="submit"
                className="lp-btn lp-btn-primary"
                disabled={!canSubmit}
                style={{ justifyContent: 'center', padding: '10px 0', marginTop: 4 }}
              >
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Spinner /> Creating account…
                  </span>
                ) : 'Create account'}
              </button>

              <TermsNotice action="creating an account" />

            </div>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 16 }}>
          Already have an account?{' '}
          <button
            onClick={onGoToLogin}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--lp-accent)', fontSize: 13, fontWeight: 500, padding: 0
            }}
          >
            Sign in
          </button>
        </p>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 8 }}>
          LedgiProof v{import.meta.env.VITE_APP_VERSION ?? '0.1.0'} · Olympus Mont Systems LLC
        </p>
      </div>

      <style>{`@keyframes lp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        fontSize: 12, color: 'var(--lp-text-muted)',
        display: 'block', marginBottom: 6
      }}>{label}</label>
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <span style={{
      width: 13, height: 13,
      // CSS-TODO: rgba(255,255,255,0.3) — spinner track over colored button, no var() yet
      border: '1.5px solid rgba(255,255,255,0.3)',
      borderTopColor: '#fff', borderRadius: '50%',
      animation: 'lp-spin 0.6s linear infinite', display: 'inline-block'
    }} />
  )
}

// ── Hand-drawn icons — replace the old emoji set (👤💼🧮✉️👁), same
// monoline style as the landing page's icons.

function IconMail({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-3.3 4.2M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

// ── Sub-screen: Email confirmation sent ────────────────────────────────────

function ConfirmationSentScreen({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--lp-bg)'
    }}>

      <div style={{ width: 360, padding: '0 16px', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, margin: '0 auto 16px',
          background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
        }}>
          <IconMail size={26} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 10 }}>
          Check your email
        </div>
        <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.7, marginBottom: 24 }}>
          We sent a confirmation link to<br />
          <strong style={{ color: 'var(--lp-text)' }}>{email}</strong><br />
          Click the link to activate your account.
        </div>
        <button
          onClick={onBack}
          className="lp-btn lp-btn-ghost"
          style={{ justifyContent: 'center', width: '100%' }}
        >
          Back to Sign In
        </button>
      </div>
    </div>
  )
}
