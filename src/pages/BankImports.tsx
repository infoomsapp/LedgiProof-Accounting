// PATH: src/pages/BankImports.tsx
//
// CSS-TODO (file-level): remaining: #334155 (slate-700, 4 occurrences) needs --lp-text-stronger. Unique semantic alpha gradations for sync-status states. Direct mappings migrated.
//
import { useState, useEffect, useCallback } from 'react'
import { useNavigate }   from 'react-router-dom'
import { useAuthStore }  from '../store/auth.store'
import { useScope }      from '../hooks/useScope'
import {
  openPlaidLink, syncTransactions, getBankConnections, disconnectBank
} from '../services/plaid.service'
import SemaphoreSpinner from '../components/ui/SemaphoreSpinner'

interface BankConnection {
  id:               string
  institution_name: string
  account_name:     string
  account_type:     string
  account_subtype:  string
  mask:             string
  sync_status:      string
  sync_error:       string | null
  last_synced_at:   string | null
  connected_at:     string
}

const STATUS_COLOR: Record<string, string> = {
  ok:               'var(--sem-green)',
  error:            'var(--sem-red)',
  disconnected:     'var(--sem-amber)',
  consent_expired:  'var(--sem-red)'
}

const STATUS_LABEL: Record<string, string> = {
  ok:               'Connected',
  error:            'Sync error',
  disconnected:     'Disconnected',
  consent_expired:  'Login required'
}

function AccountTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    depository: '🏦',
    credit:     '💳',
    investment: '📈',
    loan:       '📋',
    other:      '🏛'
  }
  return <span>{icons[type] ?? icons.other}</span>
}

export default function BankImports() {
  const navigate = useNavigate()
  const { membership }                          = useAuthStore()
  // scope.clientId is set when reached via /clients/:clientId/imports.
  // Without it, every client's bank connections were combined into one
  // unfiltered list — the plaid.service.ts functions already fully support
  // client_id (openPlaidLink/getBankConnections both accept it), the page
  // just never passed it through.
  const scope                                   = useScope()
  const orgId                                   = scope.orgId
  const clientId                                = scope.clientId

  const [connections, setConnections]           = useState<BankConnection[]>([])
  const [loading,     setLoading]               = useState(true)
  const [connecting,  setConnecting]            = useState(false)
  const [syncing,     setSyncing]               = useState<string | null>(null)  // connection id or 'all'
  const [syncResult,  setSyncResult]            = useState<{ added: number; removed: number } | null>(null)
  const [error,       setError]                 = useState<string | null>(null)
  const [disconnecting, setDisconnecting]       = useState<string | null>(null)

  // ── Load connections ──────────────────────────────────────────────────
  const loadConnections = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const data = await getBankConnections({ orgId, clientId })
      setConnections(data as BankConnection[])
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [orgId, clientId])

  useEffect(() => { loadConnections() }, [loadConnections])

  // ── Connect bank via Plaid Link ───────────────────────────────────────
  async function handleConnect() {
    if (!orgId) return
    setConnecting(true)
    setError(null)
    setSyncResult(null)

    try {
      const result = await openPlaidLink({ orgId, clientId, initiatedBy: 'staff' })

      // Auto-sync after connecting
      setSyncing('all')
      const sync = await syncTransactions(orgId)
      setSyncResult({ added: sync.added, removed: sync.removed })
      setSyncing(null)

      await loadConnections()

      setError(null)
    } catch (e: any) {
      if (e.message !== 'CANCELLED') {
        setError(e.message)
      }
    }
    setConnecting(false)
  }

  // ── Sync one connection ───────────────────────────────────────────────
  async function handleSync(connectionId: string) {
    setSyncing(connectionId)
    setError(null)
    setSyncResult(null)
    try {
      const result = await syncTransactions(orgId, connectionId)
      setSyncResult({ added: result.added, removed: result.removed })
      if (result.errors?.length) setError(result.errors.join(' · '))
      await loadConnections()
    } catch (e: any) {
      setError(e.message)
    }
    setSyncing(null)
  }

  // ── Sync all connections ──────────────────────────────────────────────
  async function handleSyncAll() {
    setSyncing('all')
    setError(null)
    setSyncResult(null)
    try {
      const result = await syncTransactions(orgId)
      setSyncResult({ added: result.added, removed: result.removed })
      if (result.errors?.length) setError(result.errors.join(' · '))
      await loadConnections()
    } catch (e: any) {
      setError(e.message)
    }
    setSyncing(null)
  }

  // ── Disconnect ────────────────────────────────────────────────────────
  async function handleDisconnect(id: string) {
    if (!confirm('Disconnect this bank account? Existing transactions are kept.')) return
    setDisconnecting(id)
    try {
      await disconnectBank(id, orgId)
      await loadConnections()
    } catch (e: any) {
      setError(e.message)
    }
    setDisconnecting(null)
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="lp-page-title">Bank Connections</h1>
          <p className="lp-page-sub">
            Connect your bank via Plaid — transactions sync automatically
            {' · '}
            <button
              onClick={() => navigate('/import/bank-transactions')}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--lp-accent)', fontSize: 'inherit', fontFamily: 'inherit',
                textDecoration: 'underline'
              }}
            >
              Import a CSV file instead
            </button>
          </p>
        </div>

        {/* Only shown once a bank is already connected — with zero connections,
            the centered empty-state "+ Connect my bank" button below is the
            sole call-to-action, so this doesn't duplicate it. */}
        {connections.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSyncAll}
              disabled={!!syncing}
              className="lp-btn lp-btn-ghost"
            >
              {syncing === 'all'
                ? <><SemaphoreSpinner size="md" inline /> Syncing…</>
                : '↻ Sync all'
              }
            </button>
            <button
              onClick={handleConnect}
              disabled={connecting || !!syncing}
              className="lp-btn lp-btn-primary"
            >
              {connecting
                ? <><SemaphoreSpinner size="md" inline /> Connecting…</>
                : '+ Connect bank'
              }
            </button>
          </div>
        )}
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: 'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.3)',
          color: 'var(--sem-green)', display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: 16 }}>✓</span>
          <span>
            Sync complete —{' '}
            <strong>{syncResult.added}</strong> new transactions imported
            {syncResult.removed > 0 && <>, <strong>{syncResult.removed}</strong> removed</>}
          </span>
          <button
            onClick={() => setSyncResult(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14 }}
          >✕</button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: 'var(--sem-red-bg)', border: '0.5px solid rgba(239,68,68,0.3)',
          color: 'var(--sem-red)', display: 'flex', alignItems: 'center', gap: 10
        }}>
          ⚠ {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14 }}
          >✕</button>
        </div>
      )}

      {/* Connections list */}
      {loading ? (
        <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading connections…</div>
      ) : connections.length === 0 ? (

        /* Empty state */
        <div className="lp-card" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🏦</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 8 }}>
            No bank accounts connected
          </div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.7 }}>
            Connect your bank account via Plaid to automatically import and classify transactions. Supports 12,000+ US banks.
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="lp-btn lp-btn-primary"
            style={{ padding: '10px 28px' }}
          >
            {connecting ? 'Opening Plaid…' : '+ Connect my bank'}
          </button>
          <div style={{ fontSize: 11.5, color: '#334155', marginTop: 14 }}>
            Your credentials are never stored by LedgiProof — Plaid handles authentication securely.
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginTop: 18 }}>
            Bank not supported, or prefer a file?{' '}
            <button
              onClick={() => navigate('/import/bank-transactions')}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--lp-accent)', fontSize: 'inherit', fontFamily: 'inherit',
                textDecoration: 'underline'
              }}
            >
              Import a CSV file instead
            </button>
          </div>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {connections.map(conn => (
            <div key={conn.id} className="lp-card" style={{
              display: 'flex', alignItems: 'center', gap: 16,
              borderColor: conn.sync_status !== 'ok' ? 'rgba(239,68,68,0.25)' : undefined
            }}>
              {/* Bank icon */}
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: 'rgba(59,130,246,0.1)',
                border: '0.5px solid rgba(59,130,246,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
              }}>
                <AccountTypeIcon type={conn.account_type} />
              </div>

              {/* Bank info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>
                    {conn.institution_name}
                  </span>
                  <span style={{
                    fontSize: 10.5, padding: '2px 7px', borderRadius: 100,
                    color: STATUS_COLOR[conn.sync_status] ?? 'var(--lp-text-muted)',
                    background: `${STATUS_COLOR[conn.sync_status] ?? 'var(--lp-text-muted)'}18`,
                    border: `0.5px solid ${STATUS_COLOR[conn.sync_status] ?? 'var(--lp-text-muted)'}40`,
                    fontWeight: 500
                  }}>
                    {STATUS_LABEL[conn.sync_status] ?? conn.sync_status}
                  </span>
                </div>

                <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
                  {conn.account_name}
                  {conn.mask && (
                    <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                      {' '}····{conn.mask}
                    </span>
                  )}
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: '#334155', textTransform: 'capitalize' }}>
                    {conn.account_subtype}
                  </span>
                </div>

                {conn.last_synced_at && (
                  <div style={{ fontSize: 11, color: '#334155', marginTop: 3 }}>
                    Last sync: {new Date(conn.last_synced_at).toLocaleString()}
                  </div>
                )}
                {conn.sync_error && (
                  <div style={{ fontSize: 11.5, color: 'var(--sem-red)', marginTop: 3 }}>
                    ⚠ {conn.sync_error}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => handleSync(conn.id)}
                  disabled={syncing === conn.id || syncing === 'all'}
                  className="lp-btn lp-btn-ghost"
                  style={{ fontSize: 12, padding: '5px 12px' }}
                >
                  {syncing === conn.id
                    ? <><SemaphoreSpinner size="md" inline /> Syncing</>
                    : '↻ Sync'
                  }
                </button>
                <button
                  onClick={() => handleDisconnect(conn.id)}
                  disabled={disconnecting === conn.id}
                  className="lp-btn lp-btn-ghost"
                  style={{ fontSize: 12, padding: '5px 10px', color: 'var(--sem-red)', borderColor: 'rgba(239,68,68,0.2)' }}
                >
                  {disconnecting === conn.id ? '…' : '✕'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Security note */}
      <div style={{
        marginTop: 24, padding: '12px 14px', borderRadius: 8,
        background: 'rgba(255,255,255,0.02)', border: '0.5px solid var(--lp-border)',
        fontSize: 12, color: '#334155', lineHeight: 1.7, display: 'flex', gap: 10
      }}>
        <span style={{ flexShrink: 0 }}>🔒</span>
        <span>
          Bank credentials are handled entirely by Plaid and never stored by LedgiProof.
          Your access token is stored encrypted in Supabase Vault and is only used server-side.
        </span>
      </div>
    </div>
  )
}