// PATH: src/pages/Clients.tsx
//
// CSS-TODO (file-level): remaining: var(--lp-text-stronger) (slate-700, 4 occurrences) needs --lp-text-stronger. var(--sem-amber-soft) (amber-400) needs --sem-amber-soft. Unique blue/amber alpha gradations for card states. Direct mappings migrated.
//
// Unified page: billing clients (from invoices module) + workspace members + invitations
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams }      from 'react-router-dom'
import { useAuthStore }        from '../store/auth.store'
import { useChatBubbleStore }  from '../store/chat-bubble.store'
import { useUserRole }     from '../hooks/useUserRole'
import { db }              from '../lib/supabase'
import { getClients, updateClient }      from '../services/invoice.service'
import Modal               from '../components/ui/modal'
import Button              from '../components/ui/Button'
import LpAddMenu           from '../components/clients/LpAddMenu'
import type { Client, LpRole } from '../types/database.types'
import { ROLE_CONFIG, getAssignableRoles } from '../lib/role-config'
import { formatDate } from '../lib/dates'

// 🆕 A2: Client portal invitations (separate flow from team invitations)
import {
  createClientPortalInvitation,
  listClientPortalInvitations,
  revokeClientPortalInvitation,
  buildClientPortalInvitationUrl,
  sendClientInvitationEmail,
  CLIENT_PORTAL_ROLE_CONFIG,
  type ClientPortalRole,
  type ClientPortalInvitationWithClient
} from '../services/client-portal.service'
import { toSafeMessage } from '../lib/errors'

interface Member {
  id:           string
  user_id:      string
  role:         LpRole
  is_active:    boolean
  created_at:   string
  profiles?:    { display_name: string | null; email: string | null; lp_user_code: string | null }
}

interface Invitation {
  id:         string
  email:      string
  role:       LpRole
  status:     string
  expires_at: string
  created_at: string
}

type Tab = 'clients' | 'client_invites'

function RoleBadge({ role }: { role: LpRole }) {
  const c = ROLE_CONFIG[role]
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 100, fontWeight: 500,
      color: c.color, background: c.bg, border: `0.5px solid ${c.color}30`
    }}>
      {c.label}
    </span>
  )
}

export default function Clients() {
  const navigate   = useNavigate()
  const { openChat } = useChatBubbleStore()
  const [searchParams] = useSearchParams()

  // Detect intent param — set by LpAddMenu and AccountantDashboard header buttons.
  // After the user picks a client, handleClientIntent routes to the feature.
  //   ?intent=estimate → /clients/:id/estimates/new
  //   ?intent=import   → /import?clientId=:id
  //   ?intent=journal  → /clients/:id/journal    (accountant: post manual entry)
  //   ?intent=period   → /clients/:id/periods    (accountant: close period)
  const intent = searchParams.get('intent') as 'estimate' | 'import' | 'journal' | 'period' | 'accounts' | null
  const intentActive = intent === 'estimate' || intent === 'import' || intent === 'journal' || intent === 'period' || intent === 'accounts'

  function handleClientIntent(clientId: string) {
    if (intent === 'estimate') {
      // Was `/clients/:id/estimates/new` -- not a real route (no such
      // estimate id), so it silently landed on the editor's "could not
      // load this estimate" error screen. Land on the real list + auto-
      // open the SAME template picker Estimates.tsx's own "+ New" button
      // uses, instead of a second creation flow.
      navigate(`/clients/${clientId}/estimates?openCreate=1`)
    } else if (intent === 'import') {
      navigate(`/import?clientId=${clientId}`)
    } else if (intent === 'journal') {
      navigate(`/clients/${clientId}/journal`)
    } else if (intent === 'period') {
      navigate(`/clients/${clientId}/periods`)
    } else if (intent === 'accounts') {
      navigate(`/clients/${clientId}/accounts`)
    }
  }

  const { membership, profile, user } = useAuthStore()
  const orgId  = membership?.org_id ?? ''
  const userId = user?.id ?? profile?.id ?? ''

  // CBAC: derive from the single source of truth (useUserRole), never from
  // raw role strings. canEditWorkspace = owner || admin.
  const role           = useUserRole()
  const workspaceRole  = (membership?.role ?? null) as LpRole | null
  const isAdmin        = role.canEditWorkspace

  // Roles the current user is allowed to assign in this workspace.
  // Empty = "Invite member" button is hidden.
  const assignableRoles = getAssignableRoles({ workspaceRole })

  const [tab,         setTab]         = useState<Tab>('clients')
  const [listError,   setListError]   = useState<string | null>(null)
  const [members,     setMembers]     = useState<Member[]>([])
  const [clients,     setClients]     = useState<Client[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading,     setLoading]     = useState(true)

  // Invite modal
  const [showInvite,  setShowInvite]  = useState(false)
  const [invEmail,    setInvEmail]    = useState('')
  const [invRole,     setInvRole]     = useState<LpRole>('readonly')
  const [inviting,    setInviting]    = useState(false)
  const [invError,    setInvError]    = useState<string | null>(null)
  const [invResult,   setInvResult]   = useState<string | null>(null)

  // 🆕 A2: Client portal invitations (separate from team invitations)
  const [clientInvites,   setClientInvites]   = useState<ClientPortalInvitationWithClient[]>([])
  const [showCpInvite,    setShowCpInvite]    = useState(false)
  const [cpClientId,      setCpClientId]      = useState<string>('')
  const [cpEmail,         setCpEmail]         = useState('')
  const [cpRole,          setCpRole]          = useState<ClientPortalRole>('client_contact')
  const [cpInviting,      setCpInviting]      = useState(false)
  const [cpError,         setCpError]         = useState<string | null>(null)
  const [cpResult,        setCpResult]        = useState<string | null>(null)
  // Resend / email-failure feedback for the client_invites table — separate
  // from listError (which is red/error-only) since a resend failure still
  // leaves a usable invite link, not just a dead end.
  const [cpNotice,        setCpNotice]        = useState<{ type: 'success' | 'warning'; text: string } | null>(null)
  const [resendingId,     setResendingId]     = useState<string | null>(null)

  // Reset invRole when the dialog opens, defaulting to the most restrictive
  // (last in the assignable list) — usually 'readonly'.
  useEffect(() => {
    if (showInvite && assignableRoles.length > 0) {
      const fallback = assignableRoles[assignableRoles.length - 1]
      if (fallback && !assignableRoles.includes(invRole)) {
        setInvRole(fallback)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInvite, assignableRoles.join(',')])

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [mems, invs, clts] = await Promise.all([
      db.from('organization_memberships')
        .select('*, profiles(display_name, email, lp_user_code)')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('created_at'),
      db.from('invitations')
        .select('*')
        .eq('org_id', orgId)
        .in('status', ['pending'])
        .order('created_at', { ascending: false }),
      getClients(orgId)
    ])
    setMembers((mems.data ?? []) as Member[])
    setInvitations((invs.data ?? []) as Invitation[])
    setClients(clts)

    // 🆕 A2: Load client portal invitations (graceful degradation if fails)
    try {
      const cpInvs = await listClientPortalInvitations(orgId)
      setClientInvites(cpInvs)
    } catch (e) {
      console.warn('[Clients] Could not load client portal invitations:', e)
      setClientInvites([])
    }

    setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  // ── Send invitation ─────────────────────────────────────────────────────
  async function handleInvite() {
    if (!invEmail.trim()) {
      setInvError('Email required')
      return
    }
    if (!userId) {
      setInvError('Current user ID not available')
      return
    }
    // Defensive guard: never send a role the user isn't allowed to assign,
    // even if someone bypasses the UI.
    if (!assignableRoles.includes(invRole)) {
      setInvError(`You're not allowed to assign the "${invRole}" role`)
      return
    }

    setInviting(true)
    setInvError(null)
    setInvResult(null)

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
      const inv_data = inv as Invitation & { token: string }
      // Build invitation URL
      const invUrl = `${window.location.origin}/accept-invite/${inv_data.token}`
      setInvResult(invUrl)
      await load()
    }
    setInviting(false)
  }

  // ── Revoke invitation ───────────────────────────────────────────────────
  async function revokeInvitation(id: string) {
    const { error } = await db.from('invitations').update({ status: 'revoked' }).eq('id', id)
    if (error) {
      setListError(`Could not revoke invitation: ${toSafeMessage(error, 'database error')}`)
      return
    }
    await load()
  }

  // ── 🆕 A2: Send client portal invitation ────────────────────────────────
  async function handleCpInvite() {
    if (!cpClientId) {
      setCpError('Select a client first')
      return
    }
    if (!cpEmail.trim()) {
      setCpError('Email is required')
      return
    }

    setCpInviting(true)
    setCpError(null)
    setCpResult(null)

    try {
      const result = await createClientPortalInvitation({
        clientId: cpClientId,
        email:    cpEmail,
        role:     cpRole
      })
      const url = buildClientPortalInvitationUrl(result.token)

      // Awaited (not fire-and-forget) — the invitation row is already
      // created either way, but the user needs to know if the email itself
      // didn't go out, since otherwise "Invitation sent" is a false promise.
      const emailResult = await sendClientInvitationEmail({
        invitationId: result.invitation_id
      })

      if (emailResult.sent) {
        setCpResult(`Invitation sent to ${cpEmail.trim()}`)
      } else {
        setCpResult(
          `Invitation created, but the email couldn't be sent (${emailResult.error ?? 'unknown error'}). ` +
          `Share this link with your client manually: ${url}`
        )
      }
      await load()
    } catch (e: any) {
      setCpError(e?.message ?? 'Could not create invitation')
    } finally {
      setCpInviting(false)
    }
  }

  // ── 🆕 A2: Revoke client portal invitation ──────────────────────────────
  async function revokeCpInvitation(id: string) {
    try {
      await revokeClientPortalInvitation(id)
      await load()
    } catch (e: any) {
      console.error('[Clients] Could not revoke client invite:', e)
      setListError(`Could not revoke client portal invitation: ${e?.message ?? 'Unknown error'}`)
    }
  }

  // ── 🆕 Resend client portal invitation ──────────────────────────────────
  // Reuses the invite's existing token/expiry (no new row, no new link) —
  // just re-triggers the branded email in case the first send failed or the
  // client lost it.
  async function resendCpInvitation(inv: ClientPortalInvitationWithClient) {
    setResendingId(inv.id)
    setCpNotice(null)
    try {
      const url = buildClientPortalInvitationUrl(inv.token)

      const emailResult = await sendClientInvitationEmail({
        invitationId: inv.id
      })

      setCpNotice(emailResult.sent
        ? { type: 'success', text: `Invitation resent to ${inv.email}` }
        : { type: 'warning', text: `Couldn't resend to ${inv.email} (${emailResult.error ?? 'unknown error'}). Link: ${url}` }
      )
    } catch (e: any) {
      setCpNotice({ type: 'warning', text: `Couldn't resend invitation: ${e?.message ?? 'Unknown error'}` })
    } finally {
      setResendingId(null)
    }
  }

  // ── Remove member ────────────────────────────────────────────────────────
  async function removeMember(memberId: string) {
    if (!confirm('Remove this member from the workspace?')) return
    await db.from('organization_memberships')
      .update({ is_active: false }).eq('id', memberId)
    await load()
  }

  // ── Change role ──────────────────────────────────────────────────────────
  async function changeRole(memberId: string, role: LpRole) {
    await db.from('organization_memberships')
      .update({ role }).eq('id', memberId)
    await load()
  }

  // 🆕 P4 Fase 1 — Soft-delete (deactivate) a billing client.
  // Preserves history & past invoices; sets is_active=false. Reversible by
  // editing the client (Fase 2 will add the Edit dialog with a reactivate toggle).
  async function deleteClient(c: Client) {
    if (!c.is_active) return
    const ok = window.confirm(
      `Deactivate "${c.display_name}"?

` +
      `This hides the client from new invoices. Historical data is preserved ` +
      `and you can re-activate them later.`
    )
    if (!ok) return
    try {
      await updateClient(c.id, { is_active: false })
      await load()
    } catch (e: any) {
      alert(`Could not deactivate client: ${e?.message ?? 'unknown error'}`)
    }
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 className="lp-page-title">Clients</h1>
          <p className="lp-page-sub">Your billing clients and portal invitations · Team members live in <a href="/team" style={{ color: 'var(--lp-accent)' }}>Team</a></p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <Button
              variant="ghost"
              onClick={() => {
                setShowCpInvite(true)
                setCpResult(null)
                setCpEmail('')
                setCpClientId('')
                setCpRole('client_contact')
                setCpError(null)
              }}
            >
              + Invite to portal
            </Button>
          )}
          {/* 🆕 P4 — LP Add menu (Add Client / Estimate / Import Data) */}
          <LpAddMenu
            orgId={orgId}
            onClientCreated={() => load()}
          />
        </div>
      </div>

      {/* 🆕 B3.7 — Intent banner: shown when user came from LpAddMenu with an intent */}
      {intentActive && (() => {
        const INTENT_META: Record<string, { icon: string; text: string; border: string; bg: string }> = {
          estimate: { icon: '📝', text: 'Select a client to create an estimate for.',                    bg: 'var(--sem-green-bg)',             border: 'var(--sem-green)'                },
          import:   { icon: '📥', text: 'Select the client whose data you want to import.',              bg: 'var(--chat-bubble-internal-bg)',  border: 'var(--chat-bubble-internal-border)' },
          journal:  { icon: '📒', text: 'Select a client to post a manual journal entry.',              bg: 'var(--sem-cyan-bg, #e8f4fb)',     border: 'var(--sem-cyan)'                 },
          period:   { icon: '🔒', text: 'Select a client to manage and close accounting periods.',      bg: 'var(--sem-amber-bg)',             border: 'var(--sem-amber)'                },
          accounts: { icon: '📊', text: 'Select a client to manage their Chart of Accounts.',           bg: 'var(--lp-surface-2)',             border: 'var(--lp-accent)'                },
        }
        const meta = (INTENT_META[intent!] ?? INTENT_META['estimate'])!
        return (
          <div
            style={{
              padding:        '12px 16px',
              marginBottom:   16,
              background:     meta.bg,
              border:         `0.5px solid ${meta.border}`,
              borderRadius:   9,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            12,
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--lp-text)', lineHeight: 1.5 }}>
              <strong style={{ marginRight: 6 }}>{meta.icon}</strong>
              {meta.text}
            </div>
            <button
              onClick={() => navigate('/clients')}
              style={{
                background:   'transparent',
                border:       '0.5px solid var(--lp-border)',
                color:        'var(--lp-text-muted)',
                borderRadius: 6,
                padding:      '4px 10px',
                fontSize:     11,
                cursor:       'pointer',
                fontFamily:   'inherit',
                flexShrink:   0,
              }}
              title="Cancel and return to client list"
            >
              Cancel
            </button>
          </div>
        )
      })()}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '0.5px solid var(--lp-border)' }}>
        {([
          ['clients',        `Billing clients (${clients.length})`],
          ['client_invites', `Client portal invites (${clientInvites.length})`]
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
            color: tab === t ? 'var(--lp-text)' : 'var(--lp-text-muted)',
            fontWeight: tab === t ? 500 : 400,
            borderBottom: `2px solid ${tab === t ? 'var(--lp-accent)' : 'transparent'}`,
            marginBottom: -1, transition: 'all 0.12s'
          }}>
            {label}
          </button>
        ))}
      </div>

      {listError && (
        <div className="lp-banner error"
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>Loading…</div>
      ) : (
        <>
          {/* ── Billing clients tab ──────────────────────────────────────── */}
          {tab === 'clients' && (
            clients.length === 0 ? (
              <div className="lp-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🧑‍💼</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>No billing clients yet</div>
                <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
                  Clients are created when you create an invoice. Go to Invoices → New invoice → New client.
                </div>
              </div>
            ) : (
              <div className="lp-table-wrap">
                <table className="lp-table">
                  <thead>
                    <tr>
                      {['Name', 'Company', 'Email', 'Currency', 'Terms', 'Status', ...(isAdmin ? ['Actions'] : [])].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontSize: 13, color: 'var(--lp-text)', fontWeight: 500 }}>
                          {c.display_name}
                        </td>
                        <td style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
                          {c.company_name ?? '—'}
                        </td>
                        <td style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
                          {c.email ?? '—'}
                        </td>
                        <td style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
                          {c.default_currency}
                        </td>
                        <td style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
                          Net {c.payment_terms}
                        </td>
                        <td>
                          <span style={{
                            fontSize:     11,
                            padding:      '2px 8px',
                            borderRadius: 100,
                            color:        c.is_active ? 'var(--sem-green)' : 'var(--lp-text-muted)',
                            background:   c.is_active ? 'var(--sem-green-bg)' : 'var(--lp-surface-2)',
                            border:       `0.5px solid ${c.is_active ? 'var(--sem-green)' : 'var(--lp-border)'}`
                          }}>
                            {c.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {isAdmin && (
                          <td>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              {/* 🆕 Client Switcher Sprint 2 — Primary action:
                                  enter the client's operational workspace.
                                  🆕 B3.7 — When intent is active, routes per intent
                                  instead (estimates/new or /import?clientId=). */}
                              <button
                                onClick={() => {
                                  if (intentActive) handleClientIntent(c.id)
                                  else navigate(`/clients/${c.id}`)
                                }}
                                title={
                                  intent === 'estimate' ? 'Create estimate for this client' :
                                  intent === 'import'   ? 'Import data for this client'    :
                                  intent === 'journal'  ? 'Post journal entry for this client' :
                                  intent === 'period'   ? 'Manage periods for this client'     :
                                  intent === 'accounts' ? 'Manage Chart of Accounts for this client' :
                                  'Enter client workspace'
                                }
                                style={{
                                  background:   'var(--lp-accent)',
                                  border:       'none',
                                  color:        '#fff',
                                  borderRadius: 6,
                                  padding:      '3px 10px',
                                  fontSize:     11,
                                  fontWeight:   600,
                                  cursor:       'pointer',
                                  fontFamily:   'inherit',
                                  whiteSpace:   'nowrap'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
                                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                              >
                                {intent === 'estimate' ? '→ Estimate' :
                                 intent === 'import'   ? '→ Import'  :
                                 intent === 'journal'  ? '→ Journal' :
                                 intent === 'period'   ? '→ Periods' :
                                 intent === 'accounts' ? '→ Accounts':
                                 '→ Open'}
                              </button>

                              {/* Chat button: opens the floating chat bubble focused on this client */}
                              <button
                                onClick={() => openChat(c.id)}
                                title="Chat with this client"
                                style={{
                                  background:   'transparent',
                                  border:       '0.5px solid var(--lp-border)',
                                  color:        'var(--lp-accent)',
                                  borderRadius: 6,
                                  padding:      '3px 9px',
                                  fontSize:     11,
                                  cursor:       'pointer',
                                  fontFamily:   'inherit'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-bubble-mine-bg)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                              >
                                💬 Chat
                              </button>

                              {/* 🆕 P4 Fase 2.A — Edit button → dedicated page */}
                              <button
                                onClick={() => navigate(`/clients/${c.id}/edit`)}
                                title="Edit client details"
                                style={{
                                  background:   'transparent',
                                  border:       '0.5px solid var(--lp-border)',
                                  color:        'var(--lp-text)',
                                  borderRadius: 6,
                                  padding:      '3px 9px',
                                  fontSize:     11,
                                  cursor:       'pointer',
                                  fontFamily:   'inherit'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                              >
                                ✏ Edit
                              </button>

                              {/* Existing Delete button (Fase 1) */}
                              <button
                                onClick={() => deleteClient(c)}
                                disabled={!c.is_active}
                                title={c.is_active ? 'Deactivate client' : 'Already inactive'}
                                style={{
                                  background:   'transparent',
                                  border:       '0.5px solid var(--lp-border)',
                                  color:        c.is_active ? 'var(--sem-red)' : 'var(--lp-text-muted)',
                                  borderRadius: 6,
                                  padding:      '3px 9px',
                                  fontSize:     11,
                                  cursor:       c.is_active ? 'pointer' : 'not-allowed',
                                  fontFamily:   'inherit',
                                  opacity:      c.is_active ? 1 : 0.5
                                }}
                                onMouseEnter={e => {
                                  if (c.is_active) e.currentTarget.style.background = 'var(--sem-red-bg)'
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = 'transparent'
                                }}
                              >
                                🗑 Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── 🆕 A2: Client portal invites tab ──────────────────────────── */}
          {tab === 'client_invites' && cpNotice && (
            <div className={`lp-banner ${cpNotice.type}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, wordBreak: 'break-word' }}>{cpNotice.text}</span>
              <button
                onClick={() => setCpNotice(null)}
                style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                  background: 'none', border: '0.5px solid var(--lp-border)',
                  color: 'var(--lp-text-muted)', fontFamily: 'inherit', marginLeft: 'auto', flexShrink: 0 }}
              >
                Dismiss
              </button>
            </div>
          )}

          {tab === 'client_invites' && (
            clientInvites.length === 0 ? (
              <div className="lp-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🔗</div>
                <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginBottom: 6 }}>
                  No pending client portal invites
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', opacity: 0.7 }}>
                  Invite your clients to their portal to share documents and respond to queries.
                </div>
              </div>
            ) : (
              <div className="lp-table-wrap">
                <table className="lp-table">
                  <thead>
                    <tr>
                      {['Client', 'Email', 'Role', 'Status', 'Expires', ...(isAdmin ? ['Actions'] : [])].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientInvites.map(inv => {
                      const cfg = CLIENT_PORTAL_ROLE_CONFIG[inv.role]
                      return (
                        <tr key={inv.id}>
                          <td style={{ fontSize: 13, color: 'var(--lp-text)' }}>
                            {inv.clients?.display_name
                              ?? inv.clients?.company_name
                              ?? '—'}
                          </td>
                          <td style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>{inv.email}</td>
                          <td>
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 100, fontWeight: 500,
                              color: cfg.color, background: cfg.bg,
                              border: `0.5px solid ${cfg.color}30`
                            }}>
                              {cfg.label}
                            </span>
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 100,
                              color: 'var(--lp-accent)', background: 'var(--sem-blue-bg)',
                              border: '0.5px solid rgba(59,130,246,0.25)'
                            }}>
                              {inv.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
                            {formatDate(inv.expires_at)}
                          </td>
                          {isAdmin && (
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {inv.status === 'pending' && (
                                  <button
                                    onClick={() => resendCpInvitation(inv)}
                                    disabled={resendingId === inv.id}
                                    style={{
                                      background: 'var(--sem-blue-bg)', border: '0.5px solid rgba(59,130,246,0.25)',
                                      color: 'var(--lp-accent)', borderRadius: 6, padding: '3px 8px',
                                      fontSize: 11, cursor: resendingId === inv.id ? 'default' : 'pointer',
                                      fontFamily: 'inherit', opacity: resendingId === inv.id ? 0.6 : 1
                                    }}
                                  >
                                    {resendingId === inv.id ? 'Sending…' : 'Resend'}
                                  </button>
                                )}
                                <button
                                  onClick={() => revokeCpInvitation(inv.id)}
                                  style={{
                                    background: 'var(--sem-red-bg)', border: '0.5px solid rgba(239,68,68,0.25)',
                                    color: 'var(--sem-red)', borderRadius: 6, padding: '3px 8px',
                                    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit'
                                  }}
                                >
                                  Revoke
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {/* ── Invite modal ────────────────────────────────────────────────── */}
      <Modal
        open={showInvite}
        onClose={() => { setShowInvite(false); setInvResult(null) }}
        title="Invite team member"
        width={420}
        footer={!invResult ? (
          <>
            <Button variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button variant="primary" loading={inviting} disabled={!invEmail.trim()} onClick={handleInvite}>
              Send invitation
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => { setShowInvite(false); setInvResult(null) }}>
            Done
          </Button>
        )}
      >
        {!invResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {invError && (
              <div style={{
                padding: '8px 12px', borderRadius: 7, fontSize: 12.5, color: 'var(--sem-red)',
                background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)'
              }}>
                {invError}
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Email address
              </label>
              <input
                type="email" className="lp-input" autoFocus
                placeholder="colleague@example.com"
                value={invEmail} onChange={e => setInvEmail(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Role
              </label>
              <select className="lp-input" value={invRole} onChange={e => setInvRole(e.target.value as LpRole)}>
                {assignableRoles.map(r => (
                  <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11.5, color: 'var(--lp-text-stronger)', marginTop: 5 }}>
                {ROLE_CONFIG[invRole]?.description ?? ''}
              </div>
              <div style={{
                marginTop: 8,
                padding: '7px 10px',
                borderRadius: 6,
                fontSize: 11,
                background: 'rgba(251,191,36,0.06)',
                border: '0.5px solid rgba(251,191,36,0.18)',
                color: 'var(--lp-text-muted)',
                lineHeight: 1.6
              }}>
                💡 Owner and tier (admin / tester) assignments are managed
                by your firm administrator.
              </div>
            </div>
            <div style={{
              padding: '9px 12px', borderRadius: 7, fontSize: 12,
              background: 'rgba(59,130,246,0.06)', border: '0.5px solid var(--sem-blue-bg-strong)',
              color: 'var(--lp-text-muted)', lineHeight: 1.6
            }}>
              An invitation link valid for 7 days will be generated. Share it with the person directly.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✉️</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
                Invitation created
              </div>
              <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginBottom: 16 }}>
                Share this link with <strong style={{ color: 'var(--lp-text)' }}>{invEmail}</strong>
              </div>
            </div>
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid var(--lp-border)',
              fontFamily: 'monospace', fontSize: 11.5,
              color: 'var(--lp-text-muted)', wordBreak: 'break-all', lineHeight: 1.6
            }}>
              {invResult}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(invResult)}
              className="lp-btn lp-btn-ghost"
              style={{ justifyContent: 'center' }}
            >
              📋 Copy link
            </button>
            <div style={{ fontSize: 11.5, color: 'var(--lp-text-stronger)', textAlign: 'center' }}>
              Link expires in 7 days · Role: {ROLE_CONFIG[invRole].label}
            </div>
          </div>
        )}
      </Modal>

      {/* ── 🆕 A2: Client Portal Invite modal ─────────────────────────────── */}
      <Modal
        open={showCpInvite}
        onClose={() => { setShowCpInvite(false); setCpResult(null) }}
        title="Invite a contact to a client's portal"
        width={480}
        footer={!cpResult ? (
          <>
            <Button variant="ghost" onClick={() => setShowCpInvite(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={cpInviting}
              disabled={!cpClientId || !cpEmail.trim()}
              onClick={handleCpInvite}
            >
              Send invitation
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => { setShowCpInvite(false); setCpResult(null) }}>
            Done
          </Button>
        )}
      >
        {!cpResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {cpError && (
              <div style={{
                padding: '8px 12px', borderRadius: 7, fontSize: 12.5, color: 'var(--sem-red)',
                background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)'
              }}>
                {cpError}
              </div>
            )}

            {/* What this actually does — this invites a PERSON at an existing
                client to log into that client's portal (view invoices, upload
                documents, message the firm). It does not create a new client
                record — "+ Add Client" does that, separately, with its own
                (larger) set of business fields. */}
            <div style={{
              padding: '9px 12px', borderRadius: 7, fontSize: 12,
              background: 'var(--sem-blue-bg)', border: '0.5px solid var(--sem-blue-border)',
              color: 'var(--lp-text-muted)', lineHeight: 1.5
            }}>
              This invites someone at an existing client to sign in to their own portal —
              it doesn't create a new client.
            </div>

            {/* Client selector */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Which client is this for?
              </label>

              {clients.length === 0 ? (
                /* 🆕 BUG#1 fix: friendly empty state instead of empty dropdown */
                <div style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: 'rgba(251,191,36,0.06)',
                  border: '0.5px solid rgba(251,191,36,0.30)',
                  fontSize: 12.5, color: 'var(--sem-amber-soft)', lineHeight: 1.55
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    No clients in your workspace yet
                  </div>
                  <div style={{ color: 'var(--lp-border-2)', fontSize: 11.5 }}>
                    Create a client first from the <strong>Billing clients</strong> tab,
                    then come back here to invite them to the portal.
                  </div>
                </div>
              ) : (
                <>
                  <select
                    className="lp-input"
                    value={cpClientId}
                    onChange={e => setCpClientId(e.target.value)}
                  >
                    <option value="">— Select a client —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.display_name ?? c.company_name ?? '(unnamed)'}
                      </option>
                    ))}
                  </select>

                  {/* Who this invite is actually for — answers "which client?"
                      at a glance instead of just an id in a dropdown. */}
                  {cpClientId && (() => {
                    const selected = clients.find(c => c.id === cpClientId)
                    if (!selected) return null
                    return (
                      <div style={{
                        marginTop: 8, padding: '8px 12px', borderRadius: 7,
                        background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)',
                        fontSize: 12, color: 'var(--lp-text)'
                      }}>
                        Inviting a contact for{' '}
                        <strong>{selected.display_name ?? selected.company_name}</strong>
                        {selected.company_name && selected.display_name !== selected.company_name && (
                          <span style={{ color: 'var(--lp-text-muted)' }}> · {selected.company_name}</span>
                        )}
                        {selected.email && (
                          <span style={{ color: 'var(--lp-text-muted)' }}> · on file: {selected.email}</span>
                        )}
                      </div>
                    )
                  })()}
                </>
              )}
            </div>

            {/* Email */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Email address
              </label>
              <input
                type="email"
                className="lp-input"
                placeholder="client@example.com"
                value={cpEmail}
                onChange={e => setCpEmail(e.target.value)}
              />
            </div>

            {/* Role */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
                Portal role
              </label>
              <select
                className="lp-input"
                value={cpRole}
                onChange={e => setCpRole(e.target.value as ClientPortalRole)}
              >
                <option value="client_owner">Owner</option>
                <option value="client_contact">Contact</option>
                <option value="client_viewer">Viewer</option>
              </select>
              <div style={{ fontSize: 11.5, color: 'var(--lp-text-stronger)', marginTop: 5 }}>
                {CLIENT_PORTAL_ROLE_CONFIG[cpRole].description}
              </div>
            </div>

            {/* Info banner */}
            <div style={{
              padding: '9px 12px', borderRadius: 7, fontSize: 12,
              background: 'rgba(59,130,246,0.06)', border: '0.5px solid var(--sem-blue-bg-strong)',
              color: 'var(--lp-text-muted)', lineHeight: 1.5
            }}>
              📨 An invitation link will be generated. You can share it with the client via
              email, WhatsApp, or any channel you prefer. Link expires in 7 days.
            </div>
          </div>
        ) : (
          /* Success state — show copyable link */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              padding: '16px 18px', borderRadius: 10, fontSize: 14,
              background: 'rgba(34,197,94,0.08)', border: '0.5px solid var(--sem-green-border)',
              color: 'var(--sem-green)', lineHeight: 1.5
            }}>
              ✓ {cpResult}
            </div>

            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              The client will receive an email with a link to set up their account.<br />
              Link expires in 7 days · Role: {CLIENT_PORTAL_ROLE_CONFIG[cpRole].label}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
