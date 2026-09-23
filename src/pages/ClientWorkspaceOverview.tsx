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
import { useTranslation } from 'react-i18next'
import { useScope }    from '../hooks/useScope'
import { useUserRole } from '../hooks/useUserRole'

// `titleKey`/`hintKey` hold i18n KEYS (module scope can't call hooks) —
// resolved with t() at the render site below.
interface NavCard {
  to:       string
  icon:     string
  titleKey: string
  hintKey:  string
}

const BASE_NAV_CARDS: NavCard[] = [
  { to: 'transactions',   icon: '💳', titleKey: 'clientWorkspace.cardTransactions',    hintKey: 'clientWorkspace.cardTransactionsHint' },
  { to: 'invoices',       icon: '📄', titleKey: 'clientWorkspace.cardInvoices',        hintKey: 'clientWorkspace.cardInvoicesHint' },
  { to: 'estimates',      icon: '📋', titleKey: 'clientWorkspace.cardEstimates',       hintKey: 'clientWorkspace.cardEstimatesHint' },
  { to: 'imports',        icon: '🏦', titleKey: 'clientWorkspace.cardBankConnections', hintKey: 'clientWorkspace.cardBankConnectionsHint' },
  { to: 'accounts',       icon: '📚', titleKey: 'clientWorkspace.cardChartOfAccounts', hintKey: 'clientWorkspace.cardChartOfAccountsHint' },
  { to: 'reconciliation', icon: '⚖️',  titleKey: 'clientWorkspace.cardReconciliation',  hintKey: 'clientWorkspace.cardReconciliationHint' },
  { to: 'reports',        icon: '📊', titleKey: 'clientWorkspace.cardReports',         hintKey: 'clientWorkspace.cardReportsHint' },
  { to: 'time',           icon: '⏱️', titleKey: 'clientWorkspace.cardTime',            hintKey: 'clientWorkspace.cardTimeHint' }
]

const PAYROLL_NAV_CARD: NavCard =
  { to: 'payroll', icon: '🧾', titleKey: 'clientWorkspace.cardPayroll', hintKey: 'clientWorkspace.cardPayrollHint' }

const JOURNAL_NAV_CARD: NavCard =
  { to: 'journal', icon: '📒', titleKey: 'clientWorkspace.cardJournal', hintKey: 'clientWorkspace.cardJournalHint' }

const PERIODS_NAV_CARD: NavCard =
  { to: 'periods', icon: '🔒', titleKey: 'clientWorkspace.cardPeriods', hintKey: 'clientWorkspace.cardPeriodsHint' }

export default function ClientWorkspaceOverview() {
  const { t }    = useTranslation()
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
          <MetaItem label={t('clientWorkspace.email')}    value={client.email     ?? '—'} />
          <MetaItem label={t('clientWorkspace.phone')}    value={client.phone     ?? '—'} />
          <MetaItem label={t('clientWorkspace.taxId')}    value={client.tax_id    ?? '—'} mono />
          <MetaItem label={t('clientWorkspace.currency')} value={client.default_currency ?? 'USD'} />
          <MetaItem label={t('clientWorkspace.terms')}    value={t('clientWorkspace.netTerms', { days: client.payment_terms ?? 30 })} />

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
            {t('clientWorkspace.editClientDetails')}
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
              {t(card.titleKey)}
            </div>
            <div style={{
              fontSize:    11,
              color:       'var(--lp-text-muted)',
              lineHeight:  1.4
            }}>
              {t(card.hintKey)}
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