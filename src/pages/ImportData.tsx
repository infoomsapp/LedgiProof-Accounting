// PATH: src/pages/ImportData.tsx
//
// P-Import.A — Landing page for the Import Data wizard.
//
// Route: /import
// Access: bookkeeper_owner / bookkeeper_admin / super_admin
//
// Shows 3 cards (Chart of Accounts, Customers, Opening Balances).
// Each card navigates to the corresponding wizard page:
//   /import/chart-of-accounts
//   /import/customers
//   /import/opening-balances
//
// The wizards themselves are implemented in Import.B + Import.C.

import { useNavigate, useSearchParams } from 'react-router-dom'
import { useScope } from '../hooks/useScope'
import ClientPickerDropdown from '../components/clients/ClientPickerDropdown'

interface ImportCard {
  emoji:    string
  title:    string
  desc:     string
  href:     string
  step:     number
  available: boolean
}

const CARDS: ImportCard[] = [
  {
    emoji:     '📋',
    title:     'Chart of Accounts',
    desc:      'Import your full account list from QBO, Xero, Wave, or a CSV/Excel file. Required first step before anything else.',
    href:      '/import/chart-of-accounts',
    step:      1,
    available: true
  },
  {
    emoji:     '👥',
    title:     'Customers / Vendors',
    desc:      'Bulk-import billing clients and vendors with contact info, currency, and payment terms.',
    href:      '/import/customers',
    step:      2,
    available: true
  },
  {
    emoji:     '⚖️',
    title:     'Opening Balances',
    desc:      'Seed account balances from your prior books period. Requires balanced debits/credits and a transition date.',
    href:      '/import/opening-balances',
    step:      3,
    available: true
  },
  {
    emoji:     '🏦',
    title:     'Bank Transactions',
    desc:      'Import bank statement lines from a CSV or OFX/QFX file. Each row becomes a transaction, classified by the semaphore engine. For banks not on Plaid.',
    href:      '/import/bank-transactions',
    step:      4,
    available: true
  }
]

export default function ImportData() {
  const navigate = useNavigate()
  const scope = useScope()
  const [searchParams, setSearchParams] = useSearchParams()

  // Firm mode (bookkeeper/accountant on their firm org): every import must be
  // anchored to a specific client. Self mode (solo/pyme/personal): no client.
  const clientId    = searchParams.get('clientId')
  const isFirm      = scope.scopeMode === 'firm-client'
  const needsClient = isFirm && !clientId

  // Preserve the selected client when opening a wizard so it stays scoped.
  function openCard(href: string) {
    navigate(clientId ? `${href}?clientId=${clientId}` : href)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, width: '100%', margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none', padding: 0,
            color: 'var(--lp-accent)', fontSize: 12,
            cursor: 'pointer', fontFamily: 'inherit'
          }}
        >
          ← Back to dashboard
        </button>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 className="lp-page-title" style={{ margin: 0 }}>Import Data</h1>
        <p className="lp-page-sub" style={{ margin: '6px 0 0 0' }}>
          Migrate your books into LedgiProof. Follow the steps in order — accounts first,
          then customers, then opening balances.
        </p>
      </div>

      {/* Info banner */}
      <div style={{
        padding:      '12px 14px',
        background:   'var(--chat-bubble-internal-bg)',
        border:       '0.5px solid var(--chat-bubble-internal-border)',
        borderRadius: 9,
        fontSize:     12.5,
        lineHeight:   1.55,
        color:        'var(--lp-text)',
        marginBottom: 20
      }}>
        <div style={{ fontWeight: 600, color: 'var(--lp-violet)', marginBottom: 4 }}>
          📥 Before you start
        </div>
        <div style={{ color: 'var(--lp-text-muted)' }}>
          We accept <strong>CSV</strong>, <strong>Excel (.xlsx)</strong>, or pasted data
          from your clipboard. From QuickBooks, Xero, or Wave: export the list to CSV
          first, then upload here. The wizard will detect conflicts and let you choose
          how to handle each one.
        </div>
      </div>

      {/* Firm mode: anchor every import to a specific client */}
      {isFirm && (
        <div style={{ marginBottom: 20 }}>
          <ClientPickerDropdown
            orgId={scope.orgId}
            selectedId={clientId ?? ''}
            onSelect={(id) => setSearchParams(id ? { clientId: id } : {})}
            label="Import for client"
            placeholder="Search your clients…"
            helpText="In firm mode, every import is scoped to the selected client."
          />
          {needsClient && (
            <div className="lp-banner warning" style={{ marginTop: 12 }}>
              <span>⚠ Select a client above to import their data.</span>
            </div>
          )}
        </div>
      )}

      {/* Cards grid */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {CARDS.map(card => {
          const available = card.available && !needsClient
          return (
            <CardRow
              key={card.title}
              card={{ ...card, available }}
              onClick={() => available && openCard(card.href)}
            />
          )
        })}
      </div>

      {/* Help footer */}
      <div style={{
        marginTop:    24,
        padding:      '14px 16px',
        background:   'var(--lp-surface-2)',
        border:       '0.5px solid var(--lp-border)',
        borderRadius: 9,
        fontSize:     12,
        color:        'var(--lp-text-muted)',
        lineHeight:   1.55
      }}>
        <div style={{ fontWeight: 600, color: 'var(--lp-text)', marginBottom: 4 }}>
          💡 Tips
        </div>
        <ul style={{ margin: '4px 0 0 0', paddingLeft: 18 }}>
          <li>The Chart of Accounts must be imported <strong>before</strong> Opening Balances (the account codes must exist).</li>
          <li>Conflicts (same code or duplicate name) are detected automatically — you'll choose <em>skip</em>, <em>overwrite</em>, or <em>keep both</em> per row.</li>
          <li>Opening Balances must have <strong>total debits = total credits</strong> exactly.</li>
        </ul>
      </div>
    </div>
  )
}

// ── Card row ────────────────────────────────────────────────────────────────

function CardRow({ card, onClick }: { card: ImportCard; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!card.available}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            14,
        padding:        '16px 18px',
        background:     'var(--lp-surface)',
        border:         '0.5px solid var(--lp-border)',
        borderRadius:   10,
        cursor:         card.available ? 'pointer' : 'not-allowed',
        opacity:        card.available ? 1 : 0.55,
        textAlign:      'left',
        fontFamily:     'inherit',
        width:          '100%',
        transition:     'border-color 0.12s, background 0.12s'
      }}
      onMouseEnter={e => {
        if (card.available) {
          e.currentTarget.style.borderColor = 'var(--lp-accent)'
          e.currentTarget.style.background  = 'var(--chat-row-hover)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--lp-border)'
        e.currentTarget.style.background  = 'var(--lp-surface)'
      }}
    >
      <div style={{
        width:          44, height: 44,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       22,
        background:     'var(--lp-surface-2)',
        border:         '0.5px solid var(--lp-border)',
        borderRadius:   10,
        flexShrink:     0
      }}>
        {card.emoji}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        8,
          marginBottom: 3
        }}>
          <span style={{
            fontSize:      10,
            color:         'var(--lp-text-muted)',
            fontWeight:    600,
            background:    'var(--lp-surface-2)',
            padding:       '1px 7px',
            borderRadius:  100,
            border:        '0.5px solid var(--lp-border)'
          }}>
            Step {card.step}
          </span>
          <span style={{
            fontSize:   14,
            fontWeight: 600,
            color:      'var(--lp-text)'
          }}>
            {card.title}
          </span>
        </div>
        <div style={{
          fontSize: 12.5,
          color:    'var(--lp-text-muted)',
          lineHeight: 1.5
        }}>
          {card.desc}
        </div>
      </div>

      <div style={{
        fontSize:     18,
        color:        card.available ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
        flexShrink:   0
      }}>
        →
      </div>
    </button>
  )
}