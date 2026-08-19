// PATH: src/components/settings/UsersTab.tsx

import { useEffect, useState } from 'react'
import { useAuthStore }   from '../../store/auth.store'
import { useOrgStore }    from '../../store/org.store'
import { db }             from '../../lib/supabase'
import LpUserBadge        from '../ui/LpUserBadge'
import {
  getUsersInScope,
  type ScopedUser
} from '../../services/settings.service'
import { useUserRole }    from '../../hooks/useUserRole'
import { LP_TIER_CONFIG, type LpUserTier, type LpRole } from '../../types/database.types'
import { formatDate } from '../../lib/dates'

interface Props {
  onMessage?: (msg: { type: 'ok' | 'err'; text: string }) => void
}

// ── Chip helpers ─────────────────────────────────────────────────────────────

function TierChip({ tier }: { tier: LpUserTier }) {
  const c = LP_TIER_CONFIG[tier]
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
      color: c.color, background: c.bg, border: `0.5px solid ${c.border}`,
      letterSpacing: '0.04em', textTransform: 'uppercase'
    }}>
      {c.label}
    </span>
  )
}

function WorkspaceRoleChip({ role }: { role: LpRole }) {
  const colors: Record<LpRole, { color: string; bg: string; border: string }> = {
    owner:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.3)' },
    admin:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.3)'  },
    accountant: { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.3)'  },
    auditor:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.3)'  },
    approver:   { color: '#f472b6', bg: 'rgba(244,114,182,0.10)', border: 'rgba(244,114,182,0.3)' },
    readonly:   { color: 'var(--lp-text-muted)', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.3)' }
  }
  const c = colors[role] ?? colors.readonly
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
      color: c.color, background: c.bg, border: `0.5px solid ${c.border}`,
      letterSpacing: '0.04em', textTransform: 'capitalize'
    }}>
      {role}
    </span>
  )
}

function SystemRoleChip({ role }: { role: string }) {
  const colors: Record<string, string> = {
    super_admin: '#ef4444',
    admin:       '#f59e0b',
    bookkeeper:  '#3b82f6',
    auditor:     '#22c55e',
    client:      '#a78bfa'
  }
  const c = colors[role] ?? 'var(--lp-text-muted)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 100,
      color: c, background: `${c}18`, border: `0.5px solid ${c}40`,
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap'
    }}>
      {role.replace('_', ' ')}
    </span>
  )
}

function ActionButton({
  color, onClick, disabled, label
}: { color: string; onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
        background: `${color}14`, border: `0.5px solid ${color}50`,
        color, fontFamily: 'inherit', opacity: disabled ? 0.5 : 1
      }}
    >
      {label}
    </button>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function UsersTab({ onMessage }: Props) {
  const { profile }   = useAuthStore()
  const { activeOrg } = useOrgStore()
  const role          = useUserRole()

  const [users,    setUsers]    = useState<ScopedUser[]>([])
  const [loading,  setLoading]  = useState(false)
  const [acting,   setActing]   = useState<string | null>(null)

  async function load() {
    if (!role.canViewUsersTab) return
    setLoading(true)
    try {
      const orgScope = role.isSuperAdmin ? null : (activeOrg?.id ?? null)
      const data = await getUsersInScope(orgScope)
      setUsers(data)
    } catch (e: any) {
      onMessage?.({ type: 'err', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.canViewUsersTab, activeOrg?.id, role.isSuperAdmin])

  async function callTierFn(
    fnName: 'promote_to_admin' | 'assign_tester' | 'demote_admin',
    targetId: string
  ) {
    if (!profile?.id) return
    if (!role.canManageTiers) {
      onMessage?.({ type: 'err', text: 'Only super admins can manage user tiers' })
      return
    }
    setActing(targetId)
    const { data, error } = await db.rpc(fnName, {
      p_target_user_id:      targetId,
      p_requesting_admin_id: profile.id
    })

    if (error) onMessage?.({ type: 'err', text: error.message })
    else onMessage?.({ type: 'ok', text: `Done — new code: ${(data as any)?.new_code ?? ''}` })

    setActing(null)
    await load()
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14
      }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--lp-text)', fontWeight: 500 }}>
            {role.isSuperAdmin
              ? 'Global user directory'
              : `Team for ${activeOrg?.name ?? 'this workspace'}`}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
            {users.length} {users.length === 1 ? 'account' : 'accounts'}
            {!role.isSuperAdmin && ' · scoped to your workspace'}
          </div>
        </div>
        <button onClick={load} className="lp-btn lp-btn-ghost" style={{ fontSize: 12 }}>
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>
      ) : users.length === 0 ? (
        <div className="lp-card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
          <div style={{ fontSize: 13, color: 'var(--lp-text)', marginBottom: 4 }}>
            No users in scope
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
            {role.isSuperAdmin
              ? 'No users found in the platform.'
              : 'Invite team members from the Clients page.'}
          </div>
        </div>
      ) : (
        <div className="lp-table-wrap">
          <table className="lp-table">
            <thead>
              <tr>
                <th>LP Code</th>
                <th>User</th>
                <th>Email</th>
                {role.isSuperAdmin ? <th>System role</th> : <th>Workspace role</th>}
                <th>Tier</th>
                {role.isSuperAdmin && <th style={{ textAlign: 'center' }}>Orgs</th>}
                <th>Joined</th>
                {role.isSuperAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === profile?.id
                const isActing = acting === u.id

                return (
                  <tr key={u.id}>
                    <td>
                      <button
                        onClick={() => navigator.clipboard.writeText(u.lp_user_code)}
                        title="Click to copy"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <LpUserBadge code={u.lp_user_code} tier={u.tier} size="sm" />
                      </button>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--lp-text)' }}>
                      {u.display_name ?? '—'}
                      {isSelf && <span style={{ fontSize: 10, color: '#3b82f6', marginLeft: 5 }}>(you)</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
                      {u.email ?? '—'}
                    </td>

                    {role.isSuperAdmin ? (
                      <td><SystemRoleChip role={u.system_role} /></td>
                    ) : (
                      <td>
                        {u.workspace_role
                          ? <WorkspaceRoleChip role={u.workspace_role as LpRole} />
                          : '—'}
                      </td>
                    )}

                    <td><TierChip tier={u.tier} /></td>

                    {role.isSuperAdmin && (
                      <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--lp-text-muted)' }}>
                        {u.org_count}
                      </td>
                    )}
                    <td style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(u.created_at)}
                    </td>

                    {role.isSuperAdmin && (
                      <td>
                        {!isSelf && (
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {u.tier !== 'admin' && (
                              <ActionButton
                                color="#f59e0b"
                                onClick={() => callTierFn('promote_to_admin', u.id)}
                                disabled={isActing}
                                label="→ Admin"
                              />
                            )}
                            {u.tier !== 'tester' && (
                              <ActionButton
                                color="#a78bfa"
                                onClick={() => callTierFn('assign_tester', u.id)}
                                disabled={isActing}
                                label="→ Tester"
                              />
                            )}
                            {u.tier === 'admin' && (
                              <ActionButton
                                color="#ef4444"
                                onClick={() => callTierFn('demote_admin', u.id)}
                                disabled={isActing}
                                label="Demote"
                              />
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Helper note */}
      {!role.isSuperAdmin && users.length > 0 && (
        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(59,130,246,0.05)',
          border: '0.5px solid rgba(59,130,246,0.18)',
          fontSize: 11.5, color: 'var(--lp-text-muted)', lineHeight: 1.6
        }}>
          👁️ You can see your team members here. To{' '}
          <strong style={{ color: 'var(--lp-text)' }}>invite</strong> new members
          go to the <strong style={{ color: 'var(--lp-text)' }}>Clients</strong> page.
          Tier changes (admin / tester) are managed by the platform super admin.
        </div>
      )}
    </div>
  )
}
