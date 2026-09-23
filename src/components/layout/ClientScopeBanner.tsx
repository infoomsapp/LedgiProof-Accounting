// PATH: src/components/layout/ClientScopeBanner.tsx
//
// Client Switcher — Sprint 1 (Foundation)
//
// Sticky banner shown when the bookkeeper/accountant firm has entered a client
// context. Provides constant visual feedback of "Working in: {client name}" and
// an explicit exit affordance, plus a horizontal tab bar for navigating between
// client workspace sections.
//
// Bookkeepers see: Transactions, Invoices, Estimates, Bank, Accounts,
//   Reconciliation, Reports, [Payroll]
// Accountants additionally see: Journal Entries, Period Controls
//
// Renders nothing in 'self' scope mode (solo/pyme/personal — no banner needed).

import { useState, useEffect }              from 'react'
import { NavLink, useParams, useNavigate, useLocation, matchPath } from 'react-router-dom'
import { useScope }           from '../../hooks/useScope'
import { useUserRole }        from '../../hooks/useUserRole'
import { useChatBubbleStore } from '../../store/chat-bubble.store'
import WorkspaceChatPanel     from '../workspace-chat/WorkspaceChatPanel'

interface WorkspaceTab {
  to:    string
  label: string
}

const BASE_TABS: WorkspaceTab[] = [
  { to: 'transactions',   label: 'Transactions'   },
  { to: 'invoices',       label: 'Invoices'       },
  { to: 'estimates',      label: 'Estimates'      },
  { to: 'imports',        label: 'Bank'           },
  { to: 'accounts',       label: 'Accounts'       },
  { to: 'reconciliation', label: 'Reconciliation' },
  { to: 'reports',        label: 'Reports'        },
  { to: 'time',           label: 'Time'           },
]

const PAYROLL_TAB: WorkspaceTab = { to: 'payroll', label: 'Payroll'  }
const JOURNAL_TAB: WorkspaceTab = { to: 'journal', label: 'Journal'  }
const PERIODS_TAB: WorkspaceTab = { to: 'periods', label: 'Periods'  }

export default function ClientScopeBanner() {
  const scope      = useScope()
  const navigate   = useNavigate()
  const location   = useLocation()
  const { openChat } = useChatBubbleStore()
  const { clientId } = useParams<{ clientId: string }>()

  // The workspace overview (the card-grid landing page) already links to
  // every section itself — showing this tab bar on top of it duplicates
  // every card as a tab. Only show the tab bar once the user has actually
  // navigated into a section; the overview route gets just the identity strip.
  const isOverviewRoute = matchPath({ path: '/clients/:clientId', end: true }, location.pathname) !== null
  const {
    canViewPayroll,
    canPostJournalEntries,
    canClosePeriods,
    isAccountantFirm,
  } = useUserRole()

  // ── Chat drawer state — must be before any early return ───────────────────
  const [chatOpen,     setChatOpen]     = useState(false)
  const [drawerConvId, setDrawerConvId] = useState<string | null>(null)

  useEffect(() => {
    if (!chatOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setChatOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chatOpen])

  // Only render in firm-client mode WITH a client loaded
  if (scope.scopeMode !== 'firm-client' || !scope.client) return null

  const isInactive = !scope.client.is_active

  const tabs: WorkspaceTab[] = [
    ...BASE_TABS,
    ...(canViewPayroll        ? [PAYROLL_TAB] : []),
    ...(canPostJournalEntries ? [JOURNAL_TAB] : []),
    ...(canClosePeriods       ? [PERIODS_TAB] : []),
  ]

  return (
    <div
      role="banner"
      aria-label="Active client context"
      style={{ flexShrink: 0 }}
    >
      {/* ── Top strip: client identity + exit ── */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        padding:      '7px 16px',
        background:   isInactive
                        ? 'var(--sem-amber-bg)'
                        : 'var(--chat-bubble-mine-bg)',
        borderBottom: '0.5px solid ' + (isInactive
                        ? 'var(--sem-amber-border)'
                        : 'var(--sem-blue-border)'),
        fontSize:     12.5,
      }}>
        <span aria-hidden="true" style={{ fontSize: 14, opacity: isInactive ? 0.85 : 1 }}>
          👤
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--lp-text-muted)', marginRight: 6 }}>
            Working in
          </span>
          <span style={{ fontWeight: 600, color: isInactive ? 'var(--sem-amber)' : 'var(--lp-text)' }}>
            {scope.client.display_name}
          </span>
          {scope.client.company_name && (
            <span style={{ color: 'var(--lp-text-muted)', marginLeft: 6 }}>
              · {scope.client.company_name}
            </span>
          )}
          {isInactive && (
            <span style={{
              marginLeft:    8,
              padding:       '1px 6px',
              borderRadius:  100,
              background:    'var(--sem-amber-bg-strong)',
              color:         'var(--sem-amber)',
              fontSize:      10,
              fontWeight:    600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Inactive
            </span>
          )}
          {/* Firm-type indicator so the user knows which feature set applies */}
          <span style={{
            marginLeft:    10,
            padding:       '1px 7px',
            borderRadius:  100,
            background:    isAccountantFirm ? 'rgba(16,185,129,0.1)' : 'rgba(167,139,250,0.1)',
            color:         isAccountantFirm ? '#10b981' : '#a78bfa',
            fontSize:      10,
            fontWeight:    600,
            letterSpacing: '0.04em',
          }}>
            {isAccountantFirm ? 'Accountant' : 'Bookkeeper'}
          </span>
        </div>

        {/* 💬 Chat drawer toggle */}
        <button
          onClick={() => setChatOpen(v => !v)}
          title="Open client chat"
          style={{
            background:   chatOpen ? 'rgba(167,139,250,0.15)' : 'transparent',
            border:       `0.5px solid ${chatOpen ? 'var(--lp-accent)' : 'var(--lp-border)'}`,
            color:        chatOpen ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
            borderRadius: 6,
            padding:      '4px 10px',
            fontSize:     11.5,
            fontWeight:   500,
            cursor:       'pointer',
            fontFamily:   'inherit',
            display:      'flex',
            alignItems:   'center',
            gap:          4,
            whiteSpace:   'nowrap',
          }}
          onMouseEnter={e => {
            if (!chatOpen) e.currentTarget.style.background = 'var(--lp-surface-2)'
          }}
          onMouseLeave={e => {
            if (!chatOpen) e.currentTarget.style.background = 'transparent'
          }}
        >
          💬 Chat
        </button>

        <button
          onClick={() => navigate('/clients')}
          title="Return to the client list"
          style={{
            background:   'transparent',
            border:       '0.5px solid var(--lp-border)',
            color:        'var(--lp-text-muted)',
            borderRadius: 6,
            padding:      '4px 10px',
            fontSize:     11.5,
            fontWeight:   500,
            cursor:       'pointer',
            fontFamily:   'inherit',
            display:      'flex',
            alignItems:   'center',
            gap:          4,
            whiteSpace:   'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          ← Exit to firm
        </button>
      </div>

      {/* ── Tab navigation bar — hidden on the overview route, see isOverviewRoute ── */}
      {!isOverviewRoute && (
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          2,
          padding:      '0 12px',
          background:   'var(--lp-surface)',
          borderBottom: '0.5px solid var(--lp-border)',
          overflowX:    'auto',
        }}>
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={`/clients/${clientId}/${tab.to}`}
              className={({ isActive }) => `lp-workspace-tab${isActive ? ' active' : ''}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      )}

      {/* ── Chat drawer ─────────────────────────────────────────────────────── */}
      {chatOpen && scope.orgId && scope.clientId && (
        <>
          {/* Backdrop */}
          <div
            aria-hidden
            onClick={() => setChatOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.22)',
              zIndex: 800,
            }}
          />

          {/* Drawer panel */}
          <div
            role="dialog"
            aria-label={`Chat with ${scope.client?.display_name ?? 'client'}`}
            style={{
              position:      'fixed',
              right:         0,
              top:           0,
              bottom:        0,
              width:         400,
              background:    'var(--lp-surface)',
              borderLeft:    '0.5px solid var(--lp-border)',
              boxShadow:     '-6px 0 28px rgba(0,0,0,0.18)',
              display:       'flex',
              flexDirection: 'column',
              zIndex:        801,
            }}
          >
            {/* Drawer header */}
            <div style={{
              padding:      '11px 14px',
              borderBottom: '0.5px solid var(--lp-border)',
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              flexShrink:   0,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize:      10,
                  fontWeight:    700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color:         'var(--lp-text-muted)',
                  marginBottom:  2,
                }}>
                  Client Chat
                </div>
                <div style={{
                  fontSize:     13,
                  fontWeight:   600,
                  color:        'var(--lp-text)',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}>
                  {scope.client?.display_name ?? '…'}
                </div>
              </div>

              <button
                onClick={() => {
                  openChat(scope.clientId ?? undefined)
                  setChatOpen(false)
                }}
                title="Open full chat view"
                style={{
                  background:   'transparent',
                  border:       '0.5px solid var(--lp-border)',
                  color:        'var(--lp-text-muted)',
                  borderRadius: 6,
                  padding:      '4px 9px',
                  fontSize:     11,
                  fontWeight:   500,
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                  whiteSpace:   'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                ↗ Full view
              </button>

              <button
                onClick={() => setChatOpen(false)}
                title="Close chat"
                style={{
                  background: 'transparent',
                  border:     'none',
                  color:      'var(--lp-text-muted)',
                  fontSize:   16,
                  lineHeight: 1,
                  padding:    '2px 4px',
                  cursor:     'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ✕
              </button>
            </div>

            {/* WorkspaceChatPanel — compact, scoped to this client */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 8 }}>
              <WorkspaceChatPanel
                orgId={scope.orgId}
                clientId={scope.clientId}
                compact
                onActiveConversationChange={(convId) => setDrawerConvId(convId)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
