// PATH: src/pages/Pricing.tsx
// Pricing page — toggle between self-employed plans and bookkeeper plans.
// Each CTA passes ?plan=X&type=Y to /signup so SignUp can pre-fill the flow.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logoSrc from '../assets/logo.png'
import '../styles/web.css'

type Segment = 'self_employed' | 'bookkeeper'

interface Plan {
  id:           'starter' | 'entrepreneur' | 'bookkeeper' | 'accountant' | 'enterprise'
  name:         string
  tagline:      string
  price:        string
  priceSub:     string
  badge?:       string
  highlight?:   boolean
  features:     string[]
  cta:          string
}

const SE_PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Get started — first month on us',
    price: '$9.99',
    priceSub: '/mo',
    features: [
      'First month free',
      'Manual transaction entry',
      'AI semaphore (50 transactions/mo)',
      '5 receipts/mo',
      '5 mileage trips/mo',
      '2 invoices/mo',
      'Basic monthly reports',
      'Optional bank sync — $1.50/mo per Plaid connection'
    ],
    cta: 'Start free'
  },
  {
    id: 'entrepreneur',
    name: 'Entrepreneur',
    tagline: 'For self-employed and freelancers',
    price: '$19.99',
    priceSub: '/mo',
    badge: '15-day free trial',
    highlight: true,
    features: [
      '3 bank connections included',
      '500 transactions/mo with AI semaphore',
      '30 receipts/mo with OCR',
      '50 mileage trips/mo',
      '10 invoices/mo',
      'Schedule C export PDF',
      'Quarterly tax estimator',
      'AI Assistant — 50 queries/mo',
      'Quarterly P&L reports'
    ],
    cta: 'Start with Entrepreneur →'
  }
]

const BK_PLANS: Plan[] = [
  {
    id: 'bookkeeper',
    name: 'Bookkeeper',
    tagline: 'For independent bookkeepers',
    price: '$59.99',
    priceSub: '/mo',
    badge: '15-day free trial',
    features: [
      'Up to 25 clients',
      '8 bank connections (Plaid included)',
      '2,000 transactions/mo',
      'Multi-client management',
      'Client Portal for PYMEs',
      'Reconciliation workflows',
      'Hash chain audit trail',
      'Bill tracking & reminders',
      'AI Assistant — 200 queries/mo'
    ],
    cta: 'Try Free 15 Days →'
  },
  {
    id: 'accountant',
    name: 'Accountant',
    tagline: 'For accounting & CPA firms',
    price: '$69.99',
    priceSub: '/mo',
    badge: 'Professional',
    highlight: true,
    features: [
      'Up to 100 clients',
      '50 bank connections (Plaid included)',
      '10,000 transactions/mo',
      'Multi-client management',
      'Client Portal for PYMEs',
      'Reconciliation workflows',
      'Hash chain audit trail (compliance-grade)',
      'Up to 5 team members',
      'Bill tracking & reminders',
      'White-label invoicing',
      'API access',
      'AI Assistant — 1,000 queries/mo'
    ],
    cta: 'Try Free 15 Days →'
  }
]

export default function Pricing() {
  const navigate = useNavigate()
  const [segment, setSegment] = useState<Segment>('self_employed')

  const plans = segment === 'self_employed' ? SE_PLANS : BK_PLANS

  function handleStart(planId: Plan['id']) {
    navigate(`/signup?plan=${planId}&type=${segment}`)
  }

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
          <button
            className="web-btn web-btn-primary"
            onClick={() => navigate('/signup')}
            style={{ marginLeft: 6 }}
          >
            Get started →
          </button>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section style={{ padding: '60px 24px 30px', textAlign: 'center' }}>
        <h1 style={{
          fontSize: 'clamp(30px, 4vw, 44px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '0 0 12px',
          color: 'var(--web-text)'
        }}>
          Pricing built for how you actually work
        </h1>
        <p style={{
          fontSize: 16,
          color: 'var(--web-text-muted)',
          maxWidth: 560,
          margin: '0 auto 36px'
        }}>
          Choose your path. Upgrade when you outgrow your plan. No hidden fees.
        </p>

        {/* Segment toggle */}
        <div style={{
          display: 'inline-flex',
          padding: 4,
          background: 'var(--web-surface)',
          border: '1px solid var(--web-border)',
          borderRadius: 100,
          gap: 2
        }}>
          <SegmentBtn
            active={segment === 'self_employed'}
            onClick={() => setSegment('self_employed')}
          >
            I'm self-employed
          </SegmentBtn>
          <SegmentBtn
            active={segment === 'bookkeeper'}
            onClick={() => setSegment('bookkeeper')}
          >
            I'm a bookkeeper
          </SegmentBtn>
        </div>
      </section>

      {/* ── Plan cards ─────────────────────────────────────────────── */}
      <section style={{ padding: '20px 24px 40px' }}>
        <div style={{
          maxWidth: segment === 'self_employed' ? 1100 : 720,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: 16
        }}>
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onStart={() => handleStart(plan.id)}
            />
          ))}
        </div>

        {/* Plaid disclosure — only for Starter (self-employed segment) */}
        {segment === 'self_employed' && (
          <div style={{
            maxWidth: 1100,
            margin: '24px auto 0',
            padding: '14px 18px',
            background: 'var(--web-surface)',
            border: '1px solid var(--web-border)',
            borderRadius: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
            color: 'var(--web-text-muted)'
          }}>
            <span style={{ fontSize: 18 }}>💳</span>
            <span>
              <strong style={{ color: 'var(--web-text)' }}>Banking on Starter:</strong>{' '}
              Plaid bank connections cost $1.50/mo per account on the Starter plan.
              On <strong>Entrepreneur, Bookkeeper, and Accountant</strong> the Plaid fees are included.
            </span>
          </div>
        )}
      </section>

      {/* ── Compare features table ─────────────────────────────────── */}
      <section className="web-section">
        <h2>Compare plans side-by-side</h2>
        <p className="web-section-sub">Every feature, every limit. No surprises.</p>

        <CompareTable />
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <section className="web-section" style={{ paddingTop: 20 }}>
        <h2>Frequently asked questions</h2>
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <FAQ
            q="Can I cancel anytime?"
            a="Yes. Your subscription stays active until the end of the billing period. No cancellation fees."
          />
          <FAQ
            q="What happens if I exceed my plan limits?"
            a="Operations beyond your monthly limit are blocked, and you'll see an upgrade prompt. Existing data stays untouched."
          />
          <FAQ
            q="Do firms really get a free 15-day trial?"
            a="Yes. Sign up as a bookkeeper or accountant and you get full access for 15 days. No credit card required upfront."
          />
          <FAQ
            q="How does PYME client access work?"
            a="On the Bookkeeper and Accountant plans, you can invite your clients to view their own transactions and chat with you. Their access is free — they don't need to subscribe separately."
          />
          <FAQ
            q="Can I switch plans later?"
            a="Anytime. Upgrades take effect immediately. Downgrades take effect at the next billing period."
          />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="web-footer">
        <div className="web-footer-links">
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Sign in</Link>
          <a href="mailto:support@ledgiproof.com">Contact</a>
        </div>
        <div>© 2026 Olympus Mont Systems LLC · LedgiProof</div>
      </footer>

    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SegmentBtn({
  active, onClick, children
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 18px',
        border: 'none',
        borderRadius: 100,
        background: active ? 'var(--web-primary)' : 'transparent',
        color:      active ? '#fff' : 'var(--web-text-muted)',
        fontSize: 13.5,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s'
      }}
    >
      {children}
    </button>
  )
}

function PlanCard({
  plan, onStart
}: { plan: Plan; onStart: () => void }) {
  const isHighlighted = plan.highlight

  return (
    <div
      className={`web-plan-card${isHighlighted ? ' is-highlighted' : ''}`}
      style={{
        position: 'relative',
        background: isHighlighted
          ? 'linear-gradient(180deg, #fff 0%, #f0f9ff 100%)'
          : '#fff',
        border: isHighlighted
          ? '2px solid var(--web-primary)'
          : '1px solid var(--web-border)',
        borderRadius: 16,
        padding: '24px 24px 22px',
        boxShadow: isHighlighted
          ? '0 12px 30px rgba(59,130,246,0.15)'
          : '0 1px 3px rgba(15,23,42,0.04)',
        display: 'flex', flexDirection: 'column'
      }}
    >

      {plan.badge && (
        <div style={{
          position: 'absolute', top: -12, left: 24,
          padding: '3px 11px',
          background: 'linear-gradient(135deg, var(--web-primary), var(--web-accent))',
          color: '#fff',
          fontSize: 10.5, fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          borderRadius: 100,
          boxShadow: '0 2px 6px rgba(59,130,246,0.4)'
        }}>
          {plan.badge}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 17, fontWeight: 700, color: 'var(--web-text)',
          letterSpacing: '-0.01em', marginBottom: 4
        }}>
          {plan.name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--web-text-muted)' }}>
          {plan.tagline}
        </div>
      </div>

      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontSize: 38, fontWeight: 700, color: 'var(--web-text)',
          letterSpacing: '-0.025em', lineHeight: 1
        }}>
          {plan.price}
        </span>
        <span style={{ fontSize: 14, color: 'var(--web-text-subtle)' }}>
          {plan.priceSub}
        </span>
      </div>

      <button
        className={`web-btn ${isHighlighted ? 'web-btn-primary' : 'web-btn-ghost'}`}
        onClick={onStart}
        style={{ width: '100%', marginBottom: 18 }}
      >
        {plan.cta}
      </button>

      <ul style={{
        margin: 0, padding: 0, listStyle: 'none',
        display: 'flex', flexDirection: 'column', gap: 8,
        flex: 1
      }}>
        {plan.features.map((f, i) => (
          <li key={i} style={{
            fontSize: 13, color: 'var(--web-text)', lineHeight: 1.5,
            display: 'flex', gap: 8, alignItems: 'flex-start'
          }}>
            <Checkmark color={isHighlighted ? '#3b82f6' : '#22c55e'} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Checkmark({ color = '#22c55e' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="8" cy="8" r="8" fill={color} fillOpacity="0.12" />
      <path d="M5 8.5l2 2 4-4" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CompareTable() {
  const rows: Array<[string, string | boolean, string | boolean, string | boolean, string | boolean]> = [
    // [label, starter, entrepreneur, bookkeeper, accountant]
    ['Bank connections',          '0 (manual)', '3', '8', '50'],
    ['Transactions / month',      '50',         '500', '2,000', '10,000'],
    ['Receipts / month',          '5',          '30',  '100',   '500'],
    ['Mileage trips / month',     '5',          '50',  '200',   '1,000'],
    ['Invoices / month',          '2',          '10',  '50',    '250'],
    ['Clients (billing)',         '0',          '3',   '10',    '100'],
    ['Team members',              '0',          '0',   '0',     '5'],
    ['AI queries / month',        '5',          '50',  '200',   '1,000'],
    ['Storage',                   '100 MB',     '1 GB','5 GB',  '25 GB'],
    ['Schedule C export',         false,        true,  true,    true],
    ['Quarterly tax estimator',   false,        true,  true,    true],
    ['Accountant guest access',   false,        false, true,    'N/A'],
    ['Bill tracking & reminders', false,        false, true,    true],
    ['Hash chain audit',          false,        false, true,    true],
    ['Reconciliation',            false,        false, true,    true],
    ['Client portal for PYMEs',   false,        false, true,    true],
    ['White-label invoicing',     false,        false, false,   true],
    ['API access',                false,        false, false,   true]
  ]

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--web-border)',
      borderRadius: 14,
      overflow: 'hidden'
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr style={{ background: 'var(--web-surface-alt)' }}>
            <th style={thStyle}>Feature</th>
            <th style={thStyle}>Starter</th>
            <th style={{ ...thStyle, color: 'var(--web-primary)' }}>Entrepreneur</th>
            <th style={thStyle}>Bookkeeper</th>
            <th style={thStyle}>Accountant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, ...vals], i) => (
            <tr key={i} style={{
              borderTop: '1px solid var(--web-border)',
              background: i % 2 === 0 ? '#fff' : 'rgba(248,250,252,0.5)'
            }}>
              <td style={{ ...tdStyle, color: 'var(--web-text)', fontWeight: 500 }}>
                {label}
              </td>
              {vals.map((v, j) => (
                <td key={j} style={{ ...tdStyle, textAlign: 'center' }}>
                  {typeof v === 'boolean'
                    ? (v ? <Checkmark /> : <Dash />)
                    : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--web-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em'
}

const tdStyle: React.CSSProperties = {
  padding: '11px 14px',
  fontSize: 13.5,
  color: 'var(--web-text-muted)'
}

function Dash() {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 1.5,
      background: 'var(--web-text-subtle)', opacity: 0.5,
      verticalAlign: 'middle'
    }} />
  )
}

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--web-border)',
      borderRadius: 11,
      padding: '14px 18px',
      cursor: 'pointer'
    }} onClick={() => setOpen(o => !o)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--web-text)' }}>
          {q}
        </span>
        <span style={{ fontSize: 18, color: 'var(--web-text-muted)',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s' }}>
          +
        </span>
      </div>
      {open && (
        <div style={{
          fontSize: 13.5, color: 'var(--web-text-muted)',
          marginTop: 10, lineHeight: 1.6
        }}>
          {a}
        </div>
      )}
    </div>
  )
}