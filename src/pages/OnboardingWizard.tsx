// PATH: src/pages/OnboardingWizard.tsx
// Shown to users who have no organization yet.
//
// CSS-TODO (file-level): this wizard uses semantic alpha variations for
// step-state visuals (idle 0.05 / active 0.15-0.18 / done 0.4-0.5) and
// gradient banners that have no var() counterpart yet. These remain
// hardcoded until we add step-state vars to globals.css (e.g.
// --step-active-bg, --step-done-border, --hero-gradient-from/to).
// Direct mappings (#e2e8f0, #3b82f6, #22c55e, etc) have been migrated.
//
// Branched by account_type:
//   - self_employed → 3 steps (Welcome / Workspace simple / Done)
//                     "Workspace name" auto-suggests "{Name}'s Business"
//                     Plan info: "You're on Starter (free)"
//
//   - bookkeeper    → 3 steps (Welcome / Firm setup / Done)
//                     Trial chip "14-day Pro trial"
//                     Currency + fiscal year fully customizable
//
//   - pyme_client   → does NOT reach this screen
//                     (handled via accept_client_invitation → /client portal)

import { useEffect, useState, type FormEvent } from 'react'
import { useAuthStore } from '../store/auth.store'
import { useOrgStore }  from '../store/org.store'
import { db }           from '../lib/supabase'
import LogoBrand        from '../components/ui/LogoBrand'
import LpUserBadge      from '../components/ui/LpUserBadge'
import type { AccountType } from '../types/database.types'
import { toSafeMessage } from '../lib/errors'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'ARS', 'COP']
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

// ── Step indicator (preserved from original) ────────────────────────────────
function Steps({ current }: { current: number }) {
  const steps = ['Welcome', 'Workspace', 'Ready']
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 28 }}>
      {steps.map((label, i) => {
        const done   = i < current
        const active = i === current
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: done ? 13 : 12, fontWeight: 600,
                background: done   ? 'rgba(34,197,94,0.15)'
                          : active ? 'rgba(59,130,246,0.15)'
                          :          'rgba(255,255,255,0.05)',
                border: `1.5px solid ${
                  done   ? 'rgba(34,197,94,0.5)'
                : active ? 'rgba(59,130,246,0.5)'
                :          'rgba(255,255,255,0.1)'
                }`,
                color: done ? 'var(--sem-green)' : active ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
                transition: 'all 0.25s'
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{
                fontSize: 10.5, color: active ? 'var(--lp-text)' : 'var(--lp-text-muted)',
                fontWeight: active ? 500 : 400, transition: 'color 0.25s'
              }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 48, height: 1.5, marginBottom: 18, marginLeft: 4, marginRight: 4,
                background: done ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.07)',
                transition: 'background 0.3s'
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function OnboardingWizard() {
  const { profile }  = useAuthStore()
  const { loadOrgs } = useOrgStore()

  const accountType: AccountType =
    (profile?.account_type as AccountType) ?? 'self_employed'
  // Accountant firms go through the same "Firm setup" flow as bookkeeper
  // firms (firm name / currency / fiscal year) — the copy below already
  // reads generically ("Firm name", "set up your firm"), so no separate
  // branch is needed. Only self_employed/pyme_client get the simpler flow.
  const isBookkeeper = accountType === 'bookkeeper' || accountType === 'accountant'

  const [step,     setStep]     = useState(0)
  const [orgName,  setOrgName]  = useState('')
  const [currency, setCurrency] = useState('USD')
  const [fyMonth,  setFyMonth]  = useState(1)   // January default
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [seedWarning, setSeedWarning] = useState<string | null>(null)

  // Pre-fill workspace name from display_name based on account type
  useEffect(() => {
    if (profile?.display_name && !orgName) {
      const firstName = profile.display_name.split(' ')[0]
      setOrgName(
        isBookkeeper
          ? `${firstName}'s Bookkeeping`
          : `${firstName}'s Business`
      )
    }
  }, [profile?.display_name, isBookkeeper, orgName])

  // ── Step 2: create org + membership ──────────────────────────────────────
  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!profile?.id || !orgName.trim()) return
    setCreating(true)
    setError(null)

    // 1. Create organization
    const slug = orgName.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).slice(2, 6)

    const { data: org, error: orgErr } = await db
      .from('organizations')
      .insert({
        name:              orgName.trim(),
        slug,
        currency,
        fiscal_year_start: fyMonth,
        is_active:         true
      })
      .select()
      .single()

    if (orgErr || !org) {
      setError(toSafeMessage(orgErr, 'Could not create workspace'))
      setCreating(false)
      return
    }

    // 2. Create membership (owner)
    const { error: memErr } = await db
      .from('organization_memberships')
      .insert({
        org_id:    org.id,
        user_id:   profile.id,
        role:      'owner',
        is_active: true
      })

    if (memErr) {
      setError(toSafeMessage(memErr, 'Could not set up your membership'))
      setCreating(false)
      return
    }

    setCreating(false)
    setStep(2)

    // Auto-seed chart of accounts + reload orgs in background.
    // The org/membership are already created at this point (the part that
    // matters most), but if seeding silently fails the user lands on a
    // workspace with zero accounts to categorize transactions against and
    // no explanation why — surface it instead of swallowing the error.
    const [seedResult] = await Promise.all([
      db.rpc('seed_chart_of_accounts', { p_org_id: org.id, p_user_id: profile.id }),
      loadOrgs(profile.id)
    ])
    if (seedResult.error) {
      console.error('[OnboardingWizard] seed_chart_of_accounts failed:', seedResult.error)
      setSeedWarning(
        'Your workspace was created, but we could not set up your default chart ' +
        'of accounts automatically. You can import or create accounts from Settings.'
      )
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--lp-bg)',
      padding: '20px 16px', overflowY: 'auto'
    }}>

      <div style={{ width: 420, margin: 'auto' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <LogoBrand variant="full" />
        </div>

        {/* Steps */}
        <Steps current={step} />

        {/* ═══ STEP 0 — Welcome ═══════════════════════════════════════════ */}
        {step === 0 && (
          <div style={{
            background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
            borderRadius: 14, padding: '28px 24px', textAlign: 'center'
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>
              {isBookkeeper ? '💼' : '👋'}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--lp-text)', marginBottom: 6 }}>
              Welcome to LedgiProof
            </div>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
              Your account is ready.{' '}
              {profile?.display_name
                ? <><strong style={{ color: 'var(--lp-text)' }}>{profile.display_name}</strong>, let's</>
                : "Let's"
              }{' '}
              {isBookkeeper ? 'set up your firm' : 'set up your business'}.
            </div>

            {/* Plan badge for bookkeeper trial */}
            {isBookkeeper && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 100,
                background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(6,182,212,0.10))',
                border: '0.5px solid rgba(59,130,246,0.3)',
                fontSize: 12, color: '#93c5fd', fontWeight: 500,
                marginBottom: 22
              }}>
                🎁 14-day Pro trial · No credit card required
              </div>
            )}

            {!isBookkeeper && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 100,
                background: 'rgba(100,116,139,0.10)',
                border: '0.5px solid rgba(100,116,139,0.25)',
                fontSize: 12, color: 'var(--lp-text-muted)', fontWeight: 500,
                marginBottom: 22
              }}>
                ⭐ Starter plan · Free forever
              </div>
            )}

            {/* LP identity card (preserved from original) */}
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: 'rgba(59,130,246,0.06)',
              border: '0.5px solid rgba(59,130,246,0.18)',
              marginBottom: 24, textAlign: 'left'
            }}>
              <div style={{
                fontSize: 10.5, color: 'var(--lp-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8
              }}>
                Your LP Identity
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: 'var(--lp-accent)', flexShrink: 0
                }}>
                  {(profile?.display_name ?? profile?.email ?? '?')[0]?.toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--lp-text)', marginBottom: 4 }}>
                    {profile?.display_name ?? profile?.email}
                  </div>
                  <LpUserBadge
                    code={profile?.lp_user_code ?? 'LP-PENDING'}
                    tier={profile?.tier ?? 'user'}
                    size="sm"
                    showTier
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(1)}
              className="lp-btn lp-btn-primary"
              style={{ justifyContent: 'center', width: '100%', padding: '11px 0', fontSize: 14 }}
            >
              {isBookkeeper ? 'Set up my firm →' : 'Set up my workspace →'}
            </button>
          </div>
        )}

        {/* ═══ STEP 1 — Create workspace ══════════════════════════════════ */}
        {step === 1 && (
          <div style={{
            background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
            borderRadius: 14, padding: '28px 24px'
          }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)' }}>
                {isBookkeeper ? 'Create your firm' : 'Create your workspace'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginTop: 4 }}>
                {isBookkeeper
                  ? "This is the workspace your team and clients will see. You can invite team and clients later."
                  : "This is your business inside LedgiProof. You can connect a bank and upload receipts later."}
              </div>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {error && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--sem-red-bg)',
                    border: '0.5px solid rgba(239,68,68,0.3)',
                    fontSize: 12.5, color: 'var(--sem-red)'
                  }}>
                    {error}
                  </div>
                )}

                {/* Org name */}
                <div>
                  <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 6 }}>
                    {isBookkeeper ? 'Firm name' : 'Business name'}
                  </label>
                  <input
                    type="text"
                    className="lp-input"
                    placeholder={isBookkeeper
                      ? 'e.g. Smith Bookkeeping LLC'
                      : 'e.g. Jane Smith Freelance'}
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    required
                    autoFocus
                    minLength={2}
                  />
                  <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 4 }}>
                    {isBookkeeper
                      ? "Usually your firm's legal or trade name."
                      : 'You can change this anytime from Settings.'}
                  </div>
                </div>

                {/* Currency + fiscal year — side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 6 }}>
                      Currency
                    </label>
                    <select
                      className="lp-input"
                      value={currency}
                      onChange={e => setCurrency(e.target.value)}
                    >
                      {CURRENCIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 6 }}>
                      Fiscal year starts
                    </label>
                    <select
                      className="lp-input"
                      value={fyMonth}
                      onChange={e => setFyMonth(Number(e.target.value))}
                    >
                      {MONTHS.map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Self-employed tip about fiscal year */}
                {!isBookkeeper && fyMonth !== 1 && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(245,158,11,0.07)',
                    border: '0.5px solid rgba(245,158,11,0.20)',
                    fontSize: 11.5, color: '#fbbf24', lineHeight: 1.5
                  }}>
                    💡 Most US self-employed individuals use January (calendar year) for their Schedule C filing.
                  </div>
                )}

                {/* Preview */}
                {orgName.trim().length >= 2 && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 9,
                    background: 'var(--sem-green-bg)',
                    border: '0.5px solid rgba(34,197,94,0.2)',
                    fontSize: 12.5, color: 'var(--lp-text-muted)', lineHeight: 1.6
                  }}>
                    <strong style={{ color: 'var(--lp-text)' }}>{orgName.trim()}</strong> · {currency} · FY starts {MONTHS[fyMonth - 1]}
                    <br />
                    <span style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                      You will be assigned the <strong style={{ color: 'var(--lp-text)' }}>Owner</strong> role.
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="lp-btn lp-btn-ghost"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    className="lp-btn lp-btn-primary"
                    disabled={creating || orgName.trim().length < 2}
                    style={{ flex: 2, justifyContent: 'center' }}
                  >
                    {creating ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 13, height: 13,
                          border: '1.5px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff', borderRadius: '50%',
                          animation: 'lp-spin 0.6s linear infinite', display: 'inline-block'
                        }} />
                        Creating…
                      </span>
                    ) : isBookkeeper ? 'Create my firm →' : 'Create workspace →'}
                  </button>
                </div>

              </div>
            </form>
          </div>
        )}

        {/* ═══ STEP 2 — Done ══════════════════════════════════════════════ */}
        {step === 2 && (
          <div style={{
            background: 'var(--lp-surface)', border: '0.5px solid rgba(34,197,94,0.25)',
            borderRadius: 14, padding: '36px 24px', textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--lp-text)', marginBottom: 8 }}>
              {isBookkeeper ? 'Your firm is ready!' : 'Workspace ready!'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', lineHeight: 1.7, marginBottom: 24 }}>
              <strong style={{ color: 'var(--lp-text)' }}>{orgName}</strong> has been created.<br />
              You're the <strong style={{ color: 'var(--sem-green)' }}>Owner</strong>
              {isBookkeeper
                ? " — invite team members and clients from Settings."
                : " — connect a bank and upload receipts to get started."}
            </div>

            {seedWarning && (
              <div className="lp-banner warning" style={{ marginBottom: 22, textAlign: 'left' }}>
                <span style={{ fontSize: 12.5 }}>⚠ {seedWarning}</span>
              </div>
            )}

            {/* Trial reminder for bookkeepers */}
            {isBookkeeper && (
              <div style={{
                padding: '10px 14px', borderRadius: 9,
                background: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(6,182,212,0.08))',
                border: '0.5px solid rgba(59,130,246,0.3)',
                marginBottom: 22, fontSize: 12, color: '#93c5fd', lineHeight: 1.6
              }}>
                🎁 You have <strong style={{ color: 'var(--lp-text)' }}>14 days</strong> of free Pro access.
                You'll see your trial countdown at the top of the app.
              </div>
            )}

            {/* Summary chips */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 8,
              marginBottom: 28, flexWrap: 'wrap'
            }}>
              {[
                { icon: '🏢', label: orgName },
                { icon: '💵', label: currency },
                { icon: '📅', label: `FY: ${MONTHS[fyMonth - 1]}` }
              ].map(({ icon, label }) => (
                <span key={label} style={{
                  padding: '4px 12px', borderRadius: 100, fontSize: 12,
                  background: 'rgba(255,255,255,0.05)',
                  border: '0.5px solid var(--lp-border)', color: 'var(--lp-text-muted)'
                }}>
                  {icon} {label}
                </span>
              ))}
            </div>

            <button
              onClick={() => window.location.reload()}
              className="lp-btn lp-btn-primary"
              style={{ justifyContent: 'center', width: '100%', padding: '12px 0', fontSize: 14 }}
            >
              Enter LedgiProof →
            </button>
          </div>
        )}

      </div>
      <style>{`@keyframes lp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
