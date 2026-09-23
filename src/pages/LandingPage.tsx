// PATH: src/pages/LandingPage.tsx
// Landing page — hero, animated semaphore preview, real feature set,
// how-it-works, trust section, CTA, footer.
//
// Redesign (explicit user request): removed all emoji-as-icon usage
// (the semaphore demo's 🔵🟢🟡🔴 and the value-prop cards' 🤖🔐💸) --
// replaced with hand-drawn SVG icons matching the brand's blue/cyan
// gradient mark, and CSS-only colored dots for the semaphore states.
// Every feature claimed on this page corresponds to a real hook/service
// in this codebase (see the comment above FEATURES below) -- no
// "bill pay automation" / "white-label" / "API access" style claims
// that don't exist yet (those were found on Pricing.tsx during this
// same pass and are being removed there too). No fake customer logos
// or testimonials -- the product hasn't launched, so there's nothing
// honest to show there yet; the trust section leans on the one real,
// concrete differentiator (hash-chained audit trail) instead.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logoSrc from '../assets/logo.png'
import '../styles/web.css'

const SEMAPHORE_DEMO = [
  { color: '#3b82f6', merchant: 'Adobe Creative Cloud', amount: 54.99,   label: 'Verified',     desc: 'Approved by your bookkeeper' },
  { color: '#22c55e', merchant: 'Uber',                 amount: 18.20,   label: 'Processed',    desc: 'Auto-categorized · 96% confidence' },
  { color: '#f59e0b', merchant: 'Amazon Marketplace',   amount: 142.30,  label: 'Needs review', desc: 'Business or personal?' },
  { color: '#ef4444', merchant: 'Wire transfer',        amount: 3200.00, label: 'Urgent',       desc: 'Unusual amount detected' }
]

function formatAmount(n: number): string {
  return `-$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Explicit user request: on page load, the demo amounts count up from 0 to
// their real value once, then stay static -- everything else about the
// demo card (the rotating highlight) keeps working exactly as before.
function useCountUp(targets: number[], durationMs = 900): number[] {
  const [values, setValues] = useState<number[]>(() => targets.map(() => 0))

  useEffect(() => {
    let raf = 0
    let cancelled = false
    const start = performance.now()

    function tick(now: number) {
      if (cancelled) return
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setValues(targets.map(v => v * eased))
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        setValues(targets) // land exactly on the real values, no float drift
      }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return values
}

// Every entry here maps to a real hook/service in this codebase --
// checked before writing this copy, not asserted: transactions.service.ts
// + useTransactions (classification), the semaphore_status enum (blue/
// green/amber/red) that drives every transaction's review state, tax1099
// .service.ts / tax-estimator.service.ts (Schedule C export), mileage
// .service.ts + useMileage, client-portal.service.ts (client portal), and
// the solo/bookkeeper/accountant dashboard split (usePymeDashboard,
// useSoloDashboard, etc.). The hash-chained audit trail is real too
// (audit.service.ts + useAuditEvents) -- it lives in the Trust section
// below instead of the feature grid, since "every edit is hash-chained"
// reads as more credible as a dedicated claim than as one card among six.
const FEATURES = [
  {
    icon: <IconBank />,
    title: 'Bank transactions, classified',
    desc: 'Import from your bank and every transaction gets auto-categorized, with a confidence score you can trust or override.'
  },
  {
    icon: <IconSemaphore />,
    title: 'A semaphore for every transaction',
    desc: 'Blue means verified, green means processed, amber means it needs your eyes, red means something looks off. One glance tells you what actually needs attention.'
  },
  {
    icon: <IconReceipt />,
    title: 'Schedule C & 1099 ready',
    desc: 'Auto-categorize deductible expenses and export your IRS Schedule C or 1099 worksheet in one click.'
  },
  {
    icon: <IconCar />,
    title: 'Mileage tracking',
    desc: 'Log business miles and convert them straight into a deduction on your return, no separate app to reconcile.'
  },
  {
    icon: <IconUsers />,
    title: 'Client portal',
    desc: 'Invite clients to view their own books, approve estimates, and upload documents without emailing PDFs back and forth.'
  },
  {
    icon: <IconLayout />,
    title: 'Built for how you work',
    desc: 'Solo, bookkeeper, or accounting firm — the dashboard and permissions adapt to the role, not the other way around.'
  }
]

const STEPS = [
  { n: '01', title: 'Connect', desc: 'Link your bank and import existing transactions in minutes.' },
  { n: '02', title: 'Classify', desc: 'Transactions get sorted and flagged; review what actually needs your eyes.' },
  { n: '03', title: 'Export', desc: 'Pull a Schedule C, share the audit trail, or hand it to your accountant.' }
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [activeIdx, setActiveIdx] = useState(0)
  const displayedAmounts = useCountUp(SEMAPHORE_DEMO.map(r => r.amount))

  useEffect(() => {
    const id = setInterval(() => setActiveIdx(i => (i + 1) % SEMAPHORE_DEMO.length), 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="lp-web-page">

      {/* ── Topbar ─────────────────────────────────────────────────── */}
      <header className="web-topbar">
        <Link to="/" className="web-topbar-logo">
          <img src={logoSrc} alt="" className="web-topbar-logo-mark" draggable={false} />
          <span>LedgiProof</span>
        </Link>
        <nav className="web-topbar-nav">
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Sign in</Link>
          <button className="web-btn web-btn-primary web-topbar-cta" onClick={() => navigate('/pricing')}>
            Get started →
          </button>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="web-hero">
        <h1>
          Smart bookkeeping that{' '}
          <span className="accent">learns from you</span>
        </h1>

        <p className="web-hero-subtitle">
          AI-powered transaction classification with cryptographic audit trails.
          Built for self-employed professionals and bookkeeping firms.
        </p>

        <div className="web-hero-ctas">
          <button className="web-btn web-btn-primary web-btn-lg" onClick={() => navigate('/pricing')}>
            See pricing →
          </button>
          <button className="web-btn web-btn-ghost web-btn-lg" onClick={() => navigate('/login')}>
            Sign in
          </button>
        </div>

        <div className="web-hero-trust">
          <span>✓ No credit card required</span>
          <span>✓ Free Starter plan</span>
          <span>✓ Cancel anytime</span>
        </div>

        {/* Live semaphore demo — four real transaction states at once,
            with the active one highlighted on a rotation. Reads as a
            product screenshot instead of one row cycling through
            unrelated fake states. */}
        <div className="web-demo-card">
          {SEMAPHORE_DEMO.map((row, i) => {
            const active = i === activeIdx
            return (
              <div
                key={row.merchant}
                className={`web-demo-list-row${active ? ' is-active' : ''}`}
                style={active ? {
                  background: `${row.color}0c`,
                  borderColor: `${row.color}35`,
                  boxShadow: `0 6px 16px ${row.color}22`
                } : undefined}
              >
                <div className="web-demo-dot" style={{ background: `${row.color}15`, borderColor: `${row.color}40` }}>
                  <span className="web-demo-dot-core" style={{ background: row.color }} />
                </div>
                <div className="web-demo-body">
                  <div className="web-demo-row">
                    <span className="web-demo-merchant">{row.merchant}</span>
                    <span className="web-demo-amount">{formatAmount(displayedAmounts[i] ?? 0)}</span>
                  </div>
                  <div className="web-demo-row">
                    <span
                      className="web-demo-pill"
                      style={{ color: row.color, background: `${row.color}10`, borderColor: `${row.color}30` }}
                    >
                      {row.label}
                    </span>
                    <span className="web-demo-desc">{row.desc}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="web-demo-caption">Live demo · Every transaction lands in a color-coded semaphore</div>
      </section>

      {/* ── Real feature set ───────────────────────────────────────── */}
      <section className="web-section">
        <h2>Everything a real books close needs</h2>
        <p className="web-section-sub">Not a prototype — every feature below is live in the product today.</p>
        <div className="web-feature-grid">
          {FEATURES.map(f => (
            <div className="web-card web-feature-card" key={f.title}>
              <div className="web-feature-icon">{f.icon}</div>
              <div className="web-feature-title">{f.title}</div>
              <div className="web-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section className="web-section web-section-alt">
        <h2>From bank feed to filed return</h2>
        <p className="web-section-sub">Three steps, not a twelve-tab spreadsheet.</p>
        <div className="web-steps">
          {STEPS.map((s, i) => (
            <div className="web-step" key={s.n}>
              <div className="web-step-number">{s.n}</div>
              <div className="web-step-title">{s.title}</div>
              <div className="web-step-desc">{s.desc}</div>
              {i < STEPS.length - 1 && <div className="web-step-connector" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust ──────────────────────────────────────────────────── */}
      <section className="web-section">
        <div className="web-trust-panel">
          <div className="web-trust-icon"><IconShield /></div>
          <div>
            <h2 className="web-trust-title">Built to survive a real audit, not just look tidy</h2>
            <p className="web-trust-desc">
              Every change to your books is hash-chained — edit one entry and the chain shows it. That's the
              same tamper-evidence model used for financial audit logs, applied to day-to-day bookkeeping
              instead of bolted on after the fact.
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────── */}
      <section className="web-section web-section-cta-wrap">
        <div className="web-cta-banner">
          <h2 className="web-cta-title">Ready to make bookkeeping less painful?</h2>
          <p className="web-cta-sub">Pick a plan that fits your workflow. Free to start.</p>
          <button className="web-btn web-btn-lg web-cta-btn" onClick={() => navigate('/pricing')}>
            See pricing →
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="web-footer">
        <div className="web-footer-links">
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Sign in</Link>
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/terms">Terms</Link>
          <a href="mailto:hello@ledgiproof.com">Contact</a>
        </div>
        <div>
          © 2026 Olympus Mont Systems LLC · LedgiProof v{import.meta.env.VITE_APP_VERSION ?? '0.1.0'}
        </div>
      </footer>

    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

// Hand-drawn 24x24 monoline icons, currentColor stroke -- deliberately
// not a generic icon-library import, and deliberately not emoji. Kept
// simple/geometric to match the LogoMark's own restraint.

function IconBank() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9" />
      <path d="M3 19h18" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function IconReceipt() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  )
}

function IconCar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16l1.5-5.5A2 2 0 0 1 7.4 9h9.2a2 2 0 0 1 1.9 1.5L20 16" />
      <rect x="3" y="16" width="18" height="4" rx="1.5" />
      <circle cx="7.5" cy="20" r="1.4" />
      <circle cx="16.5" cy="20" r="1.4" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.5a3.2 3.2 0 0 1 0 6.4M21 20c0-2.8-2-5.1-4.6-5.8" />
    </svg>
  )
}

function IconSemaphore() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="4" />
      <circle cx="12" cy="7.2" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="16.8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconLayout() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M9 9.5V20" />
    </svg>
  )
}
