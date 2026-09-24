// PATH: src/components/layout/ClientPortalShell.tsx

import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore }        from '../../store/auth.store'
import { useClientContext }    from '../../hooks/useClientContext'
import { useImpersonationStore } from '../../store/impersonation.store'

import LogoBrand           from '../ui/LogoBrand'
import NotificationBell    from './NotificationBell'
import ImpersonationBanner from '../admin/ImpersonationBanner'
import GlobalChatBubble    from '../workspace-chat/GlobalChatBubble'
import Icon, { type IconName } from '../ui/Icon'

export default function ClientPortalShell() {
  const { profile, signOut } = useAuthStore()
  const { clientId, orgId, isClient, isImpersonating } = useClientContext()
  const navigate = useNavigate()

  const { isImpersonating: storeIsImpersonating } = useImpersonationStore()

  const impersonating = storeIsImpersonating()

  // ✅ FIX: permitir impersonation
  const canAccessPortal = isClient || impersonating

  if (!canAccessPortal) {
    navigate('/', { replace: true })
    return null
  }

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
            fontSize: 10.5,
            color: impersonating ? '#f87171' : '#a78bfa',
            marginTop: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600
          }}>
            {impersonating ? 'Admin View (Client)' : 'Client Portal'}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 10px' }}>
          {([
            { to: '/client',              label: 'Overview',        icon: 'workspace'    as IconName, end: true },
            { to: '/client/transactions', label: 'My Transactions', icon: 'chartBar'     as IconName },
            { to: '/client/invoices',     label: 'My Invoices',     icon: 'invoices'     as IconName },
            { to: '/client/bank',         label: 'Connect Bank',    icon: 'bank'         as IconName },
            { to: '/client/settings',     label: 'Settings',        icon: 'settingsGear' as IconName }
          ]).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              {...(item.end !== undefined ? { end: item.end } : {})}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 11px',
                borderRadius: 8,
                marginBottom: 2,
                textDecoration: 'none',
                fontSize: 13,
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
        <div style={{
          borderTop: '0.5px solid var(--lp-border)',
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: 12.5 }}>
            {profile?.display_name ?? profile?.email ?? 'User'}
          </div>

          <div style={{ fontSize: 10.5, color: '#475569', marginBottom: 10 }}>
            {profile?.email}
          </div>

          <button
            onClick={() => { signOut(); navigate('/') }}
            style={{
              width: '100%',
              border: '0.5px solid var(--lp-border)',
              borderRadius: 7,
              padding: '6px 10px',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--lp-text-muted)',
              fontFamily: 'inherit',
              fontSize: 12.5
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

        {/* 🔴 Banner global */}
        {impersonating && <ImpersonationBanner />}

        {/* Topbar */}
        <div style={{
          height: 44,
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '0 16px',
          borderBottom: '0.5px solid var(--lp-border)'
        }}>
          <NotificationBell />
        </div>

        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>

      {/* Floating chat bubble for client — scoped to their own conversation */}
      {orgId && clientId && (
        <GlobalChatBubble orgId={orgId} clientId={clientId} />
      )}
    </div>
  )
}
