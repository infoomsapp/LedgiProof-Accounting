// PATH: src/pages/Pricing.tsx
// Pricing page — toggle between self-employed plans and bookkeeper plans.
// Each CTA passes ?plan=X&type=Y to /signup so SignUp can pre-fill the flow.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logoSrc from '../assets/logo.png'
import Icon from '../components/ui/Icon'
import {
  PAID_PLANS, PLAN_CATALOG, FEATURE_LABELS, COUNTED_FEATURES,
  priceLabel, trialLabel, planHighlights, describeLimit, getFeatureMatrix,
  type PaidPlan, type FeatureMatrix
} from '../lib/plans'
import '../styles/web.css'

type Segment = 'self_employed' | 'bookkeeper'

interface Plan {
  id:           PaidPlan
  name:         string
  tagline:      string
  price:        string
  priceSub:     string
  badge?:       string
  highlight?:   boolean
  features:     string[]
  cta:          string
}

const SEGMENT_PLANS: Record<Segment, PaidPlan[]> = {
  self_employed: ['starter', 'entrepreneur'],
  bookkeeper:    ['bookkeeper', 'accountant'],
}
const HIGHLIGHTED: PaidPlan[] = ['entrepreneur', 'accountant']

// Card = catalog (name, price, trial) + that plan's plan_features row.
function toCard(id: PaidPlan, matrix: FeatureMatrix): Plan {
  const info  = PLAN_CATALOG[id]
  const trial = trialLabel(id)
  return {
    id,
    name:     info.name,
    tagline:  info.tagline,
    price:    priceLabel(id),
    priceSub: '/mo',
    ...(trial ? { badge: trial } : {}),
    highlight: HIGHLIGHTED.includes(id),
    features: planHighlights(matrix[id]),
    cta:      trial ? `Start your ${trial} →` : `Start with ${info.name} →`,
  }
}

export default function Pricing() {
  const navigate = useNavigate()
  const [segment, setSegment] = useState<Segment>('self_employed')
  const [matrix,  setMatrix]  = useState<FeatureMatrix | null>(null)
  const [failed,  setFailed]  = useState(false)

  useEffect(() => {
    let alive = true
    getFeatureMatrix()
      .then(m => { if (alive) setMatrix(m) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const plans = matrix ? SEGMENT_PLANS[segment].map(id => toCard(id, matrix)) : []

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
          {!matrix && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--web-text-muted)', fontSize: 14 }}>
              {failed ? "Couldn't load the plan details. Please refresh the page." : 'Loading plans…'}
            </div>
          )}
        </div>

        {/* Bank connections: what each plan includes, from plan_features */}
        {segment === 'self_employed' && matrix && (
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
            <span style={{ color: 'var(--web-text-muted)', display: 'flex' }}><Icon name="billing" size={18} /></span>
            <span>
              <strong style={{ color: 'var(--web-text)' }}>Bank connections:</strong>{' '}
              {PAID_PLANS.map(id => `${PLAN_CATALOG[id].name} ${describeLimit('plaid_connections', matrix[id]?.plaid_connections) ?? 'no bank connections'}`).join(' · ')}.
            </span>
          </div>
        )}
      </section>

      {/* ── Compare features table ─────────────────────────────────── */}
      <section className="web-section">
        <h2>Compare plans side-by-side</h2>
        <p className="web-section-sub">Every feature, every limit. No surprises.</p>

        {matrix && <CompareTable matrix={matrix} />}
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
            a="Transactions keep importing: anything over your monthly allowance is billed at $5 per 1,000. Invoices, receipts and mileage trips pause at the limit until next month or an upgrade (Bookkeeper and Accountant can turn on pay-as-you-go). Existing data always stays untouched."
          />
          <FAQ
            q={`Do firms really get a free ${PLAN_CATALOG.bookkeeper.trialDays}-day trial?`}
            a={`Yes. Sign up as a bookkeeper or accountant and you get full access for ${PLAN_CATALOG.bookkeeper.trialDays} days. No credit card required upfront.`}
          />
          <FAQ
            q="What happens when my trial ends?"
            a={`Every plan starts with a free trial — ${PAID_PLANS.map(id => `${PLAN_CATALOG[id].trialDays} days on ${PLAN_CATALOG[id].name}`).join(', ')}. When it ends, you choose a plan to keep working. Nothing is deleted while you decide.`}
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

function CompareTable({ matrix }: { matrix: FeatureMatrix }) {
  const cols = PAID_PLANS
  const cell = (key: string, id: PaidPlan): string | boolean => {
    const v = matrix[id]?.[key] ?? 0
    if (!(COUNTED_FEATURES as readonly string[]).includes(key)) return v !== 0
    if (v === -1) return 'Unlimited'
    if (v === 0)  return false
    if (key === 'storage_mb') return v >= 1000 ? `${v / 1000} GB` : `${v} MB`
    return v.toLocaleString('en-US')
  }
  const keys = [
    ...COUNTED_FEATURES,
    'multi_client', 'reconciliation', 'bill_tracking', 'time_tracking', 'schedule_c_export',
    'payroll', 'journal_entries', 'period_closing', 'approval_workflow', 'tax_forms',
    'white_label', 'api_access', 'reports_export',
  ]
  const label = (key: string) => {
    if (key === 'storage_mb') return 'Storage'
    const l = FEATURE_LABELS[key]
    if (!l) return key
    return (COUNTED_FEATURES as readonly string[]).includes(key)
      ? l.many.charAt(0).toUpperCase() + l.many.slice(1)
      : l.one
  }
  const rows: Array<[string, ...(string | boolean)[]]> = keys.map(k => [label(k), ...cols.map(id => cell(k, id))])

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
            {cols.map(id => (
              <th key={id} style={HIGHLIGHTED.includes(id) ? { ...thStyle, color: 'var(--web-primary)' } : thStyle}>
                {PLAN_CATALOG[id].name}
              </th>
            ))}
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