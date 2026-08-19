// PATH: src/pages/client/ClientConnectBank.tsx
// Dedicated bank connection screen for PYME owners.
// Uses the enriched Plaid service context for client portal ownership.

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { useClientContext } from '../../hooks/useClientContext'
import {
  openPlaidLink,
  syncTransactions,
  getBankConnections
} from '../../services/plaid.service'

interface ClientBankConnection {
  id: string
  institution_name: string | null
  account_name: string | null
  account_type: string | null
  account_subtype: string | null
  mask: string | null
  sync_status: string | null
  sync_error: string | null
  last_synced_at: string | null
  connected_at?: string | null
  created_at?: string | null
}

const STATUS_COLOR: Record<string, string> = {
  ok: '#22c55e',
  error: '#ef4444',
  disconnected: '#f59e0b',
  consent_expired: '#ef4444',
  pending: '#f59e0b'
}

const STATUS_LABEL: Record<string, string> = {
  ok: 'Active',
  error: 'Sync error',
  disconnected: 'Disconnected',
  consent_expired: 'Login required',
  pending: 'Pending'
}

export default function ClientConnectBank() {
  const { profile } = useAuthStore()
  const { clientId, orgId } = useClientContext()

  const [connections, setConnections] = useState<ClientBankConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const firstName =
    profile?.display_name?.trim().split(' ')[0] ??
    profile?.email?.split('@')[0] ??
    'there'

  const loadConnections = useCallback(async () => {
    if (!orgId || !clientId) {
      setConnections([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await getBankConnections({ orgId, clientId })
      setConnections((data ?? []) as ClientBankConnection[])
    } catch (err: any) {
      setError(err?.message ?? 'Could not load bank connections')
      setConnections([])
    } finally {
      setLoading(false)
    }
  }, [orgId, clientId])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  async function handleConnect() {
    if (!orgId || !clientId || !profile?.id || connecting || syncing) return

    setConnecting(true)
    setError(null)
    setSuccess(null)

    try {
      await openPlaidLink({
        orgId,
        clientId,
        initiatedBy: 'client_portal',
        authorizedBy: profile.id
      })

      setSyncing(true)
      const sync = await syncTransactions(orgId)

      setSuccess(
        `Connection completed. ${sync.added} new transaction${sync.added === 1 ? '' : 's'} imported.`
      )

      if (sync.errors?.length) {
        setError(sync.errors.join(' · '))
      }

      await loadConnections()
    } catch (err: any) {
      if (err?.message !== 'CANCELLED') {
        setError(err?.message ?? 'Connection failed')
      }
    } finally {
      setConnecting(false)
      setSyncing(false)
    }
  }

  const hasConnections = connections.length > 0

  return (
    <div
      style={{
        padding: '32px 32px',
        flex: 1,
        overflow: 'auto',
        maxWidth: 720,
        margin: '0 auto',
        width: '100%'
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <h1 className="lp-page-title">Bank Connections</h1>
        <p className="lp-page-sub">
          {hasConnections
            ? 'Manage your connected bank accounts'
            : `Securely link your bank to get started, ${firstName}`}
        </p>
      </div>

      {/* Current connections */}
      {hasConnections && (
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--lp-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 10
            }}
          >
            Connected accounts
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {connections.map(c => {
              const status = c.sync_status ?? 'pending'
              const color = STATUS_COLOR[status] ?? '#64748b'
              const label = STATUS_LABEL[status] ?? status

              return (
                <div
                  key={c.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    background: 'var(--lp-surface)',
                    border: '0.5px solid var(--lp-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14
                  }}
                >
                  <span style={{ fontSize: 18 }}>🏦</span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: 'var(--lp-text)',
                        marginBottom: 2
                      }}
                    >
                      {c.institution_name ?? 'Bank connection'}
                    </div>

                    <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                      {c.account_name ?? 'Account'}
                      {c.mask ? (
                        <span style={{ fontFamily: 'monospace' }}> · ····{c.mask}</span>
                      ) : null}
                    </div>

                    <div style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
                      {c.last_synced_at
                        ? `Last synced: ${new Date(c.last_synced_at).toLocaleString()}`
                        : 'Awaiting first sync'}
                    </div>

                    {c.sync_error && (
                      <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4 }}>
                        ⚠ {c.sync_error}
                      </div>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      padding: '3px 9px',
                      borderRadius: 100,
                      color,
                      background: `${color}14`,
                      border: `0.5px solid ${color}40`
                    }}
                  >
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Trust / security messaging */}
      <div
        style={{
          padding: '20px',
          borderRadius: 12,
          marginBottom: 18,
          background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(167,139,250,0.04))',
          border: '0.5px solid rgba(59,130,246,0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>🔐</span>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>
            How we keep your data safe
          </div>
        </div>

        <ul
          style={{
            margin: 0,
            paddingLeft: 22,
            fontSize: 12.5,
            color: 'var(--lp-text-muted)',
            lineHeight: 1.9
          }}
        >
          <li>
            Powered by <strong style={{ color: '#93c5fd' }}>Plaid</strong>
          </li>
          <li>Bank-grade encryption in transit and at rest</li>
          <li>Your login credentials never touch our servers</li>
          <li>Read-only access — we cannot move money or make changes</li>
          <li>Your accountant sees transaction data, not your banking password</li>
        </ul>
      </div>

      {/* Loading */}
      {loading && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 13,
            background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid var(--lp-border)',
            color: 'var(--lp-text-muted)'
          }}
        >
          Loading bank connections…
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 13,
            background: 'rgba(239,68,68,0.08)',
            border: '0.5px solid rgba(239,68,68,0.3)',
            color: '#ef4444'
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Success */}
      {success && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 13,
            background: 'rgba(34,197,94,0.08)',
            border: '0.5px solid rgba(34,197,94,0.3)',
            color: '#22c55e'
          }}
        >
          ✓ {success}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleConnect}
        disabled={connecting || syncing || !orgId || !clientId || !profile?.id}
        style={{
          width: '100%',
          padding: '13px 20px',
          borderRadius: 10,
          cursor: connecting || syncing ? 'not-allowed' : 'pointer',
          background: connecting || syncing ? 'rgba(167,139,250,0.5)' : '#a78bfa',
          color: '#1c1330',
          border: 'none',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 600,
          transition: 'background 0.12s'
        }}
      >
        {connecting
          ? 'Opening Plaid…'
          : syncing
            ? 'Syncing transactions…'
            : hasConnections
              ? '+ Connect Another Account'
              : '🔒 Connect My Bank Securely'}
      </button>

      <p style={{ fontSize: 11.5, color: '#475569', textAlign: 'center', marginTop: 12 }}>
        Takes less than 2 minutes
      </p>
    </div>
  )
}