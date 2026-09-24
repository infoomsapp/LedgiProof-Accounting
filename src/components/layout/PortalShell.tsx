// PATH: src/components/layout/PortalShell.tsx
//
// Shell for a client invited to a firm's client portal (client_portal_users)
// — NOT the same product as ClientPortalShell.tsx, which is for the
// self-service PYME tier (their own bank connection, their own raw
// transactions, reached via /client and organization_memberships). A
// firm-invited client never gets an org membership; their bookkeeper
// manages the books, they just view the results, exchange documents, and
// chat. Reusing ClientPortalShell for both would mix two different
// products behind one nav.

import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useClientPortalStore } from '../../store/client-portal.store'
import LogoBrand from '../ui/LogoBrand'
import NotificationBell from './NotificationBell'
import GlobalChatBubble from '../workspace-chat/GlobalChatBubble'
import Icon, { type IconName } from '../ui/Icon'

export default function PortalShell() {
  const { profile, signOut } = useAuthStore()
  const { memberships, activeMembershipId, setActiveMembership } = useClientPortalStore()
  const navigate = useNavigate()

  const activeMembership = memberships.find(m => m.membershipId === activeMembershipId) ?? null

  return (
    <div style={{
      display: 'flex', height: '100vh', width: '100vw',
      background: 'var(--lp-bg)', color: 'var(--lp-text)',
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 14
    }}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside style={{
        width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '0.5px solid var(--lp-border)',
        background: 'var(--lp-surface)'
      }}>

        <div className="titlebar-drag" style={{ height: 32 }} />

        <div style={{ padding: '8px 16px 16px' }}>
          <LogoBrand variant="compact" />

          <div style={{
            fontSize: 10.5, color: '#a78bfa', marginTop: 6,
            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600
          }}>
            Client Portal
          </div>

          {/* Firm/client switcher — only shown when invited by more than one */}
          {memberships.length > 1 ? (
            <select
              className="lp-input"
              style={{ marginTop: 10, fontSize: 12 }}
              value={activeMembershipId ?? ''}
              onChange={e => setActiveMembership(e.target.value)}
            >
              {memberships.map(m => (
                <option key={m.membershipId} value={m.membershipId}>
                  {m.clientName} · {m.orgName}
                </option>
              ))}
            </select>
          ) : activeMembership && (
            <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--lp-text)' }}>{activeMembership.clientName}</strong>
              <br />
              {activeMembership.orgName}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 10px' }}>
          {([
            { to: '/portal',            label: 'Overview',  icon: 'chartBar' as IconName, end: true },
            { to: '/portal/documents',  label: 'Documents', icon: 'folder'   as IconName, end: false }
          ]).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 11px', borderRadius: 8, marginBottom: 2,
                textDecoration: 'none', fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? 'var(--lp-text)' : 'var(--lp-text-muted)',
                background: isActive ? 'rgba(167,139,250,0.1)' : 'transparent'
              })}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}><Icon name={item.icon} size={14} /></span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ borderTop: '0.5px solid var(--lp-border)', padding: '12px 14px' }}>
          <div style={{ fontSize: 12.5 }}>{profile?.display_name ?? profile?.email ?? 'User'}</div>
          <div style={{ fontSize: 10.5, color: '#475569', marginBottom: 10 }}>{profile?.email}</div>
          <button
            onClick={() => { signOut(); navigate('/') }}
            style={{
              width: '100%', border: '0.5px solid var(--lp-border)', borderRadius: 7,
              padding: '6px 10px', cursor: 'pointer', background: 'transparent',
              color: 'var(--lp-text-muted)', fontFamily: 'inherit', fontSize: 12.5
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--lp-text)'; e.currentTarget.style.background = 'var(--lp-surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--lp-text-muted)'; e.currentTarget.style.background = 'transparent' }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          height: 44, display: 'flex', justifyContent: 'flex-end',
          padding: '0 16px', borderBottom: '0.5px solid var(--lp-border)'
        }}>
          <NotificationBell />
        </div>

        <main style={{ flex: 1, overflow: 'auto' }}>
          {activeMembership ? <Outlet context={activeMembership} /> : (
            <div style={{ padding: 32, color: 'var(--lp-text-muted)', fontSize: 13 }}>
              No client portal access found for your account.
            </div>
          )}
        </main>
      </div>

      {activeMembership && (
        <GlobalChatBubble orgId={activeMembership.orgId} clientId={activeMembership.clientId} />
      )}
    </div>
  )
}
