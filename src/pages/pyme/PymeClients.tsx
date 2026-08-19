// PATH: src/pages/pyme/PymeClients.tsx
//
// P4 Fase 2.D — Client management page for PYME owners.
//
// Audience: pyme_owner / pyme_staff. NOT the bookkeeper (they use /clients).
//
// What this page does:
//   · Lists the pyme's billing customers (clients table scoped by org_id)
//   · Search by name / company / email (client-side filter)
//   · Toggle "show inactive" to view deactivated customers
//   · Add new client (reuses AddClientDialog)
//   · Edit any client (PymeClientEditDialog modal)
//   · Chat about a client (navigates to /messages with focusClientId)
//   · Deactivate a client (soft-delete via is_active = false)
//
// What it does NOT do:
//   · Invite to portal (bookkeeper's job, on /clients page)
//   · Assign accountant (bookkeeper's job)
//   · Hard-delete (Constitution: clients with invoices/estimates must stay)

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate }        from 'react-router-dom'
import { useAuthStore }       from '../../store/auth.store'
import { useChatBubbleStore } from '../../store/chat-bubble.store'
import {
  getClients,
  deactivateClient,
  getClientUsageCount
} from '../../services/invoice.service'
import AddClientDialog from '../../components/clients/AddClientDialog'
import PymeClientEditDialog from '../../components/pyme/PymeClientEditDialog'
import SemaphoreSpinner from '../../components/ui/SemaphoreSpinner'
import type { Client } from '../../types/database.types'

export default function PymeClients() {
  const navigate     = useNavigate()
  const { openChat } = useChatBubbleStore()
  const { membership, loading: authLoading } = useAuthStore()
  const orgId = membership?.org_id ?? ''

  // ── Data ───────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // ── Filters ────────────────────────────────────────────────────────────
  const [search,      setSearch]      = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // ── Dialogs ────────────────────────────────────────────────────────────
  const [addOpen,        setAddOpen]        = useState(false)
  const [editingClient,  setEditingClient]  = useState<Client | null>(null)

  // ── Load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const list = await getClients(orgId)
      setClients(list)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load clients')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  // ── Filtering ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter(c => {
      if (!showInactive && !c.is_active) return false
      if (showInactive  &&  c.is_active) return false
      if (!q) return true
      return (
        c.display_name.toLowerCase().includes(q) ||
        (c.company_name ?? '').toLowerCase().includes(q) ||
        (c.email        ?? '').toLowerCase().includes(q) ||
        (c.phone        ?? '').toLowerCase().includes(q)
      )
    })
  }, [clients, search, showInactive])

  const activeCount   = useMemo(() => clients.filter(c =>  c.is_active).length, [clients])
  const inactiveCount = useMemo(() => clients.filter(c => !c.is_active).length, [clients])

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleDeactivate(client: Client) {
    // First, fetch usage so we can warn the user
    let usage: { invoices: number; estimates: number } = { invoices: 0, estimates: 0 }
    try {
      usage = await getClientUsageCount(client.id)
    } catch (e: any) {
      // Non-fatal — proceed with a generic confirm
      console.warn('Could not fetch client usage:', e?.message)
    }

    const usageNote =
      usage.invoices > 0 || usage.estimates > 0
        ? `\n\nThis client has ${usage.invoices} invoice(s) and ${usage.estimates} estimate(s). ` +
          `These records will be preserved for audit purposes.`
        : ''

    const ok = window.confirm(
      `Deactivate ${client.display_name}?\n\n` +
      `They will no longer appear in active dropdowns or default lists. ` +
      `You can re-activate them later.` +
      usageNote
    )
    if (!ok) return

    try {
      await deactivateClient(client.id)
      await load()
    } catch (e: any) {
      alert(`Could not deactivate client: ${e?.message ?? 'unknown error'}`)
    }
  }

  function handleClientCreated() {
    setAddOpen(false)
    load()
  }

  function handleClientUpdated() {
    setEditingClient(null)
    load()
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
        <SemaphoreSpinner size="md" inline />
      </div>
    )
  }

  if (!orgId) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--lp-text-muted)' }}>
        No workspace selected.
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 18
      }}>
        <div>
          <h1 className="lp-page-title" style={{ margin: 0 }}>
            My Customers
          </h1>
          <p className="lp-page-sub" style={{ margin: '4px 0 0 0' }}>
            Manage the customers you bill. Edit info, chat with your bookkeeper,
            or deactivate ones you no longer work with.
          </p>
        </div>

        {/* Hidden only in the TRUE empty state (no customers at all, no
            search/inactive filter active) — the empty-state CTA below is
            the sole call-to-action there, same condition it uses. */}
        {!(!loading && !error && filtered.length === 0 && !search && !showInactive) && (
          <button
            onClick={() => setAddOpen(true)}
            style={{
              background:   'var(--lp-accent)',
              border:       'none',
              color:        '#fff',
              borderRadius: 8,
              padding:      '8px 14px',
              fontSize:     12.5,
              fontWeight:   600,
              cursor:       'pointer',
              fontFamily:   'inherit',
              whiteSpace:   'nowrap'
            }}
          >
            + New customer
          </button>
        )}
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, company, email…"
          className="lp-input"
          style={{ flex: 1, minWidth: 220, maxWidth: 420, fontSize: 12.5 }}
        />

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setShowInactive(false)}
            style={chipStyle(!showInactive)}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setShowInactive(true)}
            style={chipStyle(showInactive)}
          >
            Inactive ({inactiveCount})
          </button>
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '10px 14px',
          background: 'var(--sem-red-bg)',
          border: '0.5px solid var(--sem-red)',
          borderRadius: 8,
          color: 'var(--sem-red)',
          fontSize: 12.5,
          marginBottom: 14
        }}>
          ⚠ {error}
          <button
            onClick={load}
            style={{
              marginLeft: 12,
              background: 'transparent',
              border: '0.5px solid var(--sem-red)',
              color: 'var(--sem-red)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
          <SemaphoreSpinner size="sm" inline />
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && filtered.length === 0 && !error && (
        <div style={{
          padding: '40px 24px',
          textAlign: 'center',
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border)',
          borderRadius: 10
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>
            {search ? '🔍' : showInactive ? '📭' : '👥'}
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600,
            color: 'var(--lp-text)', marginBottom: 4
          }}>
            {search
              ? 'No customers match your search'
              : showInactive
                ? 'No inactive customers'
                : 'No customers yet'}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--lp-text-muted)',
            marginBottom: search ? 0 : 14
          }}>
            {search
              ? 'Try a different search term.'
              : showInactive
                ? 'Deactivated customers will appear here.'
                : 'Add your first customer to start billing.'}
          </div>
          {!search && !showInactive && (
            <button
              onClick={() => setAddOpen(true)}
              style={{
                background:   'var(--lp-accent)',
                border:       'none',
                color:        '#fff',
                borderRadius: 8,
                padding:      '7px 14px',
                fontSize:     12,
                fontWeight:   600,
                cursor:       'pointer',
                fontFamily:   'inherit'
              }}
            >
              + New customer
            </button>
          )}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr 1fr 110px 200px',
            gap: 12,
            padding: '10px 14px',
            background: 'var(--lp-surface-2)',
            borderBottom: '0.5px solid var(--lp-border)',
            fontSize: 10,
            color: 'var(--lp-text-muted)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em'
          }}>
            <div>Customer</div>
            <div>Email</div>
            <div>Phone</div>
            <div>Terms</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {/* Rows */}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              onClick={() => setEditingClient(c)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 1fr 110px 200px',
                gap: 12,
                padding: '11px 14px',
                borderBottom: i < filtered.length - 1
                  ? '0.5px solid var(--chat-row-divider)'
                  : 'none',
                cursor: 'pointer',
                fontSize: 12.5,
                color: 'var(--lp-text)',
                transition: 'background 0.12s',
                alignItems: 'center',
                opacity: c.is_active ? 1 : 0.55
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-row-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {/* Customer name + company */}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--lp-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {c.display_name}
                  {!c.is_active && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: 9.5,
                      padding: '1px 6px',
                      borderRadius: 100,
                      background: 'var(--lp-surface-2)',
                      border: '0.5px solid var(--lp-border)',
                      color: 'var(--lp-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 600,
                      verticalAlign: 'middle'
                    }}>
                      Inactive
                    </span>
                  )}
                </div>
                {c.company_name && (
                  <div style={{
                    fontSize: 11,
                    color: 'var(--lp-text-muted)',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {c.company_name}
                  </div>
                )}
              </div>

              {/* Email */}
              <div style={{
                fontSize: 12,
                color: 'var(--lp-text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {c.email ?? '—'}
              </div>

              {/* Phone */}
              <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
                {c.phone ?? '—'}
              </div>

              {/* Payment terms */}
              <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                Net {c.payment_terms ?? 30}
              </div>

              {/* Actions */}
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'flex',
                  gap: 4,
                  justifyContent: 'flex-end',
                  alignItems: 'center'
                }}
              >
                <button
                  onClick={() => openChat(c.id)}
                  title="Chat with bookkeeper about this customer"
                  style={iconBtnStyle('var(--lp-accent)')}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-bubble-mine-bg)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  💬
                </button>
                <button
                  onClick={() => setEditingClient(c)}
                  title="Edit customer info"
                  style={iconBtnStyle('var(--lp-text)')}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  ✏ Edit
                </button>
                {c.is_active && (
                  <button
                    onClick={() => handleDeactivate(c)}
                    title="Deactivate customer (preserves history)"
                    style={iconBtnStyle('var(--sem-red)')}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--sem-red-bg)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <AddClientDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        orgId={orgId}
        onCreated={handleClientCreated}
      />

      <PymeClientEditDialog
        open={editingClient !== null}
        client={editingClient}
        onClose={() => setEditingClient(null)}
        onSaved={handleClientUpdated}
      />
    </div>
  )
}

// ── Style helpers ──────────────────────────────────────────────────────────

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding:      '5px 11px',
    borderRadius: 100,
    background:   active ? 'var(--chat-bubble-mine-bg)' : 'transparent',
    border:       `0.5px solid ${active ? 'var(--lp-accent)' : 'var(--lp-border)'}`,
    color:        active ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
    fontSize:     11.5,
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'inherit',
    whiteSpace:   'nowrap'
  }
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    background:   'transparent',
    border:       '0.5px solid var(--lp-border)',
    color,
    borderRadius: 6,
    padding:      '3px 8px',
    fontSize:     10.5,
    cursor:       'pointer',
    fontFamily:   'inherit'
  }
}