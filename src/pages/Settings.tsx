// PATH: src/pages/Settings.tsx
//
// CSS-TODO (file-level): remaining are slate-400 rgba alphas (0.10/0.25) for chip bg/border and green/red alphas 0.08/0.3 for ok/error toasts. Direct mappings migrated.
//
//
// Role-aware Settings page. Tabs are decided by useUserRole hook.
// Tab content is delegated to sub-components in src/components/settings/.

import { useEffect, useState, type ReactNode } from 'react'
import { useUserRole, USER_KIND_LABELS, USER_KIND_COLORS } from '../hooks/useUserRole'
import { useAuthStore } from '../store/auth.store'

import WorkspaceTab from '../components/settings/WorkspaceTab'
import AccountTab   from '../components/settings/AccountTab'
import TaxInfoTab   from '../components/settings/TaxInfoTab'
import UsersTab     from '../components/settings/UsersTab'
import BillingTab   from '../components/settings/BillingTab'
import BrandingTab  from '../components/settings/BrandingTab'
import Vendors        from './Vendors'
import Worksheet1099  from './Worksheet1099'

import LpUserBadge  from '../components/ui/LpUserBadge'
import { LP_TIER_CONFIG, type LpRole } from '../types/database.types'

type Tab = 'workspace' | 'account' | 'tax' | 'branding' | 'users' | 'billing' | 'vendors' | 'worksheet1099'

// Vendors/Worksheet1099 are full standalone pages with their own
// padding + <h1> chrome (they're also still reachable at their own routes).
// Nested inside a Settings tab panel, this cancels Settings' own container
// padding via negative margin so the embedded page's chrome sits flush,
// instead of double-padding.
function EmbeddedPage({ children }: { children: ReactNode }) {
  return <div style={{ margin: '-28px -32px 0' }}>{children}</div>
}

export default function Settings() {
  const { profile, membership } = useAuthStore()
  const role = useUserRole()

  // ── Build tab list dynamically ─────────────────────────────────────────
  //
  // Order matters: most-used first, billing/admin last.
  // ────────────────────────────────────────────────────────────────────────

  const workspaceLabel =
    role.kind === 'solo_owner'     ? '🏢 My business' :
    role.kind === 'pyme_owner'     ? '🏢 My company'  :
    role.kind === 'pyme_staff'     ? '🏢 My company'  :
    role.kind === 'bookkeeper_owner' ||
    role.kind === 'bookkeeper_admin' ||
    role.kind === 'bookkeeper_staff' ? '🏢 My firm' :
    '🏢 Workspace'

  const usersLabel = role.isSuperAdmin ? '🛡 All Users' : '👥 My Team'

  // Tax info is org-level (state, EIN, business type/code) — meaningful for
  // a personal/solo/pyme workspace's own filing, not for a firm workspace
  // (an accountant/bookkeeper firm's "org" is the practice itself; the tax
  // data that matters there belongs to each CLIENT, managed inside that
  // client's own workspace, not the firm's Settings page).
  const isFirmWorkspace = role.isAccountantFirm || role.isBookkeeperFirm

  // Vendors (1099) and 1099 Worksheet are small-business payroll/contractor
  // tools — relevant to bookkeeper firms (who manage 1099 prep for their
  // small-business clients directly) but not accountant firms (whose CPAs
  // handle that per-client, inside the client's own workspace).
  const tabs: Array<[Tab, string]> = [
    ['workspace', workspaceLabel],
    ['account',   '👤 My account'],
    ...(isFirmWorkspace ? [] : [['tax', '🧾 Tax info'] as [Tab, string]]),
    ['branding',  '🎨 Branding'],
    ...(role.isBookkeeperFirm ? [
      ['vendors',       '🧾 Vendors (1099)'] as [Tab, string],
      ['worksheet1099', '📋 1099 Worksheet'] as [Tab, string]
    ] : []),
    ...(role.canViewUsersTab ? [['users', usersLabel] as [Tab, string]] : []),
    ...(role.showBillingTab  ? [['billing', '💳 Billing'] as [Tab, string]] : [])
  ]

  const [tab, setTab] = useState<Tab>('workspace')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Auto-clear messages
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3500)
    return () => clearTimeout(t)
  }, [msg])

  // If a tab becomes hidden (e.g. role changed), drop back to workspace
  useEffect(() => {
    if (!tabs.find(([t]) => t === tab)) setTab('workspace')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length])

  const workspaceRole = (membership?.role as LpRole) ?? null
  const kindColor = USER_KIND_COLORS[role.kind]

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="lp-page-title">Settings</h1>
        <p className="lp-page-sub">
          {role.kind === 'solo_owner'      ? 'Manage your business and tax information' :
           role.kind === 'pyme_owner'      ? 'Manage your company and team' :
           role.kind === 'bookkeeper_owner' ? 'Manage your firm, team, and billing' :
           role.kind === 'super_admin'     ? 'Platform administration' :
           'Manage your account'}
        </p>
      </div>

      {/* Identity / scope context */}
      <div className="lp-card" style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12
        }}>
          Current access context
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: 10.5, fontWeight: 600,
            padding: '2px 8px', borderRadius: 100,
            color: kindColor, background: `${kindColor}15`,
            border: `0.5px solid ${kindColor}40`,
            letterSpacing: '0.04em', textTransform: 'uppercase'
          }}>
            {USER_KIND_LABELS[role.kind]}
          </span>

          {workspaceRole && (
            <span style={{
              fontSize: 10.5, fontWeight: 600,
              padding: '2px 8px', borderRadius: 100,
              color: 'var(--lp-text-muted)', background: 'rgba(148,163,184,0.10)',
              border: '0.5px solid rgba(148,163,184,0.25)',
              letterSpacing: '0.04em', textTransform: 'capitalize'
            }}>
              {workspaceRole}
            </span>
          )}

          {profile?.tier && profile.tier !== 'user' && (
            <span style={{
              fontSize: 10.5, fontWeight: 600,
              padding: '2px 8px', borderRadius: 100,
              color: LP_TIER_CONFIG[profile.tier].color,
              background: LP_TIER_CONFIG[profile.tier].bg,
              border: `0.5px solid ${LP_TIER_CONFIG[profile.tier].border}`,
              letterSpacing: '0.04em', textTransform: 'uppercase'
            }}>
              {LP_TIER_CONFIG[profile.tier].label}
            </span>
          )}

          {profile?.lp_user_code && (
            <LpUserBadge
              code={profile.lp_user_code}
              tier={profile.tier ?? 'user'}
              size="sm"
              showTier={false}
            />
          )}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 10, lineHeight: 1.6 }}>
          Workspace permissions are based on your{' '}
          <strong style={{ color: 'var(--lp-text-muted)' }}>membership role</strong>.
          {' '}Tier upgrades are managed by{' '}
          <strong style={{ color: 'var(--lp-text-muted)' }}>super admins only</strong>.
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 24,
        borderBottom: '0.5px solid var(--lp-border)', flexWrap: 'wrap'
      }}>
        {tabs.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13,
              color: tab === t ? 'var(--lp-text)' : 'var(--lp-text-muted)',
              fontWeight: tab === t ? 500 : 400,
              borderBottom: `2px solid ${tab === t ? 'var(--lp-accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.12s'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Message bar */}
      {msg && (
        <div style={{
          padding: '9px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.type === 'ok' ? 'rgba(34,197,94,0.08)' : 'var(--sem-red-bg)',
          border: `0.5px solid ${msg.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: msg.type === 'ok' ? 'var(--sem-green)' : 'var(--sem-red)'
        }}>
          {msg.text}
        </div>
      )}

      {/* Tab content */}
      {tab === 'workspace'     && <WorkspaceTab onMessage={setMsg} />}
      {tab === 'account'      && <AccountTab   onMessage={setMsg} />}
      {tab === 'tax'          && <TaxInfoTab   onMessage={setMsg} />}
      {tab === 'branding'     && <BrandingTab  onMessage={setMsg} />}
      {tab === 'vendors'       && role.isBookkeeperFirm && <EmbeddedPage><Vendors /></EmbeddedPage>}
      {tab === 'worksheet1099' && role.isBookkeeperFirm && <EmbeddedPage><Worksheet1099 /></EmbeddedPage>}
      {tab === 'users'        && role.canViewUsersTab && <UsersTab onMessage={setMsg} />}
      {tab === 'billing'      && role.showBillingTab  && <BillingTab onMessage={setMsg} />}
    </div>
  )
}