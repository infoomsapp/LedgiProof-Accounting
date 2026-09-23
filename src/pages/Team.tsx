// PATH: src/pages/Team.tsx
//
// P4 — Team management page.
//
// AL's pedido: separation of "team members" (people who work IN the firm)
// from "billing clients" (people the firm bills). Previously both lived in
// Clients.tsx under different tabs. Now Team gets its own dedicated page
// with sidebar nav entry.
//
// Features:
//   · List active team members with role badges
//   · Invite new team members (existing flow)
//   · NEW: Remove team member from workspace (soft deactivate)
//   · NEW: Revoke pending invitations
//
// Route: /team
// Access: bookkeeper_owner / bookkeeper_admin / super_admin

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore }    from '../store/auth.store'
import { useUserRole }     from '../hooks/useUserRole'
import { db }              from '../lib/supabase'
import Modal               from '../components/ui/modal'
import Button              from '../components/ui/Button'
import type { LpRole } from '../types/database.types'
import { ROLE_CONFIG, getAssignableRoles } from '../lib/role-config'
import { formatDate } from '../lib/dates'
import { dbError, toSafeMessage } from '../lib/errors'
import { checkTeamMemberLimit } from '../services/seat-limits.service'
import UpgradeModal from '../components/billing/UpgradeModal'
import type { SubscriptionPlan } from '../types/database.types'

// ── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id:         string
  user_id:    string
  role:       LpRole
  is_active:  boolean
  created_at: string
  profiles?:  { display_name: string | null; email: string | null; lp_user_code: string | null }
}

interface Invitation {
  id:         string
  email:      string
  role:       LpRole
  status:     string
  expires_at: string
  created_at: string
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Team() {
  const { membership, profile, user } = useAuthStore()
  const orgId  = membership?.org_id ?? ''
  const userId = user?.id ?? profile?.id ?? ''

  // CBAC: derive from the single source of truth (useUserRole), never from
  // raw role strings. canEditWorkspace = owner || admin.
  const role           = useUserRole()
  const workspaceRole  = (membership?.role ?? null) as LpRole | null
  const isAdmin        = role.canEditWorkspace

  const assignableRoles = getAssignableRoles({ workspaceRole })
  const canInvite       = assignableRoles.length > 0

  const [members,     setMembers]     = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading,     setLoading]     = useState(true)

  // Invite modal
  const [showInvite, setShowInvite] = useState(false)
  const [invEmail,   setInvEmail]   = useState('')
  const [invRole,    setInvRole]    = useState<LpRole>('readonly')
  const [inviting,   setInviting]   = useState(false)
  const [invError,   setInvError]   = useState<string | null>(null)
  const [invResult,  setInvResult]  = useState<string | null>(null)

  // Remove member confirmation
  const [removingMember, setRemovingMember] = useState<Member | null>(null)
  const [removeBusy,     setRemoveBusy]     = useState(false)
  const [removeError,    setRemoveError]    = useState<string | null>(null)
  const [listError,      setListError]      = useState<string | null>(null)

  // Plan seat limit ("Up to N team members") -- real enforcement,
  // see seat-limits.service.ts.
  const [limitModal, setLimitModal] = useState<{ used: number; limit: number; plan: SubscriptionPlan } | null>(null)

  useEffect(() => {
    if (showInvite && assignableRoles.length > 0) {
      const fallback = assignableRoles[assignableRoles.length - 1]
      if (fallback && !assignableRoles.includes(invRole)) setInvRole(fallback)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInvite, assignableRoles.join(',')])

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [mems, invs] = await Promise.all([
      db.from('organization_memberships')
        .select('*, profiles(display_name, email, lp_user_code)')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('created_at'),
      db.from('invitations')
        .select('*')
        .eq('org_id', orgId)
        .in('status', ['pending'])
        .order('created_at', { ascending: false })
    ])
    setMembers((mems.data ?? []) as Member[])
    setInvitations((invs.data ?? []) as Invitation[])
    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  // ── Send invitation ──────────────────────────────────────────────────────
  async function handleInvite() {
    if (!invEmail.trim()) { setInvError('Email required'); return }
    if (!userId)          { setInvError('Current user ID not available'); return }
    if (!assignableRoles.includes(invRole)) {
      setInvError(`You're not allowed to assign the "${invRole}" role`)
      return
    }

    setInviting(true); setInvError(null); setInvResult(null)

    const limit = await checkTeamMemberLimit(userId, orgId)
    if (!limit.allowed) {
      setInviting(false)
      setLimitModal(limit)
      return
    }

    const { data: inv, error } = await db
      .from('invitations')
      .insert({
        org_id:     orgId,
        email:      invEmail.trim().toLowerCase(),
        role:       invRole,
        invited_by: userId
      })
      .select()
      .single()

    if (error) {
      setInvError(toSafeMessage(error, 'Could not send the invitation'))
    } else {
      const inv_data = inv as Invitation & { token: string; expires_at: string }
      const activationUrl = `${window.location.origin}/staff-activate/${inv_data.token}`

      // Send email via Resend — non-blocking; invitation is already created in
      // DB. Only invitation_id goes across the wire now — the edge function
      // looks up email/org/role/token itself and RLS decides whether this
      // caller is actually allowed to send it (was previously a phishing
      // relay: to_email/org_name/etc. used to be trusted straight from here).
      db.functions.invoke('send-staff-invitation', {
        body: { invitation_id: inv_data.id }
      }).catch(err => {
        console.warn('[Team] send-staff-invitation email failed (non-fatal):', err)
      })

      setInvResult(activationUrl)
      await load()
    }
    setInviting(false)
  }

  async function revokeInvitation(id: string) {
    const { error } = await db.from('invitations').update({ status: 'revoked' }).eq('id', id)
    if (error) {
      setListError(`Could not revoke invitation: ${toSafeMessage(error, 'database error')}`)
      return
    }
    await load()
  }

  // ── 🆕 P4: Remove team member ────────────────────────────────────────────
  async function handleRemoveMember() {
    if (!removingMember) return
    setRemoveBusy(true)
    setRemoveError(null)
    try {
      // Soft-deactivate the membership row (NOT delete — preserves audit trail)
      const { error } = await db
        .from('organization_memberships')
        .update({ is_active: false })
        .eq('id', removingMember.id)
      if (error) throw dbError(error, 'Could not remove the team member')
      setRemovingMember(null)
      await load()
    } catch (e: any) {
      setRemoveError(e?.message ?? 'Could not remove team member')
    } finally {
      setRemoveBusy(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--lp-text-muted)' }}>
        Loading team…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{
        padding:      '20px 32px',
        borderBottom: '0.5px solid var(--lp-border)',
        background:   'var(--lp-surface)',
        display:      'flex',
        alignItems:   'flex-start',
        justifyContent: 'space-between',
        gap:          12
      }}>
        <div>
          <h1 className="lp-page-title" style={{ margin: 0 }}>Team</h1>
          <p className="lp-page-sub" style={{ margin: '4px 0 0 0' }}>
            People who work in your firm — separate from billing clients.
          </p>
        </div>

        {canInvite && (
          <button
            onClick={() => setShowInvite(true)}
            style={{
              padding:      '7px 14px',
              borderRadius: 8,
              background:   'var(--lp-accent)',
              border:       '0.5px solid var(--lp-accent)',
              color:        '#fff',
              fontSize:     12,
              fontWeight:   600,
              cursor:       'pointer',
              fontFamily:   'inherit',
              whiteSpace:   'nowrap'
            }}
          >
            + Invite team member
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '20px 32px', maxWidth: 1100, width: '100%' }}>

        {listError && (
          <div className="lp-banner error"
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 12.5 }}>{listError}</span>
            <button
              onClick={() => setListError(null)}
              style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                background: 'none', border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text-muted)', fontFamily: 'inherit', marginLeft: 'auto' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Members section */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{
            fontSize:      11,
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color:         'var(--lp-text-muted)',
            margin:        '0 0 10px 0'
          }}>
            Active members ({members.length})
          </h2>

          {members.length === 0 ? (
            <div style={{
              padding:      24,
              textAlign:    'center',
              background:   'var(--lp-surface)',
              border:       '0.5px dashed var(--lp-border)',
              borderRadius: 10,
              color:        'var(--lp-text-muted)',
              fontSize:     13
            }}>
              No team members yet. Click "Invite team member" to add one.
            </div>
          ) : (
            <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="lp-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => {
                    const isSelf = m.user_id === userId
                    const canRemove = isAdmin && !isSelf && m.role !== 'owner'
                    return (
                      <tr key={m.id}>
                        <td>{m.profiles?.display_name ?? '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {m.profiles?.email ?? '—'}
                        </td>
                        <td>
                          <RoleBadge role={m.role} />
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
                          {formatDate(m.created_at)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {canRemove ? (
                            <button
                              onClick={() => setRemovingMember(m)}
                              title="Remove from team"
                              style={{
                                background:   'transparent',
                                border:       '0.5px solid var(--lp-border)',
                                color:        'var(--sem-red)',
                                borderRadius: 6,
                                padding:      '4px 10px',
                                fontSize:     11.5,
                                fontWeight:   500,
                                cursor:       'pointer',
                                fontFamily:   'inherit'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--sem-red-bg)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                            >
                              🗑 Remove
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--lp-text-muted)' }}>
                              {isSelf ? 'You' : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <div>
            <h2 style={{
              fontSize:      11,
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color:         'var(--lp-text-muted)',
              margin:        '0 0 10px 0'
            }}>
              Pending invitations ({invitations.length})
            </h2>

            <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="lp-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Sent</th>
                    <th>Expires</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map(inv => (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.email}</td>
                      <td><RoleBadge role={inv.role} /></td>
                      <td style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
                        {formatDate(inv.created_at)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
                        {formatDate(inv.expires_at)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => revokeInvitation(inv.id)}
                          style={{
                            background:   'transparent',
                            border:       '0.5px solid var(--lp-border)',
                            color:        'var(--sem-red)',
                            borderRadius: 6,
                            padding:      '4px 10px',
                            fontSize:     11.5,
                            fontWeight:   500,
                            cursor:       'pointer',
                            fontFamily:   'inherit'
                          }}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Invite modal ──────────────────────────────────────────────────── */}
      <Modal
        open={showInvite}
        onClose={() => { setShowInvite(false); setInvResult(null); setInvError(null); setInvEmail('') }}
        title="Invite team member"
        subtitle="Send an invitation link to join your workspace."
        width={460}
        footer={
          invResult ? (
            <Button variant="primary" onClick={() => { setShowInvite(false); setInvResult(null); setInvEmail('') }}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setShowInvite(false)} disabled={inviting}>
                Cancel
              </Button>
              <Button variant="primary" loading={inviting} disabled={inviting || !invEmail.trim()} onClick={handleInvite}>
                Send invitation
              </Button>
            </>
          )
        }
      >
        {invResult ? (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, fontWeight: 600, color: 'var(--sem-green)', marginBottom: 8
            }}>
              <span>✓</span>
              <span>Invitation sent to {invEmail}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
              An email with the activation link has been sent. As a backup, you can also share this link directly:
            </div>
            <div style={{
              padding:      10,
              background:   'var(--lp-surface-2)',
              border:       '0.5px solid var(--lp-border)',
              borderRadius: 6,
              fontFamily:   'monospace',
              fontSize:     11,
              wordBreak:    'break-all',
              color:        'var(--lp-accent)'
            }}>
              {invResult}
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block', fontSize: 10.5, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: 'var(--lp-text-muted)', marginBottom: 5
              }}>
                Email address
              </label>
              <input
                type="email"
                value={invEmail}
                onChange={e => setInvEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="lp-input"
                autoFocus
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block', fontSize: 10.5, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: 'var(--lp-text-muted)', marginBottom: 5
              }}>
                Role
              </label>
              <select
                value={invRole}
                onChange={e => setInvRole(e.target.value as LpRole)}
                className="lp-input"
                style={{ width: '100%' }}
              >
                {assignableRoles.map(r => (
                  <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 4 }}>
                {ROLE_CONFIG[invRole]?.description}
              </div>
            </div>

            {invError && (
              <div style={{
                padding: '8px 12px', background: 'var(--sem-red-bg)',
                border: '0.5px solid var(--sem-red)', borderRadius: 7,
                color: 'var(--sem-red)', fontSize: 12
              }}>
                ⚠ {invError}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ── Remove member confirmation ──────────────────────────────────── */}
      <Modal
        open={removingMember !== null}
        onClose={() => { setRemovingMember(null); setRemoveError(null) }}
        title="Remove team member"
        subtitle="They will lose access to this workspace immediately."
        width={420}
        danger
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemovingMember(null)} disabled={removeBusy}>
              Cancel
            </Button>
            <Button variant="danger" loading={removeBusy} onClick={handleRemoveMember}>
              Remove
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 13, color: 'var(--lp-text)', lineHeight: 1.5, marginBottom: 12 }}>
          You're about to remove{' '}
          <strong>{removingMember?.profiles?.display_name ?? removingMember?.profiles?.email}</strong>
          {' '}from this workspace.
        </div>
        <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', lineHeight: 1.5 }}>
          Their historical activity stays in audit logs. You can re-invite them later.
        </div>
        {removeError && (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)',
            borderRadius: 7, color: 'var(--sem-red)', fontSize: 12
          }}>
            ⚠ {removeError}
          </div>
        )}
      </Modal>

      {limitModal && (
        <UpgradeModal
          open
          onClose={() => setLimitModal(null)}
          feature="team_members"
          currentPlan={limitModal.plan}
          reason="limit_exhausted"
          used={limitModal.used}
          limit={limitModal.limit}
        />
      )}
    </div>
  )
}

// ── Role badge ──────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: LpRole }) {
  const c = ROLE_CONFIG[role]
  return (
    <span style={{
      fontSize:     11,
      padding:      '2px 8px',
      borderRadius: 100,
      fontWeight:   500,
      color:        c.color,
      background:   c.bg,
      border:       `0.5px solid ${c.color}`
    }}>
      {c.label}
    </span>
  )
}
