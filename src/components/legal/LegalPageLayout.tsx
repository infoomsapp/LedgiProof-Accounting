// PATH: src/components/legal/LegalPageLayout.tsx
// Shared layout for /legal/* pages — topbar, content shell, footer.
// Applies the corporate blue/gray design from web.css.

import { Link } from 'react-router-dom'
import '../../styles/web.css'
import './legal.css'

interface LegalPageLayoutProps {
  title:        string
  subtitle?:    string
  lastUpdated:  string
  children:     React.ReactNode
}

export default function LegalPageLayout({
  title,
  subtitle,
  lastUpdated,
  children
}: LegalPageLayoutProps) {
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
        </nav>
      </header>

      {/* ── Hero band ──────────────────────────────────────────────── */}
      <section style={{
        padding: '50px 24px 30px',
        background: 'linear-gradient(180deg, #f0f9ff 0%, #f8fafc 100%)',
        borderBottom: '1px solid var(--web-border)'
      }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ marginBottom: 14 }}>
            <Link to="/" style={{
              fontSize: 13, color: 'var(--web-text-muted)',
              textDecoration: 'none'
            }}>
              ← Back to home
            </Link>
          </div>
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 38px)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--web-text)',
            margin: '0 0 8px'
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              fontSize: 15,
              color: 'var(--web-text-muted)',
              margin: '0 0 14px'
            }}>
              {subtitle}
            </p>
          )}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 12px', borderRadius: 100,
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.2)',
            fontSize: 12, color: 'var(--web-primary)',
            fontWeight: 500
          }}>
            📅 Last updated: {lastUpdated}
          </div>
        </div>
      </section>

      {/* ── Content shell ──────────────────────────────────────────── */}
      <main style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '40px 24px 60px'
      }}>
        <div className="legal-content">
          {children}
        </div>
      </main>

      {/* ── Cross-links to other legal docs ─────────────────────────── */}
      <section style={{
        maxWidth: 880,
        margin: '0 auto 40px',
        padding: '0 24px'
      }}>
        <div style={{
          padding: '20px 24px',
          background: 'var(--web-surface)',
          border: '1px solid var(--web-border)',
          borderRadius: 14
        }}>
          <div style={{
            fontSize: 11, color: 'var(--web-text-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.07em',
            fontWeight: 600, marginBottom: 12
          }}>
            Related documents
          </div>
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap'
          }}>
            <CrossLink to="/legal/privacy"          label="Privacy Policy" />
            <CrossLink to="/legal/terms"            label="Terms of Service" />
            <CrossLink to="/legal/plaid-disclosure" label="Plaid Disclosure" />
            <CrossLink to="/legal/cookies"          label="Cookies Policy" />
            <CrossLink to="/legal/dpa"              label="DPA (Pro plan)" />
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="web-footer">
        <div className="web-footer-links">
          <Link to="/pricing">Pricing</Link>
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/cookies">Cookies</Link>
          <a href="mailto:support@ledgiproof.com">Contact</a>
        </div>
        <div>
          © 2026 Olympus Mont Systems LLC · Maryland Department ID: W26738385
        </div>
      </footer>

    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CrossLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      style={{
        padding: '7px 13px',
        borderRadius: 7,
        background: 'var(--web-surface-alt)',
        border: '1px solid var(--web-border)',
        fontSize: 12.5,
        color: 'var(--web-text-muted)',
        textDecoration: 'none',
        transition: 'all 0.15s'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--web-primary-light)'
        e.currentTarget.style.color      = 'var(--web-primary-hover)'
        e.currentTarget.style.borderColor = 'var(--web-primary)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--web-surface-alt)'
        e.currentTarget.style.color      = 'var(--web-text-muted)'
        e.currentTarget.style.borderColor = 'var(--web-border)'
      }}
    >
      {label}
    </Link>
  )
}

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="7" fill="url(#lpglegal)" />
      <path d="M9 22V10h2v10h6v2H9zm10-12h2l4 12h-2.2l-1-3h-3.6l-1 3H15l4-12zm.4 2.5L18 17h2.8L19.4 12.5z"
        fill="#fff" />
      <defs>
        <linearGradient id="lpglegal" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  )
}