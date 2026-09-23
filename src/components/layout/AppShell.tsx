// PATH: src/components/layout/AppShell.tsx
import type { CSSProperties } from 'react'
import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation, matchPath } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore }       from '../../store/auth.store'
import MfaRequired            from '../../pages/MfaRequired'
import { useOrgStore }        from '../../store/org.store'
import { useThemeStore }      from '../../store/theme.store'
import { useImpersonationStore } from '../../store/impersonation.store'
import { classifyOrg, describeOrgCategory } from '../../lib/org-helpers'
import { useUserRole } from '../../hooks/useUserRole'
import LogoBrand              from '../ui/LogoBrand'
import LpUserBadge            from '../ui/LpUserBadge'
import OrgSelector            from './OrgSelector'
import NotificationBell       from './NotificationBell'
import GlobalSearch           from './GlobalSearch'
import ImpersonationBanner    from '../admin/ImpersonationBanner'
import { LP_TIER_CONFIG }     from '../../types/database.types'
import type { AccountType }   from '../../types/database.types'
import GlobalChatBubble       from '../workspace-chat/GlobalChatBubble'

interface NavItem {
  to:    string
  label: string
  end:   boolean
  icon:  string
}

// ── Bookkeeper firm nav — trimmed to the 5 real, functional firm-level
// destinations. Estimates/Invoices/Chart of Accounts/Payroll are dropped:
// their top-level routes are FirmRouteRedirect-gated and bounce any firm
// user with no clientId straight to /clients — they were dead links here.
// The real per-client versions still work fine from inside a client's own
// workspace (Clients → client → tab bar). Vendors (1099) and 1099 Worksheet
// move into Settings (see Settings.tsx's isBookkeeperFirm-gated tabs).
// NOTE: `label` holds an i18n KEY (e.g. 'nav.home'), not display text —
// these arrays are module-level constants evaluated once at import time,
// long before any component (or i18next) renders, so they can't call t()
// themselves. Every render site below calls t(item.label) instead.
const BOOKKEEPER_NAV: NavItem[] = [
  { to: '/',         label: 'nav.home', end: true,  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/clients',  label: 'nav.clients',   end: false, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { to: '/notes',    label: 'nav.notes',     end: false, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { to: '/team',     label: 'nav.team',      end: false, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z' },
  { to: '/reports',  label: 'nav.reports',   end: false, icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { to: '/settings', label: 'nav.settings',  end: false, icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' }
]

// ── Accountant firm nav — same 5 firm-level destinations as bookkeeper.
// No Vendors (1099)/1099 Worksheet tabs — those are small-business
// payroll/contractor tools CPAs manage per-client, not firm-wide.
const ACCOUNTANT_NAV: NavItem[] = BOOKKEEPER_NAV

// ── Self-employed / Solo simplified nav ──────────────────────────────────────
const SELF_EMPLOYED_NAV: NavItem[] = [
  { to: '/',             label: 'nav.home',        end: true,  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/transactions', label: 'nav.transactions',     end: false, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { to: '/estimates',    label: 'nav.estimates',        end: false, icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { to: '/invoices',     label: 'nav.invoices',         end: false, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { to: '/imports',      label: 'nav.bankConnections', end: false, icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
  { to: '/reports',      label: 'nav.reports',          end: false, icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' }
]

// 🆕 Payroll — NOT baked into BOOKKEEPER_NAV/SELF_EMPLOYED_NAV directly
// because SELF_EMPLOYED_NAV is shared by solo AND pyme orgs (see NAV
// computation below), and Payroll must be visible to pyme_owner/staff but
// NOT to solo_owner. Appended conditionally via useUserRole().canViewPayroll
// instead — a real boolean permissions flag, per LedgiProof's CBAC rule,
// rather than checking raw roles here.
const PAYROLL_NAV: NavItem = {
  to:    '/payroll',
  label: 'nav.payroll',
  end:   false,
  icon:  'M17 9V7a4 4 0 00-8 0v2M5 9h14l1 11H4L5 9zm7 3v4'
}

// Special nav item for super admins
const ADMIN_NAV: NavItem = {
  to:    '/admin',
  label: 'nav.superAdmin',
  end:   false,
  icon:  'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
}

// While a firm user is inside a client workspace (/clients/:clientId/*),
// ClientScopeBanner's tab bar already covers Transactions/Invoices/Estimates/
// Bank/Accounts/Reconciliation/Reports/Payroll/Journal/Periods for THIS
// client — repeating the full firm-level nav in the sidebar at the same time
// just duplicates those destinations (and confusingly points at the FIRM's
// own data, not the client's, since sidebar links are always firm-scoped).
// Trim to the few links that are genuinely firm-level: home, switch client,
// team.
const CLIENT_WORKSPACE_NAV: NavItem[] = [
  { to: '/',        label: 'nav.home', end: true,  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/clients', label: 'nav.clients',   end: false, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { to: '/team',    label: 'nav.team',      end: false, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z' },
]

// Compact icon button for the top-right account cluster.
const topIconBtn: CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--lp-text-muted)', padding: 5, borderRadius: 7,
  display: 'flex', alignItems: 'center', transition: 'color 0.12s'
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

// Roles that must have MFA. Mirrors WRITE_ROLES from resolve-transaction.
// Temporarily disabled (explicit request, 2026-09-23): forcing MFA on every
// owner/admin/accountant/approver blocked sign-in for accounts that hadn't
// enrolled yet, with no skip option besides signing out. Left as an empty
// set instead of deleting the gate so it's a one-line flip to bring back
// once the enrollment UX itself is ready to be mandatory. 2FA is still
// available to any user from Settings -> My account (MfaSetup.tsx).
const MFA_REQUIRED_ROLES = new Set<string>([])

export default function AppShell() {
  const { t } = useTranslation()
  const { profile, membership, signOut, getMfaFactors } = useAuthStore()
  const { activeOrg }        = useOrgStore()
  const { mode: themeMode, toggle: toggleTheme } = useThemeStore()
  const navigate             = useNavigate()
  const isImpersonating       = useImpersonationStore(s => s.isImpersonating())
  const { canViewPayroll, isAccountantFirm, isBookkeeperFirm, workspaceRole } = useUserRole()

  // ── Mandatory MFA gate ────────────────────────────────────────────────────
  // null  = pending (workspaceRole not yet set — OrgSelector hasn't fired)
  // false = not required (role exempt or already enrolled)
  // true  = required  → render enrollment wall instead of the full shell
  const [mfaGateRequired, setMfaGateRequired] = useState<boolean | null>(null)

  useEffect(() => {
    if (!workspaceRole) return              // wait for OrgSelector to set membership
    if (!MFA_REQUIRED_ROLES.has(workspaceRole)) {
      setMfaGateRequired(false)            // role exempt
      return
    }

    getMfaFactors().then(factors => {
      const hasVerified = factors.some(f => f.status === 'verified')
      setMfaGateRequired(!hasVerified)
    })
  }, [workspaceRole, getMfaFactors])

  // MFA required and not enrolled → show enrollment wall instead of the shell.
  // We do NOT block rendering while mfaGateRequired is null — that would
  // prevent OrgSelector from mounting, deadlocking the membership resolution.
  if (mfaGateRequired === true) {
    return (
      <MfaRequired
        onMfaEnrolled={() => setMfaGateRequired(false)}
      />
    )
  }
  // ─────────────────────────────────────────────────────────────────────────

  // While "view as" is active, the whole point is to see exactly what that
  // org/user sees — a real accountant or bookkeeper never has Super Admin
  // access, so the nav item (and its capabilities) must disappear during
  // impersonation, not just show a banner on top of an otherwise-unchanged
  // super_admin UI. It reappears automatically once "Exit admin view" is
  // clicked (isImpersonating() flips back to false).
  const isSuperAdmin = profile?.system_role === 'super_admin' && !isImpersonating

  // Firm user is inside a specific client's workspace — see CLIENT_WORKSPACE_NAV's comment.
  const location = useLocation()
  const inClientWorkspace = matchPath('/clients/:clientId/*', location.pathname) !== null

  // 🔑 Workspace decision based on system_role (the source of truth for permissions)
  // Professional roles see the full bookkeeper UI; only 'user' or 'client' fall to Solo.
  const PROFESSIONAL_ROLES = ['super_admin', 'admin', 'bookkeeper', 'auditor'] as const
  const isProfessional = profile?.system_role
    ? (PROFESSIONAL_ROLES as readonly string[]).includes(profile.system_role)
    : false

  // account_type is now only used as a UX subtype (e.g. for badge labels)
  const accountType: AccountType = (profile?.account_type as AccountType) ?? 'self_employed'

  // 🆕 P5.A — Detect when a bookkeeper is currently viewing their personal org.
  // Used to show a visual banner ("You're in Personal mode") that prevents
  // the bookkeeper from accidentally treating personal bank/transactions as
  // firm/client work. Only shows when relevant (firm-capable user + personal active).
  const orgCategory = classifyOrg(activeOrg, accountType)
  const isBookkeeperPersonalMode =
    profile?.system_role === 'bookkeeper' && orgCategory === 'personal'

  // 🆕 View As nav split:
  //   · Pure super_admin (native login, not impersonating) → NO profile-type
  //     nav at all. Super admin is support-only, not "just another client" —
  //     it never natively gets Solo/Bookkeeper/Accountant/PYME buttons.
  //   · Impersonating → nav must reflect the TARGET org's real category
  //     (from activeOrg via classifyOrg), never the actor's own system_role
  //     (which is always 'super_admin' and would otherwise always resolve
  //     to the full Bookkeeper nav regardless of what's being viewed).
  //   · Normal customer session → existing isProfessional-based logic.
  // 🐛 Real bug fixed: a professional user (bookkeeper/accountant system_role)
  // whose ACTIVE org is their own personal one used to still get BOOKKEEPER_NAV
  // or ACCOUNTANT_NAV here — isProfessional/isAccountantFirm never checked
  // orgCategory, only the impersonating branch below them did. That silently
  // swapped out every functional personal-account button (Transactions/
  // Estimates/Invoices/Bank Connections) for the firm-oriented Clients/Notes/
  // Team list, which doesn't apply to a personal org at all. Personal mode
  // now takes priority over the professional/firm checks, mirroring exactly
  // what the impersonating branch already did correctly.
  const baseNav: NavItem[] = isSuperAdmin
    ? []
    : orgCategory === 'personal'
      ? SELF_EMPLOYED_NAV
      : isImpersonating
        ? (orgCategory === 'firm'
            ? (isAccountantFirm ? ACCOUNTANT_NAV : BOOKKEEPER_NAV)
            : SELF_EMPLOYED_NAV)
        : (isAccountantFirm
            ? ACCOUNTANT_NAV
            : isProfessional
              ? BOOKKEEPER_NAV
              : SELF_EMPLOYED_NAV)

  // Payroll is appended (not baked into the base arrays) so it can be
  // shown to pyme orgs but hidden from solo — see PAYROLL_NAV's comment.
  // Excluded for any firm context (accountant OR bookkeeper): /payroll is
  // FirmRouteRedirect-gated with no clientId in the URL here, so it's a dead
  // link at the top level for both firm types — same reasoning that already
  // dropped Estimates/Invoices/Chart of Accounts from BOOKKEEPER_NAV. The
  // real per-client Payroll access still works fine via ClientScopeBanner's
  // own tab. Inside a client workspace, trim to CLIENT_WORKSPACE_NAV
  // regardless of firm type — the client's own tab bar already covers
  // everything else for THIS client.
  const NAV: NavItem[] = inClientWorkspace
    ? CLIENT_WORKSPACE_NAV
    : (canViewPayroll && !isAccountantFirm && !isBookkeeperFirm ? [...baseNav, PAYROLL_NAV] : baseNav)

  const orgId = membership?.org_id ?? null

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initials = (profile?.display_name ?? profile?.email ?? '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--lp-bg)' }}>

      <ImpersonationBanner />

      {/* 🆕 P5.A — Personal-mode banner.
          Visible only when a bookkeeper has switched to their personal org.
          Prevents accidental cross-contamination (e.g., adding a client's
          bank account while viewing personal books). */}
      {isBookkeeperPersonalMode && (
        <div style={{
          padding:      '6px 16px',
          background:   'var(--chat-bubble-internal-bg)',
          borderBottom: '0.5px solid var(--chat-bubble-internal-border)',
          color:        'var(--lp-violet)',
          fontSize:     11.5,
          fontWeight:   500,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          gap:          8
        }}>
          <span>👤</span>
          <span>
            You're in <strong>Personal mode</strong> — these are your own books, not your firm's clients.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width:          'var(--sidebar-width)',
          flexShrink:     0,
          background:     'var(--lp-surface)',
          borderRight:    '0.5px solid var(--lp-border)',
          display:        'flex',
          flexDirection:  'column',
          padding:        '0 0 12px'
        }}>

          {/* Logo area */}
          <div className="titlebar-drag" style={{
            padding:      '16px 14px 14px',
            borderBottom: '0.5px solid var(--lp-border)',
            userSelect:   'none'
          }}>
            <LogoBrand variant="sidebar" />
            <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', marginTop: 5, marginLeft: 40 }}>
              {!isProfessional && (
                <span style={{ color: '#3b82f6' }}>Solo</span>
              )}
              {isProfessional && !isSuperAdmin && isAccountantFirm && (
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>Accountant Firm</span>
              )}
              {isProfessional && !isSuperAdmin && !isAccountantFirm && (
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>Bookkeeper Firm</span>
              )}
            </div>
          </div>

          <div style={{ padding: '8px 8px 0' }}>
            <OrgSelector />
          </div>

          <nav style={{
            flex: 1, padding: '10px 8px',
            display: 'flex', flexDirection: 'column', gap: 4
          }}>
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `lp-nav-item${isActive ? ' active' : ''}`}
              >
                <NavIcon d={item.icon} />
                {t(item.label)}
              </NavLink>
            ))}

            {isSuperAdmin && (
              <>
                <div style={{
                  margin: '14px 10px 6px', fontSize: 10, fontWeight: 600,
                  color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em'
                }}>
                  Olympus Mont
                </div>
                <NavLink
                  to={ADMIN_NAV.to}
                  end={ADMIN_NAV.end}
                  style={({ isActive }) => ({
                    display:        'flex',
                    alignItems:     'center',
                    gap:            9,
                    padding:        '7px 10px',
                    borderRadius:   7,
                    textDecoration: 'none',
                    fontSize:       13,
                    fontWeight:     isActive ? 600 : 500,
                    color:          isActive ? '#fff' : '#ef4444',
                    background:     isActive ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.05)',
                    border:         `0.5px solid ${isActive ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.2)'}`,
                    transition:     'all 0.1s'
                  })}
                >
                  <NavIcon d={ADMIN_NAV.icon} />
                  {t(ADMIN_NAV.label)}
                </NavLink>
              </>
            )}
          </nav>

        </aside>

        {/* ── Main content ───────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            height: 44, flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '0 16px',
            borderBottom: '0.5px solid var(--lp-border)',
            background: 'var(--lp-surface)'
          }}>
            <GlobalSearch />

            {/* Account cluster — moved from the sidebar bottom to the top-right
                (QuickBooks-style): notifications, theme, settings, user, sign out. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <NotificationBell />

              <button
                onClick={toggleTheme}
                title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                style={topIconBtn}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--lp-accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--lp-text-muted)')}
              >
                {themeMode === 'dark' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>

              <NavLink to="/settings" title="Settings"
                className={({ isActive }) => (isActive ? 'active' : undefined)}
                style={({ isActive }) => ({ ...topIconBtn, color: isActive ? 'var(--lp-accent)' : 'var(--lp-text-muted)', textDecoration: 'none' })}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </NavLink>

              <div style={{ width: 1, height: 22, background: 'var(--lp-border)' }} />

              {/* User identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{ textAlign: 'right', minWidth: 0, maxWidth: 160 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2
                  }}>
                    {profile?.display_name ?? profile?.email ?? 'User'}
                  </div>
                  {profile?.lp_user_code && (
                    <LpUserBadge code={profile.lp_user_code} tier={profile.tier ?? 'user'} size="sm" showTier={false} />
                  )}
                </div>

                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: isSuperAdmin ? 'var(--sem-red-bg)'
                    : (profile?.tier ? LP_TIER_CONFIG[profile.tier].bg : 'var(--sem-blue-bg)'),
                  border: `1px solid ${isSuperAdmin ? 'var(--sem-red-border)'
                    : (profile?.tier ? LP_TIER_CONFIG[profile.tier].border : 'var(--lp-accent)')}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  color: isSuperAdmin ? 'var(--sem-red)'
                    : (profile?.tier ? LP_TIER_CONFIG[profile.tier].color : 'var(--lp-accent)')
                }}>
                  {initials}
                </div>
              </div>

              <button onClick={handleSignOut} title="Sign out" style={topIconBtn}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--sem-red)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--lp-text-muted)')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
              </button>
            </div>
          </div>

          <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <Outlet />
          </main>
        </div>

      </div>

      {/* Global chat bubble — visible on all pages for professionals with an
          org, EXCEPT while in Personal mode: a personal org has no clients
          to chat with, only the accountant/bookkeeper's own books. (If a
          future "chat with your team" feature gets built for Personal mode,
          this is where it'd need to persist instead of being hidden.) */}
      {!isSuperAdmin && orgId && isProfessional && orgCategory !== 'personal' && (
        <GlobalChatBubble orgId={orgId} />
      )}
    </div>
  )
}