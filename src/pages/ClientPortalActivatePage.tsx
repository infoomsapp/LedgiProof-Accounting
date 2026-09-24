// PATH: src/pages/ClientPortalActivatePage.tsx
//
// Dedicated activation page for a client invited to a firm's portal.
// URL: /client-portal-activate/:token
//
// User's own words for why this exists: accepting an invitation should let
// you set your password right there, not bounce you through a separate
// generic login/signup page and back. Mirrors StaffActivatePage.tsx's
// already-proven pattern for the internal-team-invite flow -- one page,
// email pre-filled and read-only, name + password, done.
//
// Flow:
//   1. Load invitation metadata by token (org name, client name, role, email)
//   2. Client sets their display name + password
//   3. signUp() creates the account scoped to this client (is_client_portal_invite
//      flag skips the normal org/subscription bootstrap -- see auth.store.ts)
//   4. Auto-confirmed  -> straight to /accept-client-portal/:token, which
//      runs the real accept_client_portal_invitation() RPC now that a
//      session exists.
//      Needs email confirmation -> /login?client_invite=:token, which
//      resumes the same accept step once they actually sign in.
//   5. "Already have an account?" link covers the common real case (a
//      re-invite, or simply an email that already has an account) --
//      confirmed live this session: an invited email can already exist,
//      and Supabase's signUp() otherwise fails outright on the duplicate.

import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { db } from '../lib/supabase'
import LogoBrand from '../components/ui/LogoBrand'
import PrivacyConsentCheckbox from '../components/consent/PrivacyConsentCheckbox'

interface InviteMeta {
  email:      string
  role:       'client_owner' | 'client_contact' | 'client_viewer'
  orgName:    string
  clientName: string
  status:     'pending' | 'accepted' | 'expired' | 'revoked'
  expiresAt:  string
}

const ROLE_LABEL: Record<InviteMeta['role'], string> = {
  client_owner:   'Owner',
  client_contact: 'Contact',
  client_viewer:  'Viewer',
}

function getStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', color: 'transparent' }
  let score = 0
  if (pw.length >= 8)          score++
  if (pw.length >= 12)         score++
  if (/[A-Z]/.test(pw))        score++
  if (/[0-9]/.test(pw))        score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak',   color: 'var(--sem-red)' }
  if (score <= 2) return { score, label: 'Fair',   color: 'var(--sem-amber)' }
  if (score <= 3) return { score, label: 'Good',   color: 'var(--lp-accent)' }
  return              { score, label: 'Strong', color: 'var(--sem-green)' }
}

export default function ClientPortalActivatePage() {
  const { token } = useParams<{ token: string }>()
  const navigate  = useNavigate()
  const { signUp, loading, error, clearError, session } = useAuthStore()

  // Already logged in (direct link while a session exists) -- send them
  // straight through the real accept step instead of showing a password form.
  useEffect(() => {
    if (session && token) {
      navigate(`/accept-client-portal/${token}`, { replace: true })
    }
  }, [session, token, navigate])

  const [meta,        setMeta]        = useState<InviteMeta | null>(null)
  const [metaError,   setMetaError]   = useState('')
  const [metaLoading, setMetaLoading] = useState(true)

  useEffect(() => {
    if (!token) { setMetaError('Invalid invitation link.'); setMetaLoading(false); return }

    db.rpc('get_client_portal_invitation_preview', { p_token: token })
      .then(({ data, error: err }) => {
        setMetaLoading(false)
        if (err || !data) { setMetaError('Invitation not found or already unavailable.'); return }
        const inv = data as {
          status: InviteMeta['status']; expires_at: string; email: string
          role: InviteMeta['role']; client_name: string | null; org_name: string | null
        }
        setMeta({
          email:      inv.email,
          role:       inv.role,
          orgName:    inv.org_name ?? 'this workspace',
          clientName: inv.client_name ?? 'this client account',
          status:     inv.status,
          expiresAt:  inv.expires_at,
        })
        if (inv.status !== 'pending') {
          setMetaError(`This invitation has already been ${inv.status}.`)
        } else if (new Date(inv.expires_at) < new Date()) {
          setMetaError('This invitation has expired. Ask your accountant to send a new one.')
        }
      })
  }, [token])

  const [displayName, setDisplayName] = useState('')
  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [consent,     setConsent]     = useState(false)

  const strength  = getStrength(password)
  const pwMatch   = password === confirm
  const canSubmit =
    displayName.trim().length >= 2 &&
    password.length >= 8 &&
    pwMatch &&
    consent &&
    !loading

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    clearError()
    if (!canSubmit || !meta || !token) return

    const result = await signUp(
      meta.email,
      password,
      displayName.trim(),
      {
        accountType:       'pyme_client',
        plan:              'starter',
        clientInviteToken: token,
      }
    )

    if (result?.needsConfirmation) {
      window.location.href = `/login?client_invite=${token}`
      return
    }

    // Auto-confirmed -- a real session now exists, run the actual accept step.
    window.location.href = `/accept-client-portal/${token}`
  }

  if (metaLoading) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spinner />
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 12 }}>
            Loading invitation…
          </div>
        </div>
      </PageShell>
    )
  }

  if (metaError) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 8 }}>
            Invitation invalid
          </div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
            {metaError}
          </div>
          <button
            onClick={() => navigate('/login')}
            className="lp-btn lp-btn-ghost"
            style={{ justifyContent: 'center', width: '100%' }}
          >
            Go to sign in
          </button>
        </div>
      </PageShell>
    )
  }

  if (!meta) return null

  return (
    <PageShell>
      <div style={{
        background:   'var(--chat-bubble-mine-bg)',
        border:       '0.5px solid var(--sem-blue-border)',
        borderRadius: 10,
        padding:      '12px 16px',
        marginBottom: 18,
        display:      'flex',
        alignItems:   'center',
        gap:          12,
      }}>
        <span style={{ fontSize: 22 }}>🔑</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 2 }}>
            You've been invited to
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--lp-accent)' }}>
            {meta.clientName}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
            by {meta.orgName} · <strong style={{ color: 'var(--lp-text)' }}>{ROLE_LABEL[meta.role]}</strong>
          </div>
        </div>
      </div>

      <div style={{
        background:   'var(--lp-surface)',
        border:       '0.5px solid var(--lp-border)',
        borderRadius: 14,
        padding:      '24px 22px',
      }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)' }}>
            Set up your portal access
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 4 }}>
            Set your name and a password to get started.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {error && (
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)',
                fontSize: 12.5, color: 'var(--sem-red)'
              }}>
                {error}
              </div>
            )}

            <Field label="Email address">
              <input
                type="email"
                className="lp-input"
                value={meta.email}
                readOnly
                style={{ color: 'var(--lp-text-muted)', cursor: 'default' }}
              />
              <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 3 }}>
                This is the email the invitation was sent to.
              </div>
            </Field>

            <Field label="Your full name">
              <input
                type="text"
                className="lp-input"
                placeholder="Jane Smith"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                autoFocus
                minLength={2}
              />
            </Field>

            <Field label="Password">
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  className="lp-input"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--lp-text-muted)', fontSize: 12, padding: 4
                  }}
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
              {password.length > 0 && (
                <div style={{ marginTop: 5 }}>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
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
            </Field>

            <Field label="Confirm password">
              <input
                type={showPw ? 'text' : 'password'}
                className="lp-input"
                placeholder="Repeat your password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                style={{
                  borderColor: confirm.length > 0
                    ? pwMatch ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'
                    : undefined
                }}
              />
              {confirm.length > 0 && !pwMatch && (
                <div style={{ fontSize: 11.5, color: 'var(--sem-red)', marginTop: 4 }}>
                  Passwords don't match
                </div>
              )}
            </Field>

            <PrivacyConsentCheckbox
              checked={consent}
              onChange={setConsent}
              disabled={loading}
            />

            <button
              type="submit"
              className="lp-btn lp-btn-primary"
              disabled={!canSubmit}
              style={{ justifyContent: 'center', padding: '10px 0', marginTop: 4 }}
            >
              {loading ? <SpinnerRow label="Setting up your access…" /> : 'Set password & continue →'}
            </button>
          </div>
        </form>
      </div>

      <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 16 }}>
        Already have an account?{' '}
        <button
          onClick={() => navigate(`/login?client_invite=${token}&email=${encodeURIComponent(meta.email)}`)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--lp-accent)', fontSize: 13, fontWeight: 500, padding: 0
          }}
        >
          Sign in to join
        </button>
      </p>
    </PageShell>
  )
}

// ── Layout helpers (mirrors StaffActivatePage.tsx's own, kept local since
// these are small and each page owns its exact copy/spacing) ──────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--lp-bg)',
      overflowY: 'auto', padding: '20px 16px'
    }}>
      <div className="titlebar-drag" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32 }} />
      <div style={{ width: 400, margin: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <LogoBrand variant="full" />
        </div>
        {children}
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 16 }}>
          LedgiProof v{import.meta.env.VITE_APP_VERSION ?? '0.1.0'} · Olympus Mont Systems LLC
        </p>
      </div>
      <style>{`@keyframes lp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <span style={{
      width: 20, height: 20, display: 'inline-block',
      border: '2px solid rgba(59,130,246,0.2)',
      borderTopColor: '#3b82f6', borderRadius: '50%',
      animation: 'lp-spin 0.7s linear infinite'
    }} />
  )
}

function SpinnerRow({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 13, height: 13,
        border: '1.5px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff', borderRadius: '50%',
        animation: 'lp-spin 0.6s linear infinite', display: 'inline-block'
      }} />
      {label}
    </span>
  )
}
