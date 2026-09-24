// PATH: src/components/settings/ConnectionsTab.tsx
//
// External-app connections. Today: ControlMiles (generate a token that a
// connected ControlMiles account presents when pushing closed trips into
// supabase/functions/mileage-webhook — see src/services/mileage-connections.service.ts).
// Mirrors ApiAccessTab's generate/revoke pattern exactly.

import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import {
  listMileageConnections, createMileageConnection, revokeMileageConnection,
  type MileageConnection
} from '../../services/mileage-connections.service'

interface Props {
  onMessage: (m: { type: 'ok' | 'err'; text: string }) => void
}

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mileage-webhook`

export default function ConnectionsTab({ onMessage }: Props) {
  const { membership } = useAuthStore()
  const orgId = membership?.org_id ?? ''

  const [connections, setConnections] = useState<MileageConnection[]>([])
  const [loading, setLoading]         = useState(true)
  const [label, setLabel]             = useState('')
  const [creating, setCreating]       = useState(false)
  const [freshToken, setFreshToken]   = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    load()
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      setConnections(await listMileageConnections(orgId))
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not load connections' })
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setCreating(true)
    try {
      const { token } = await createMileageConnection(orgId, label.trim())
      setFreshToken(token)
      setLabel('')
      load()
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not create the connection' })
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeMileageConnection(id)
      onMessage({ type: 'ok', text: 'Connection revoked.' })
      load()
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not revoke the connection' })
    }
  }

  const active = connections.filter(c => c.status === 'active')

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div className="lp-page-title" style={{ fontSize: 16 }}>🔗 Connections</div>
        <div className="lp-page-sub">
          Link a ControlMiles account so its trips import automatically as mileage entries here.
        </div>
      </div>

      <div className="lp-card" style={{
        marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px'
      }}>
        <div style={{ fontSize: 26, lineHeight: 1 }}>🚗</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 4 }}>
            ControlMiles
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
            GPS-tracked, auditor-grade mileage — built for gig drivers and fleets. Generate a token below,
            then paste it into ControlMiles under Settings → Connect LedgiProof. Every closed trip lands here
            as a mileage entry, tagged with its source.
          </div>
          {active.length === 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>Not connected yet.</div>
          )}
        </div>
      </div>

      {freshToken && (
        <div className="lp-card" style={{
          marginBottom: 16, borderColor: 'var(--sem-amber-border)', background: 'var(--sem-amber-bg)'
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 8 }}>
            Copy this token now — it won't be shown again. Paste it into ControlMiles.
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 12.5, padding: '8px 10px', borderRadius: 7,
            background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)',
            wordBreak: 'break-all', userSelect: 'text', marginBottom: 8
          }}>
            {freshToken}
          </div>
          <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginBottom: 8 }}>
            Endpoint: <code style={{ fontSize: 11 }}>{WEBHOOK_URL}</code>
          </div>
          <button className="lp-btn lp-btn-ghost" style={{ fontSize: 12 }} onClick={() => setFreshToken(null)}>
            Done
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="lp-card" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>
            Connection label
          </label>
          <input
            className="lp-input"
            placeholder="e.g. My ControlMiles account"
            value={label}
            onChange={e => setLabel(e.target.value)}
            required
          />
        </div>
        <button className="lp-btn lp-btn-primary" type="submit" disabled={creating}>
          {creating ? 'Generating…' : 'Generate token'}
        </button>
      </form>

      {loading ? (
        <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>
      ) : connections.length === 0 ? (
        <div className="lp-card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--lp-text-muted)', fontSize: 13 }}>
          No connections yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {connections.map(c => (
            <div key={c.id} className="lp-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>{c.label}</div>
                <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                  {c.token_prefix}••••••
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
                {c.last_received_at ? `Last trip ${new Date(c.last_received_at).toLocaleDateString()}` : 'No trips received yet'}
              </div>
              {c.status === 'revoked' ? (
                <span style={{ fontSize: 11, color: 'var(--sem-red)' }}>Revoked</span>
              ) : (
                <button className="lp-btn lp-btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleRevoke(c.id)}>
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
