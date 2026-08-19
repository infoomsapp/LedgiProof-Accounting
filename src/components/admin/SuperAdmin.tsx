// PATH: src/pages/admin/SuperAdmin.tsx
// Olympus Mont super admin dashboard.
// - Cross-tenant overview (orgs, clients, users, governance)
// - Org/Client selector → enters "View as" mode
// - Audit log viewer
// - Role management
// - Hard-gated by actorRole === 'super_admin' (UI guard; RLS is the real enforcement)
//
// CHANGED: Overview tab replaced with the new Command Center (system health,
// revenue, risk, multi-client, recent events + ⌘K search palette).
// All other tabs (Organizations, Clients, Users, Audit Log) unchanged.

import { useEffect, useState } from 'react'
import { useNavigate }        from 'react-router-dom'
import { useImpersonationStore } from '../../store/impersonation.store'
import { useViewAs } from '../../hooks/useViewAs'
import { useAuthStore } from '../../store/auth.store'
import { formatDate } from '../../lib/dates'
import {
  adminGetOrganizations, adminGetClients, adminGetUserDirectory,
  adminGetAuditLog, adminGrantRole,
  type AdminUserDirectoryRow, type ImpersonationAuditRow, type AdminClientRow
} from '../../services/admin.service'
import type { Organization, SystemRole } from '../../types/database.types'

// 🆕 New Command Center overview
import CommandCenterOverview from '../../components/admin/CommandCenterOverview'

type Tab = 'overview' | 'orgs' | 'clients' | 'users' | 'audit'

const ROLE_COLORS: Record<SystemRole, string> = {
  super_admin: '#ef4444',
  admin:       '#f59e0b',
  bookkeeper:  '#3b82f6',
  client:      '#a78bfa',
  auditor:     '#22c55e'
}

export default function SuperAdmin() {
  const navigate = useNavigate()
  const { enterAdminView, actorRole } = useImpersonationStore()
  const { viewAsOrg: enterViewAsOrg } = useViewAs()
  const { user } = useAuthStore()

  // ── State (hooks must be declared BEFORE any conditional return) ─────
  const [tab, setTab] = useState<Tab>('overview')

  // Lists (no longer load overview here — handled by CommandCenterOverview)
  const [orgs,    setOrgs]    = useState<Organization[]>([])
  const [clients, setClients] = useState<AdminClientRow[]>([])
  const [users,   setUsers]   = useState<AdminUserDirectoryRow[]>([])
  const [audit,   setAudit]   = useState<ImpersonationAuditRow[]>([])

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const isSuperAdmin = !!user && actorRole === 'super_admin'

  // ── Tab loaders (overview no longer loads here) ──────────────────────
  useEffect(() => {
    if (!isSuperAdmin) return
    if (tab === 'overview') return  // CommandCenterOverview manages its own loading

    setLoading(true); setError(null)
    const load = async () => {
      try {
        if (tab === 'orgs') {
          setOrgs(await adminGetOrganizations())
        } else if (tab === 'clients') {
          setClients(await adminGetClients())
        } else if (tab === 'users') {
          setUsers(await adminGetUserDirectory())
        } else if (tab === 'audit') {
          setAudit(await adminGetAuditLog(100))
        }
      } catch (e: any) {
        setError(e?.message ?? 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tab, isSuperAdmin])

  // 🔐 HARD SECURITY — render gate AFTER all hooks are declared
  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 40 }}>
        <h2 style={{ color: '#ef4444', marginBottom: 8 }}>⛔ Access denied</h2>
        <p style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>
          You do not have permission to access the Super Admin Console.
        </p>
      </div>
    )
  }

  // ── Enter View As ────────────────────────────────────────────────────
  function viewAsClient(client: AdminClientRow) {
    if (actorRole !== 'super_admin') return
    enterAdminView({
      targetClientId:   client.id,
      targetOrgId:      client.org_id,
      ...(client.display_name != null ? { targetClientName: client.display_name } : {})
    })
    navigate('/client')
  }

  async function viewAsOrg(org: Organization) {
    if (actorRole !== 'super_admin') return
    try {
      await enterViewAsOrg(org.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to enter View As mode')
    }
  }

  // ── Role management ─────────────────────────────────────────────────
  async function changeRole(userId: string, newRole: SystemRole) {
    if (actorRole !== 'super_admin') return
    if (!confirm(`Change role to "${newRole}"?`)) return
    try {
      await adminGrantRole(userId, newRole)
      setUsers(await adminGetUserDirectory())
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    }
  }

  return (
    <div style={{ padding: '24px 28px', flex: 1, overflow: 'auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--lp-text)', letterSpacing: '-0.01em' }}>
          🛡 Super Admin Console
        </h1>
        <p style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 5 }}>
          Cross-tenant control center — all actions logged to <code>impersonation_audit</code>
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 22,
        borderBottom: '0.5px solid var(--lp-border)' }}>
        {([
          ['overview', '⚡ Command Center'],
          ['orgs',     '🏢 Organizations'],
          ['clients',  '🧑‍💼 Clients'],
          ['users',    '👥 Users'],
          ['audit',    '📜 Audit Log']
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
            color: tab === t ? 'var(--lp-text)' : 'var(--lp-text-muted)',
            fontWeight: tab === t ? 500 : 400,
            borderBottom: `2px solid ${tab === t ? '#ef4444' : 'transparent'}`,
            marginBottom: -1, transition: 'all 0.12s'
          }}>
            {label}
          </button>
        ))}
      </div>

      {error && tab !== 'overview' && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
          background: 'rgba(239,68,68,0.08)',
          border: '0.5px solid rgba(239,68,68,0.3)',
          color: '#ef4444'
        }}>
          ⚠ {error}
        </div>
      )}

      {loading && tab !== 'overview' && (
        <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginBottom: 12 }}>Loading…</div>
      )}

      {/* ── COMMAND CENTER ─────────────────────────────────────────── */}
      {tab === 'overview' && <CommandCenterOverview />}

      {/* ── ORGANIZATIONS ─────────────────────────────────────────── */}
      {tab === 'orgs' && (
        <div className="lp-table-wrap">
          <table className="lp-table">
            <thead>
              <tr>
                {['Name', 'Slug', 'Currency', 'Created', 'Action'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id}>
                  <td style={{ fontSize: 13, color: 'var(--lp-text)', fontWeight: 500 }}>{o.name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{o.slug}</td>
                  <td style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>{o.currency}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                    {formatDate(o.created_at)}
                  </td>
                  <td>
                    <button onClick={() => viewAsOrg(o)} style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                      background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.3)',
                      color: '#ef4444', fontFamily: 'inherit'
                    }}>
                      🔴 View as Org
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CLIENTS ──────────────────────────────────────────────── */}
      {tab === 'clients' && (
        <div className="lp-table-wrap">
          <table className="lp-table">
            <thead>
              <tr>
                {['Client', 'Portal Linked', 'Created', 'Action'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                  <td style={{ fontSize: 13, color: 'var(--lp-text)', fontWeight: 500 }}>{c.display_name}</td>
                  <td>
                    {(c as any).primary_user_id ? (
                      <span style={{ color: '#a78bfa', fontSize: 11 }}>✓ Linked</span>
                    ) : (
                      <span style={{ color: '#475569', fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                    {formatDate(c.created_at)}
                  </td>
                  <td>
                    <button onClick={() => viewAsClient(c)} style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                      background: 'rgba(167,139,250,0.07)', border: '0.5px solid rgba(167,139,250,0.3)',
                      color: '#a78bfa', fontFamily: 'inherit'
                    }}>
                      🔴 View as Client
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── USERS ────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="lp-table-wrap">
          <table className="lp-table">
            <thead>
              <tr>
                {['User', 'Type', 'Role', 'Created', 'Change Role'].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontSize: 13, color: 'var(--lp-text)' }}>
                    {u.display_name ?? '—'}
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#475569' }}>
                      {u.lp_user_code}
                    </div>
                  </td>
                  <td style={{ fontSize: 11 }}>
                    <span style={{
                      padding: '2px 7px', borderRadius: 100,
                      background: u.user_type === 'client_user' ? 'rgba(167,139,250,0.1)' : 'rgba(96,165,250,0.1)',
                      color:      u.user_type === 'client_user' ? '#a78bfa' : '#60a5fa',
                      border: '0.5px solid ' + (u.user_type === 'client_user' ? 'rgba(167,139,250,0.3)' : 'rgba(96,165,250,0.3)')
                    }}>
                      {u.user_type === 'client_user' ? 'PYME' : 'Staff'}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 100, fontWeight: 500,
                      color: ROLE_COLORS[u.system_role],
                      background: ROLE_COLORS[u.system_role] + '18',
                      border: '0.5px solid ' + ROLE_COLORS[u.system_role] + '40'
                    }}>
                      {u.system_role}
                    </span>
                  </td>
                  <td style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                    {formatDate(u.created_at)}
                  </td>
                  <td>
                    <select
                      value={u.system_role}
                      onChange={e => changeRole(u.id, e.target.value as SystemRole)}
                      className="lp-input"
                      style={{ fontSize: 11, padding: '2px 6px', height: 'auto', width: 120 }}
                    >
                      {(['super_admin','admin','bookkeeper','client','auditor'] as SystemRole[]).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── AUDIT LOG ────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginBottom: 10 }}>
            Last {audit.length} super admin actions. This log is immutable and queryable for compliance.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {audit.map(a => (
              <div key={a.id} style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'var(--lp-surface)',
                border: '0.5px solid var(--lp-border)',
                borderLeft: '3px solid ' + (ROLE_COLORS[a.actor_role] ?? '#475569')
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100,
                    color: ROLE_COLORS[a.actor_role],
                    background: ROLE_COLORS[a.actor_role] + '18',
                    border: '0.5px solid ' + ROLE_COLORS[a.actor_role] + '40',
                    textTransform: 'uppercase', letterSpacing: '0.04em'
                  }}>
                    {a.action.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: 10.5, color: '#475569' }}>
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 3 }}>
                  Actor: <span style={{ fontFamily: 'monospace', color: 'var(--lp-text-muted)' }}>{a.actor_user_id.slice(0,8)}…</span>
                  {a.context_org_id    && <> · Org: <span style={{ fontFamily: 'monospace' }}>{a.context_org_id.slice(0,8)}…</span></>}
                  {a.context_client_id && <> · Client: <span style={{ fontFamily: 'monospace' }}>{a.context_client_id.slice(0,8)}…</span></>}
                  {a.target_count != null && <> · {a.target_count} rows</>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
