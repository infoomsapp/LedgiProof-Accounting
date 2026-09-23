// PATH: src/components/settings/ApiAccessTab.tsx
// API access — Accountant/Enterprise plan feature. Generate/revoke keys for
// the read-only API (see supabase/functions/api-v1).

import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import FeatureGate from './FeatureGate'
import { listApiKeys, createApiKey, revokeApiKey, type ApiKey } from '../../services/api-keys.service'

interface Props {
  onMessage: (m: { type: 'ok' | 'err'; text: string }) => void
}

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-v1`

export default function ApiAccessTab({ onMessage }: Props) {
  return (
    <FeatureGate
      featureKey="api_access"
      title="API access"
      description="Generate a key to pull your transactions, invoices, and vendors into your own scripts or BI tool. Available on the Accountant plan."
    >
      <ApiAccessTabContent onMessage={onMessage} />
    </FeatureGate>
  )
}

function ApiAccessTabContent({ onMessage }: Props) {
  const { membership } = useAuthStore()
  const orgId = membership?.org_id ?? ''

  const [keys, setKeys]       = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName]       = useState('')
  const [creating, setCreating] = useState(false)
  const [freshKey, setFreshKey] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    load()
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      setKeys(await listApiKeys(orgId))
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not load API keys' })
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const { key } = await createApiKey(orgId, name.trim())
      setFreshKey(key)
      setName('')
      load()
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not create the API key' })
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeApiKey(id)
      onMessage({ type: 'ok', text: 'Key revoked.' })
      load()
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not revoke the key' })
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div className="lp-page-title" style={{ fontSize: 16 }}>API access</div>
        <div className="lp-page-sub">
          Read-only access to your transactions, invoices, and vendors.{' '}
          <code style={{ fontSize: 11.5 }}>{API_BASE}/&lt;resource&gt;</code>
        </div>
      </div>

      {freshKey && (
        <div className="lp-card" style={{
          marginBottom: 16, borderColor: 'var(--sem-amber-border)', background: 'var(--sem-amber-bg)'
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 8 }}>
            Copy this key now — it won't be shown again.
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 12.5, padding: '8px 10px', borderRadius: 7,
            background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
            wordBreak: 'break-all', userSelect: 'text', marginBottom: 8
          }}>
            {freshKey}
          </div>
          <button className="lp-btn lp-btn-ghost" style={{ fontSize: 12 }} onClick={() => setFreshKey(null)}>
            Done
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="lp-card" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>
            Key name
          </label>
          <input className="lp-input" placeholder="e.g. Accounting dashboard" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <button className="lp-btn lp-btn-primary" type="submit" disabled={creating}>
          {creating ? 'Generating…' : 'Generate key'}
        </button>
      </form>

      {loading ? (
        <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>
      ) : keys.length === 0 ? (
        <div className="lp-card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--lp-text-muted)', fontSize: 13 }}>
          No API keys yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {keys.map(k => (
            <div key={k.id} className="lp-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>{k.name}</div>
                <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                  {k.key_prefix}••••••
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
                {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}
              </div>
              {k.revoked_at ? (
                <span style={{ fontSize: 11, color: 'var(--sem-red)' }}>Revoked</span>
              ) : (
                <button className="lp-btn lp-btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleRevoke(k.id)}>
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
