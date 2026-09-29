// PATH: src/components/layout/OrgSelector.tsx
//
// The workspace switcher at the top of the sidebar. ONE control, never two:
//
//   · Bookkeepers/accountants with a firm get the Personal / Firm toggle and
//     nothing under it. Tapping the other side switches to it. Tapping the
//     side you are on (it shows ▾ when there is something to choose) opens a
//     short menu: the organizations on that side, plus "Create organization"
//     when the plan allows another workspace (get_workspace_allowance, the
//     same plan_features limit create_workspace_org enforces).
//   · Everyone else sees the workspace name; it becomes that same menu only
//     when there is a second organization or the plan allows creating one.
//
// A bookkeeper without a personal workspace yet sees "Personal +", which opens
// CreatePersonalOrgDialog (firm plans include the firm + a personal workspace).

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useOrgStore }   from '../../store/org.store'
import { useAuthStore }  from '../../store/auth.store'
import { db }            from '../../lib/supabase'
import SemaphoreSpinner   from '../ui/SemaphoreSpinner'
import CreatePersonalOrgDialog from './CreatePersonalOrgDialog'
import CreateOrgDialog   from './CreateOrgDialog'
import { partitionOrgs, classifyOrg, describeOrgCategory } from '../../lib/org-helpers'
import { getWorkspaceAllowance, type WorkspaceAllowance } from '../../services/org.service'
import Icon, { type IconName } from '../ui/Icon'
import type { Organization, OrganizationMembership, AccountType, SystemRole } from '../../types/database.types'

// Roles for which the Personal/Firm toggle is meaningful (vs. pyme_client/auditor)
const TOGGLE_ELIGIBLE_ROLES: SystemRole[] = ['bookkeeper', 'admin', 'super_admin']

type Side = 'personal' | 'firm'

export default function OrgSelector() {
  const { t } = useTranslation()
  const { orgs, activeOrg, setActiveOrg } = useOrgStore()
  const { profile, membership }           = useAuthStore()
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [switching,    setSwitching]    = useState<string | null>(null)
  const [personalOpen, setPersonalOpen] = useState(false)
  const [createOpen,   setCreateOpen]   = useState(false)
  const [allowance,    setAllowance]    = useState<WorkspaceAllowance | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const accountType = (profile?.account_type as AccountType | null) ?? null
  const systemRole  = profile?.system_role ?? null
  const { personal: personalOrgs, firm: firmOrgs } = partitionOrgs(orgs, accountType)

  const isToggleEligibleRole =
    systemRole !== null && (TOGGLE_ELIGIBLE_ROLES as readonly string[]).includes(systemRole)
  const hasToggle   = isToggleEligibleRole && firmOrgs.length >= 1
  const hasPersonal = personalOrgs.length >= 1
  const activeSide: Side = classifyOrg(activeOrg, accountType) === 'firm' ? 'firm' : 'personal'
  const canCreate   = !!allowance?.can_create

  // Re-checked whenever the list of organizations changes (one was created).
  useEffect(() => {
    if (!profile?.id) return
    let alive = true
    getWorkspaceAllowance()
      .then(a => { if (alive) setAllowance(a) })
      .catch(() => { if (alive) setAllowance(null) })   // no offer to create; switching still works
    return () => { alive = false }
  }, [profile?.id, orgs.length])

  // Close the menu on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function switchOrg(org: Organization) {
    if (org.id === activeOrg?.id || !profile?.id) return
    setSwitching(org.id)
    const { data: mem } = await db
      .from('organization_memberships')
      .select('*')
      .eq('user_id', profile.id)
      .eq('org_id', org.id)
      .eq('is_active', true)
      .single()
    if (mem) setActiveOrg(org, mem as OrganizationMembership)
    setSwitching(null)
    setMenuOpen(false)
  }

  // The organizations the menu lists: the active side (toggle), or all of them.
  const menuOrgs = hasToggle ? (activeSide === 'firm' ? firmOrgs : personalOrgs) : orgs
  const hasMenu  = menuOrgs.length > 1 || canCreate

  async function onSide(side: Side) {
    if (side === activeSide) {
      if (hasMenu) setMenuOpen(o => !o)
      return
    }
    if (side === 'personal' && !hasPersonal) {
      setPersonalOpen(true)
      return
    }
    const next = (side === 'personal' ? personalOrgs : firmOrgs)[0]
    if (next) await switchOrg(next)
  }

  async function switchToNew(orgId: string) {
    const created = useOrgStore.getState().orgs.find(o => o.id === orgId)
    if (created) await switchOrg(created)
  }

  const menu = menuOpen && (
    <div style={{
      position: 'absolute', top: '100%', left: -10, right: -10, marginTop: 4,
      background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border-2)',
      borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 200,
      overflow: 'hidden', padding: '4px 0'
    }}>
      {menuOrgs.map(org => {
        const isActive = org.id === activeOrg?.id
        const desc     = describeOrgCategory(classifyOrg(org, accountType))
        return (
          <button
            key={org.id}
            onClick={() => { void switchOrg(org) }}
            disabled={isActive || !!switching}
            style={{
              width: '100%', background: 'none', border: 'none', padding: '9px 14px',
              cursor: isActive ? 'default' : 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit'
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--chat-row-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0,
              background: isActive ? 'var(--chat-bubble-mine-bg)' : 'var(--lp-surface-2)',
              border: `1px solid ${isActive ? 'var(--chat-bubble-mine-border)' : 'var(--lp-border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Icon name={desc.icon} size={13} />
            </div>
            <div style={{
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: 12.5, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--lp-text)' : 'var(--lp-text-muted)'
            }}>
              {org.name}
            </div>
            {isActive && <span style={{ color: 'var(--lp-accent)', fontSize: 13 }}>✓</span>}
            {switching === org.id && <SemaphoreSpinner size="md" inline />}
          </button>
        )
      })}
      {canCreate && (
        <>
          <div style={{ borderTop: '0.5px solid var(--lp-border)', margin: '4px 0' }} />
          <button
            onClick={() => { setMenuOpen(false); setCreateOpen(true) }}
            style={{
              width: '100%', background: 'none', border: 'none', padding: '8px 14px',
              cursor: 'pointer', textAlign: 'left', fontSize: 12.5, color: 'var(--lp-accent)',
              fontWeight: 500, fontFamily: 'inherit'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-row-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >
            + {t('workspaces.createMenu')}
          </button>
        </>
      )}
    </div>
  )

  const dialogs = (
    <>
      <CreatePersonalOrgDialog
        open={personalOpen}
        onClose={() => setPersonalOpen(false)}
        onCreated={id => { void switchToNew(id) }}
      />
      <CreateOrgDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={id => { void switchToNew(id) }}
      />
    </>
  )

  // ── Personal / Firm toggle: the only control ─────────────────────────────
  if (hasToggle) {
    return (
      <div ref={ref} style={{ padding: '6px 10px 8px', borderBottom: '0.5px solid var(--lp-border)', marginTop: -4, position: 'relative' }}>
        <div style={{
          display: 'flex', gap: 4, padding: 2,
          background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)', borderRadius: 7
        }}>
          <ModeToggleBtn
            label={hasPersonal ? t('workspaces.personal') : `${t('workspaces.personal')} +`}
            icon="person"
            active={activeSide === 'personal'}
            hasMenu={activeSide === 'personal' && hasMenu}
            disabled={!!switching}
            isPlaceholder={!hasPersonal}
            title={activeSide === 'personal' ? activeOrg?.name : undefined}
            onClick={() => { void onSide('personal') }}
          />
          <ModeToggleBtn
            label={t('workspaces.firm')}
            icon="building"
            active={activeSide === 'firm'}
            hasMenu={activeSide === 'firm' && hasMenu}
            disabled={!!switching}
            title={activeSide === 'firm' ? activeOrg?.name : undefined}
            onClick={() => { void onSide('firm') }}
          />
        </div>
        {menu}
        {dialogs}
      </div>
    )
  }

  // ── Everyone else: the workspace name, a menu only when there is a choice ─
  return (
    <div ref={ref} style={{ padding: '6px 10px 8px', borderBottom: '0.5px solid var(--lp-border)', marginTop: -4, position: 'relative' }}>
      <button
        onClick={() => { if (hasMenu) setMenuOpen(o => !o) }}
        disabled={!hasMenu}
        style={{
          width: '100%', background: 'none', border: 'none', padding: 0,
          cursor: hasMenu ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
          }}>
            {activeOrg?.name ?? '—'}
          </div>
          {hasMenu && (
            <span style={{
              fontSize: 9, color: 'var(--lp-text-muted)',
              transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s'
            }}>▼</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 1 }}>{membership?.role ?? ''}</div>
      </button>
      {menu}
      {dialogs}
    </div>
  )
}

// ── Mode toggle button (the Personal/Firm pill) ─────────────────────────────

function ModeToggleBtn({
  label, icon, active, hasMenu, disabled, isPlaceholder, title, onClick
}: {
  label:    string
  icon:     IconName
  active:   boolean
  /** The active side has a menu (another organization, or one can be created). */
  hasMenu?: boolean
  disabled: boolean
  /** No workspace on this side yet: the button is a "create" call to action. */
  isPlaceholder?: boolean
  title?:   string | undefined
  onClick:  () => void
}) {
  const clickable = !disabled && (!active || hasMenu)
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      title={isPlaceholder ? 'Create your personal workspace' : title}
      style={{
        flex:          1,
        padding:       '5px 8px',
        background:    active ? 'var(--lp-surface)' : 'transparent',
        border:        active ? '0.5px solid var(--lp-border)' :
                       isPlaceholder ? '0.5px dashed var(--lp-border)' :
                       '0.5px solid transparent',
        borderRadius:  5,
        color:         active ? 'var(--lp-text)' : 'var(--lp-text-muted)',
        fontSize:      11.5,
        fontWeight:    active ? 600 : 400,
        fontStyle:     isPlaceholder ? 'italic' : 'normal',
        fontFamily:    'inherit',
        cursor:        clickable ? 'pointer' : 'default',
        display:       'flex',
        alignItems:    'center',
        justifyContent: 'center',
        gap:           4,
        transition:    'background 0.12s, opacity 0.12s'
      }}
    >
      <Icon name={icon} size={12} />
      <span>{label}</span>
      {hasMenu && <span aria-hidden style={{ fontSize: 8, color: 'var(--lp-text-muted)', marginLeft: 1 }}>▼</span>}
    </button>
  )
}
