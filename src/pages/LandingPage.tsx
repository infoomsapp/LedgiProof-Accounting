// PATH: src/pages/LandingPage.tsx
// Minimal landing page — hero, animated semaphore preview, CTAs.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../styles/web.css'

const SEMAPHORE_DEMO = [
  { color: '#3b82f6', label: 'Verified',     icon: '🔵', desc: 'Approved by your bookkeeper' },
  { color: '#22c55e', label: 'Processed',    icon: '🟢', desc: 'Auto-categorized · 92% confidence' },
  { color: '#f59e0b', label: 'Needs review', icon: '🟡', desc: 'Was this for business or personal?' },
  { color: '#ef4444', label: 'Urgent',       icon: '🔴', desc: 'Unusual amount detected' }
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [demoIdx, setDemoIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setDemoIdx(i => (i + 1) % SEMAPHORE_DEMO.length), 2400)
    return () => clearInterval(id)
  }, [])

  // demoIdx is always kept in range via `% SEMAPHORE_DEMO.length` in the
  // interval above, so this index is provably safe.
  const demo = SEMAPHORE_DEMO[demoIdx % SEMAPHORE_DEMO.length]!

  return (
    <div className="lp-web-page">

      {/* ── Topbar ─────────────────────────────────────────────────── */}
      <header className="web-topbar">
        <Link to="/" className="web-topbar-logo">
          <LogoMark />
          <span>LedgiProof</span>
        </Link>
        <nav className="web-topbar-nav">
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Sign in</Link>
          <button
            className="web-btn web-btn-primary"
            onClick={() => navigate('/pricing')}
            style={{ marginLeft: 6 }}
          >
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
          <button
            className="web-btn web-btn-primary web-btn-lg"
            onClick={() => navigate('/pricing')}
          >
            See pricing →
          </button>
          <button
            className="web-btn web-btn-ghost web-btn-lg"
            onClick={() => navigate('/login')}
          >
            Sign in
          </button>
        </div>

        <div className="web-hero-trust">
          <span>✓ No credit card required</span>
          <span>✓ Free Starter plan</span>
          <span>✓ Cancel anytime</span>
        </div>

        {/* Animated semaphore demo card */}
        <div style={{
          maxWidth: 540,
          margin: '60px auto 0',
          background: '#fff',
          border: '1px solid var(--web-border)',
          borderRadius: 14,
          padding: '20px 24px',
          boxShadow: '0 12px 30px rgba(15,23,42,0.10)',
          textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 16
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: `${demo.color}15`,
            border: `1px solid ${demo.color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
            transition: 'all 0.4s'
          }}>
            {demo.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--web-text)' }}>
                Starbucks Coffee
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--web-danger)',
                fontFamily: 'monospace' }}>
                -$4.85
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 100,
                color: demo.color,
                background: `${demo.color}10`,
                border: `0.5px solid ${demo.color}30`,
                fontWeight: 500,
                transition: 'all 0.4s'
              }}>
                {demo.label}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--web-text-muted)' }}>
                {demo.desc}
              </span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--web-text-subtle)', marginTop: 14 }}>
          Live demo · Watch how transactions get classified
        </div>
      </section>

      {/* ── 3 quick value props ────────────────────────────────────── */}
      <section className="web-section">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 18
        }}>
          <ValueProp
            icon="🤖"
            title="AI semaphore"
            desc="Every transaction is flagged with a risk color. Blue verified, amber needs review, red urgent. Stop guessing what to look at."
          />
          <ValueProp
            icon="🔐"
            title="Cryptographic audit"
            desc="Every change is hash-chained. Tamper-proof history that satisfies CPA reviews and compliance audits."
          />
          <ValueProp
            icon="💸"
            title="Schedule C ready"
            desc="Auto-categorize 1099 expenses. Export your IRS Schedule C with one click. Built for self-employed and freelancers."
          />
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────── */}
      <section className="web-section" style={{ paddingBottom: 40 }}>
        <div style={{
          background: 'linear-gradient(135deg, #1e40af, #0891b2)',
          borderRadius: 18,
          padding: '40px 32px',
          textAlign: 'center',
          color: '#fff'
        }}>
          <h2 style={{ color: '#fff', marginBottom: 8 }}>
            Ready to make bookkeeping less painful?
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', marginBottom: 22 }}>
            Pick a plan that fits your workflow. Free to start.
          </p>
          <button
            className="web-btn web-btn-lg"
            onClick={() => navigate('/pricing')}
            style={{
              background: '#fff',
              color: '#1e40af',
              border: 'none'
            }}
          >
            See pricing →
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="web-footer">
        <div className="web-footer-links">
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Sign in</Link>
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

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="7" fill="url(#lpg)" />
      <path d="M9 22V10h2v10h6v2H9zm10-12h2l4 12h-2.2l-1-3h-3.6l-1 3H15l4-12zm.4 2.5L18 17h2.8L19.4 12.5z"
        fill="#fff" />
      <defs>
        <linearGradient id="lpg" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function ValueProp({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="web-card">
      <div style={{
        width: 44, height: 44, borderRadius: 11,
        background: 'linear-gradient(135deg, #dbeafe, #cffafe)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, marginBottom: 14
      }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--web-text)',
        marginBottom: 6, letterSpacing: '-0.01em' }}>
        {title}
      </div>
      <div style={{ fontSize: 14, color: 'var(--web-text-muted)', lineHeight: 1.6 }}>
        {desc}
      </div>
    </div>
  )
}
