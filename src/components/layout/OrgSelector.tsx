// PATH: src/components/layout/OrgSelector.tsx
// Dropdown panel that appears when user clicks the workspace name in sidebar.
// Shows all orgs the user belongs to + active indicator + switch button.
//
// 🆕 P5.A — When the user has BOTH a personal org AND a firm org, surface a
// compact toggle (👤 Personal / 🏢 Firm) at the top for one-tap switching.
//
// 🆕 P5.C — When a bookkeeper has a firm org but NO personal org yet, the
// toggle still appears with the Personal side as a "create-on-click" CTA.
// Clicking it opens CreatePersonalOrgDialog instead of failing silently.

import { useState, useRef, useEffect } from 'react'
import { useOrgStore }   from '../../store/org.store'
import { useAuthStore }  from '../../store/auth.store'
import { db }            from '../../lib/supabase'
import SemaphoreSpinner   from '../ui/SemaphoreSpinner'
import CreatePersonalOrgDialog from './CreatePersonalOrgDialog'
import { partitionOrgs, classifyOrg, describeOrgCategory } from '../../lib/org-helpers'
import Icon, { type IconName } from '../ui/Icon'
import type { Organization, OrganizationMembership, AccountType, SystemRole } from '../../types/database.types'

// Roles for which the Personal/Firm toggle is meaningful (vs. pyme_client/auditor)
const TOGGLE_ELIGIBLE_ROLES: SystemRole[] = ['bookkeeper', 'admin', 'super_admin']

export default function OrgSelector() {
  const { orgs, activeOrg, setActiveOrg, loadOrgs } = useOrgStore()
  const { profile, membership }                      = useAuthStore()
  const [open,        setOpen]        = useState(false)
  const [switching,   setSwitching]   = useState<string | null>(null)
  const [createOpen,  setCreateOpen]  = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 🆕 P5.A — partition orgs into personal/firm/client buckets
  const accountType = (profile?.account_type as AccountType | null) ?? null
  const systemRole  = profile?.system_role ?? null
  const { personal: personalOrgs, firm: firmOrgs } = partitionOrgs(orgs, accountType)

  // 🆕 P5.C — Toggle is visible whenever:
  //   · user is bookkeeper/admin/super_admin, AND
  //   · user has at least 1 firm org (otherwise they're a pure solo, no toggle)
  // The 'Personal' side becomes a create CTA when no personal org exists.
  const isToggleEligibleRole =
    systemRole !== null && (TOGGLE_ELIGIBLE_ROLES as readonly string[]).includes(systemRole)
  const hasToggle = isToggleEligibleRole && firmOrgs.length >= 1

  const hasPersonal = personalOrgs.length >= 1
  const activeCategory = classifyOrg(activeOrg, accountType)
  const activeDesc = describeOrgCategory(activeCategory)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function switchOrg(org: Organization) {
    if (org.id === activeOrg?.id || !profile?.id) return
    setSwitching(org.id)

    // Load membership for this org
    const { data: mem } = await db
      .from('organization_memberships')
      .select('*')
      .eq('user_id', profile.id)
      .eq('org_id', org.id)
      .eq('is_active', true)
      .single()

    if (mem) {
      setActiveOrg(org, mem as OrganizationMembership)
    }

    setSwitching(null)
    setOpen(false)
  }

  // 🆕 P5.A/C — One-tap toggle: pick first personal/firm org and switch.
  // If target is 'personal' and no personal org exists → open create dialog.
  async function switchToCategory(target: 'personal' | 'firm') {
    if (target === 'personal' && !hasPersonal) {
      setCreateOpen(true)
      return
    }
    const pool = target === 'personal' ? personalOrgs : firmOrgs
    const next = pool[0]
    if (!next || next.id === activeOrg?.id) return
    await switchOrg(next)
  }

  // 🆕 P5.C — After the personal org is created, switch to it.
  async function handlePersonalCreated(orgId: string) {
    if (!profile?.id) return
    // loadOrgs was already called inside the dialog; activeOrg may already
    // reflect the new org. Switch explicitly to make sure.
    const refreshed = useOrgStore.getState().orgs
    const newOrg = refreshed.find(o => o.id === orgId)
    if (newOrg) await switchOrg(newOrg)
  }

  // ── Render: single-org case ──────────────────────────────────────────────
  // For users with only 1 org AND who are NOT toggle-eligible, show the
  // classic compact display. Toggle-eligible single-org bookkeepers fall
  // through to the full render so they see the Personal CTA.
  if (orgs.length <= 1 && !hasToggle) {
    return (
      <div style={{
        padding: '6px 10px 8px',
        borderBottom: '0.5px solid var(--lp-border)',
        marginTop: -4
      }}>
        <div style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          marginBottom: 2
        }}>
          Workspace
        </div>
        <div style={{
          fontSize: 12.5, fontWeight: 500, color: 'var(--lp-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {activeOrg?.name ?? '—'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 2 }}>
          {membership?.role ?? ''}
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} style={{
      padding: '6px 10px 8px',
      borderBottom: '0.5px solid var(--lp-border)',
      marginTop: -4, position: 'relative'
    }}>
      {/* 🆕 P5.A — Personal/Firm toggle (when user has at least firm + role) */}
      {hasToggle && (
        <div style={{
          display:       'flex',
          gap:           4,
          padding:       2,
          marginBottom:  6,
          background:    'var(--lp-surface-2)',
          border:        '0.5px solid var(--lp-border)',
          borderRadius:  7
        }}>
          <ModeToggleBtn
            label={hasPersonal ? 'Personal' : 'Personal +'}
            icon="person"
            active={activeCategory === 'personal'}
            disabled={!!switching}
            isPlaceholder={!hasPersonal}
            onClick={() => switchToCategory('personal')}
          />
          <ModeToggleBtn
            label="Firm"
            icon="building"
            active={activeCategory === 'firm'}
            disabled={!!switching}
            onClick={() => switchToCategory('firm')}
          />
        </div>
      )}

      {/* Trigger — only show full dropdown if user has 2+ orgs */}
      {orgs.length > 1 ? (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              width: '100%', background: 'none', border: 'none',
              padding: 0, cursor: 'pointer', textAlign: 'left'
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
              {hasToggle ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name={activeDesc.icon} size={10} />{activeDesc.label}</span> : 'Workspace'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 500, color: 'var(--lp-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
              }}>
                {activeOrg?.name ?? '—'}
              </div>
              <span style={{
                fontSize: 9, color: 'var(--lp-text-muted)',
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s', flexShrink: 0
              }}>
                ▼
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 1 }}>
              {membership?.role} · {orgs.length} workspaces
            </div>
          </button>

          {/* Dropdown */}
          {open && (
            <div style={{
              position:   'absolute',
              top:        '100%',
              left:       -10, right: -10,
              marginTop:  4,
              background: 'var(--lp-surface)',
              border:     '0.5px solid var(--lp-border-2)',
              borderRadius: 10,
              boxShadow:  '0 8px 24px rgba(0,0,0,0.4)',
              zIndex:     200,
              overflow:   'hidden',
              padding:    '4px 0'
            }}>
              {orgs.map(org => {
                const isActive   = org.id === activeOrg?.id
                const isSwitching = switching === org.id
                const orgCat     = classifyOrg(org, accountType)
                const orgDesc    = describeOrgCategory(orgCat)
                return (
                  <button
                    key={org.id}
                    onClick={() => switchOrg(org)}
                    disabled={isActive || !!switching}
                    style={{
                      width: '100%', background: 'none', border: 'none',
                      padding: '9px 14px', cursor: isActive ? 'default' : 'pointer',
                      textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--chat-row-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                  >
                    {/* Org avatar — colored by category */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: isActive ? 'var(--chat-bubble-mine-bg)' : 'var(--lp-surface-2)',
                      border: `1px solid ${isActive ? 'var(--chat-bubble-mine-border)' : 'var(--lp-border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13
                    }}>
                      <Icon name={orgDesc.icon} size={13} />
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: isActive ? 500 : 400,
                        color: isActive ? 'var(--lp-text)' : 'var(--lp-text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {org.name}
                      </div>
                      <div style={{
                        fontSize: 10.5,
                        color: orgDesc.color,
                        display: 'flex', alignItems: 'center', gap: 4
                      }}>
                        {orgDesc.label} · {org.currency}
                      </div>
                    </div>

                    {/* Active check / spinner */}
                    {isActive && (
                      <span style={{ color: 'var(--lp-accent)', fontSize: 13, flexShrink: 0 }}>✓</span>
                    )}
                    {isSwitching && <SemaphoreSpinner size="md" inline />}
                  </button>
                )
              })}

              {/* Divider + create new */}
              <div style={{ borderTop: '0.5px solid var(--lp-border)', margin: '4px 0' }} />
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: '100%', background: 'none', border: 'none',
                  padding: '8px 14px', cursor: 'pointer', textAlign: 'left',
                  fontSize: 12, color: 'var(--lp-text-muted)', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 8
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--chat-row-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                + Create another workspace
              </button>
            </div>
          )}
        </>
      ) : (
        /* Single-org compact display (toggle-eligible bookkeeper case) */
        <div>
          <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name={activeDesc.icon} size={10} />{activeDesc.label}
          </div>
          <div style={{
            fontSize: 12.5, fontWeight: 500, color: 'var(--lp-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {activeOrg?.name ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 1 }}>
            {membership?.role}
          </div>
        </div>
      )}

      {/* 🆕 P5.C — Personal-workspace creation dialog */}
      <CreatePersonalOrgDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handlePersonalCreated}
      />
    </div>
  )
}

// ── Mode toggle button (used in the Personal/Firm toggle pill) ──────────────

function ModeToggleBtn({
  label, icon, active, disabled, isPlaceholder, onClick
}: {
  label:    string
  icon:     IconName
  active:   boolean
  disabled: boolean
  /** P5.C: when true, this side has no org yet — render as a "create" CTA */
  isPlaceholder?: boolean
  onClick:  () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || active}
      title={isPlaceholder ? 'Create your personal workspace' : undefined}
      style={{
        flex:          1,
        padding:       '5px 8px',
        background:    active ? 'var(--lp-surface)' : 'transparent',
        border:        active ? '0.5px solid var(--lp-border)' :
                       isPlaceholder ? '0.5px dashed var(--lp-border)' :
                       '0.5px solid transparent',
        borderRadius:  5,
        color:         active ? 'var(--lp-text)' :
                       isPlaceholder ? 'var(--lp-text-muted)' :
                       'var(--lp-text-muted)',
        fontSize:      11.5,
        fontWeight:    active ? 600 : 400,
        fontStyle:     isPlaceholder ? 'italic' : 'normal',
        fontFamily:    'inherit',
        cursor:        active ? 'default' : (disabled ? 'not-allowed' : 'pointer'),
        display:       'flex',
        alignItems:    'center',
        justifyContent: 'center',
        gap:           4,
        transition:    'background 0.12s, opacity 0.12s'
      }}
    >
      <Icon name={icon} size={12} />
      <span>{label}</span>
    </button>
  )
}