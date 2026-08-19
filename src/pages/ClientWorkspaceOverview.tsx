// PATH: src/pages/ClientWorkspaceOverview.tsx
//
// Client Switcher — Sprint 2 (Routing)
//
// Landing page rendered at /clients/:clientId/  (index of the workspace).
//
// Purpose:
//   · Quick orientation when a bookkeeper enters a client's workspace
//   · Navigation cards to operational sections (transactions, invoices, etc)
//   · Lightweight summary of the client (name, company, contact)
//
// What this does NOT do (intentionally):
//   · No KPI aggregations from the database — that comes from individual
//     pages or a dedicated dashboard sprint. This is a NAVIGATION page.
//   · No edit affordances for the client — those live in /clients/:id/edit
//
// Constitution: this is pure presentation + navigation. No business logic.

import { useNavigate } from 'react-router-dom'
import { useScope }    from '../hooks/useScope'
import { useUserRole } from '../hooks/useUserRole'

interface NavCard {
  to:    string
  icon:  string
  title: string
  hint:  string
}

const BASE_NAV_CARDS: NavCard[] = [
  { to: 'transactions',   icon: '💳', title: 'Transactions',     hint: 'Review, categorize, reconcile' },
  { to: 'invoices',       icon: '📄', title: 'Invoices',         hint: 'AR, billing, payments' },
  { to: 'estimates',      icon: '📋', title: 'Estimates',        hint: 'Quotes, proposals, conversion' },
  { to: 'imports',        icon: '🏦', title: 'Bank connections', hint: 'Plaid feeds for this client' },
  { to: 'accounts',       icon: '📚', title: 'Chart of accounts', hint: 'Client-specific accounting structure' },
  { to: 'reconciliation', icon: '⚖️',  title: 'Reconciliation',   hint: 'Match bank to ledger' },
  { to: 'reports',        icon: '📊', title: 'Reports',          hint: 'P&L, Balance Sheet, Cash Flow' }
]

const PAYROLL_NAV_CARD: NavCard =
  { to: 'payroll', icon: '🧾', title: 'Payroll', hint: 'Employees, pay runs, pay stubs' }

const JOURNAL_NAV_CARD: NavCard =
  { to: 'journal', icon: '📒', title: 'Journal Entries', hint: 'Accruals, deferrals, depreciation, closing entries' }

const PERIODS_NAV_CARD: NavCard =
  { to: 'periods', icon: '🔒', title: 'Period Controls', hint: 'Lock and close accounting periods' }

export default function ClientWorkspaceOverview() {
  const scope    = useScope()
  const navigate = useNavigate()
  const { canViewPayroll, canPostJournalEntries, canClosePeriods } = useUserRole()

  const NAV_CARDS = [
    ...BASE_NAV_CARDS,
    ...(canViewPayroll          ? [PAYROLL_NAV_CARD] : []),
    ...(canPostJournalEntries   ? [JOURNAL_NAV_CARD] : []),
    ...(canClosePeriods         ? [PERIODS_NAV_CARD] : []),
  ]

  const client = scope.client

  return (
    <div style={{
      padding:   '16px 20px',
      flex:       1,
      overflowY:  'auto'
    }}>

      {/* Client meta strip — client name already shown in ClientScopeBanner */}
      {client && (
        <div style={{
          display:       'flex',
          gap:           16,
          flexWrap:      'wrap',
          alignItems:    'center',
          padding:       '8px 14px',
          background:    'var(--lp-surface)',
          border:        '0.5px solid var(--lp-border)',
          borderRadius:  8,
          marginBottom:  14
        }}>
          <MetaItem label="Email"    value={client.email     ?? '—'} />
          <MetaItem label="Phone"    value={client.phone     ?? '—'} />
          <MetaItem label="Tax ID"   value={client.tax_id    ?? '—'} mono />
          <MetaItem label="Currency" value={client.default_currency ?? 'USD'} />
          <MetaItem label="Terms"    value={`Net ${client.payment_terms ?? 30}`} />

          <div style={{ flex: 1, minWidth: 8 }} />

          <button
            onClick={() => navigate(`/clients/${client.id}/edit`)}
            style={{
              background:   'transparent',
              border:       '0.5px solid var(--lp-border)',
              color:        'var(--lp-text)',
              borderRadius: 6,
              padding:      '4px 10px',
              fontSize:     11.5,
              fontWeight:   500,
              cursor:       'pointer',
              fontFamily:   'inherit',
              whiteSpace:   'nowrap'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            ✏ Edit client details
          </button>
        </div>
      )}

      {/* Navigation grid */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
        gap:                 8
      }}>
        {NAV_CARDS.map(card => (
          <button
            key={card.to}
            onClick={() => navigate(card.to)}
            style={{
              textAlign:    'left',
              padding:      '11px 14px',
              background:   'var(--lp-surface)',
              border:       '0.5px solid var(--lp-border)',
              borderRadius: 9,
              cursor:       'pointer',
              fontFamily:   'inherit',
              transition:   'all 0.12s',
              color:        'var(--lp-text)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--lp-surface-2)'
              e.currentTarget.style.borderColor = 'var(--lp-accent)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--lp-surface)'
              e.currentTarget.style.borderColor = 'var(--lp-border)'
            }}
          >
            <div style={{ fontSize: 17, marginBottom: 6 }}>{card.icon}</div>
            <div style={{
              fontSize:    12.5,
              fontWeight:  600,
              color:       'var(--lp-text)',
              marginBottom: 2
            }}>
              {card.title}
            </div>
            <div style={{
              fontSize:    11,
              color:       'var(--lp-text-muted)',
              lineHeight:  1.4
            }}>
              {card.hint}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function MetaItem({
  label, value, mono
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <div style={{
        fontSize:       10,
        fontWeight:     700,
        textTransform:  'uppercase',
        letterSpacing:  '0.06em',
        color:          'var(--lp-text-muted)',
        marginBottom:   3
      }}>
        {label}
      </div>
      <div style={{
        fontSize:    12.5,
        color:       'var(--lp-text)',
        fontFamily:  mono ? 'monospace' : 'inherit',
        fontWeight:  500
      }}>
        {value}
      </div>
    </div>
  )
}