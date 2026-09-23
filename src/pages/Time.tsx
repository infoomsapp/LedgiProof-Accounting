// PATH: src/pages/Time.tsx
//
// Time tracking — the #1 gap the competitive audit found: FreshBooks and
// Xero both ship a timer on every relevant plan, LedgiProof had none.
// Start/stop a live timer, or log time manually; billable hours flow into
// an invoice from Invoices.tsx via "Pull in unbilled time."

import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth.store'
import { useScope } from '../hooks/useScope'
import { getClients } from '../services/invoice.service'
import {
  startTimer, stopTimer, getRunningTimer, addManualEntry, listTimeEntries, deleteTimeEntry,
  formatDuration, durationToHours, type TimeEntry
} from '../services/time-entry.service'
import FeatureGate from '../components/settings/FeatureGate'
import type { Client } from '../types/database.types'

const fmtMoney = (n: number) => `$${n.toFixed(2)}`

export default function Time() {
  return (
    <FeatureGate
      featureKey="time_tracking"
      title="Time tracking"
      description="Track billable hours with a live timer or manual entries, then pull them straight into an invoice. Available on the Entrepreneur, Bookkeeper, and Accountant plans."
    >
      <TimeContent />
    </FeatureGate>
  )
}

function TimeContent() {
  const { user, profile } = useAuthStore()
  const userId = user?.id ?? profile?.id ?? ''
  const scope = useScope()
  const { orgId, clientId } = scope

  const [running, setRunning] = useState<TimeEntry | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [desc, setDesc] = useState('')
  const [rate, setRate] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [busy, setBusy] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!orgId || !userId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userId, clientId])

  useEffect(() => {
    if (!running?.started_at) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    const start = new Date(running.started_at).getTime()
    setElapsed(Math.floor((Date.now() - start) / 1000))
    tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [running?.id, running?.started_at])

  async function load() {
    setLoading(true)
    try {
      const [r, list, cs] = await Promise.all([
        getRunningTimer(orgId, userId),
        listTimeEntries(orgId, scope.scopeMode === 'firm-client' && clientId ? { clientId } : {}),
        scope.scopeMode === 'firm-client' && !clientId ? getClients(orgId) : Promise.resolve([])
      ])
      setRunning(r)
      setEntries(list)
      setClients(cs)
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    setBusy(true)
    try {
      const entry = await startTimer({
        orgId, userId, clientId,
        description: desc.trim() || null,
        hourlyRate: Number(rate) || 0
      })
      setRunning(entry)
      setDesc('')
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    if (!running) return
    setBusy(true)
    try {
      await stopTimer(running.id)
      setRunning(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    await deleteTimeEntry(id)
    load()
  }

  if (!scope.isReady || loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--lp-text-muted)' }}>Loading…</div>
  }

  const unbilled = entries.filter(e => e.ended_at && !e.invoice_id && e.is_billable)
  const unbilledValue = unbilled.reduce((sum, e) => sum + durationToHours(e.duration_minutes) * e.hourly_rate, 0)

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 className="lp-page-title">Time tracking</h1>
        <p className="lp-page-sub">
          {scope.client ? `Logging time for ${scope.client.display_name}` : 'Track billable hours, then pull them into an invoice.'}
        </p>
      </div>

      {/* Timer / running state */}
      <div className="lp-card" style={{ marginBottom: 16, padding: '18px 20px' }}>
        {running ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: 'var(--sem-red)',
              animation: 'lp-pulse 1.4s ease-in-out infinite', flexShrink: 0
            }} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 700, color: 'var(--lp-text)' }}>
                {String(Math.floor(elapsed / 3600)).padStart(2, '0')}:{String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
                {running.description || 'Untitled entry'}
              </div>
            </div>
            <button className="lp-btn" style={{ background: 'var(--sem-red)', color: '#fff' }} onClick={handleStop} disabled={busy}>
              Stop
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>What are you working on?</label>
              <input className="lp-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Monthly reconciliation" />
            </div>
            <div style={{ width: 110 }}>
              <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Rate/hr</label>
              <input className="lp-input" type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" />
            </div>
            <button className="lp-btn lp-btn-primary" onClick={handleStart} disabled={busy}>
              ▶ Start timer
            </button>
            <button className="lp-btn lp-btn-ghost" onClick={() => setShowManual(s => !s)}>
              {showManual ? 'Cancel' : 'Log time manually'}
            </button>
          </div>
        )}
      </div>

      {showManual && !running && (
        <ManualEntryForm
          orgId={orgId} userId={userId} clientId={clientId}
          onSaved={() => { setShowManual(false); load() }}
        />
      )}

      {unbilled.length > 0 && (
        <div style={{
          padding: '10px 16px', borderRadius: 10, marginBottom: 16,
          background: 'var(--sem-amber-bg)', border: '0.5px solid var(--sem-amber-border)',
          fontSize: 12.5, color: 'var(--lp-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10
        }}>
          <span>{unbilled.length} unbilled {unbilled.length === 1 ? 'entry' : 'entries'} worth {fmtMoney(unbilledValue)} — pull them into an invoice from Invoices.</span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="lp-card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--lp-text-muted)', fontSize: 13 }}>
          No time logged yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(e => (
            <div key={e.id} className="lp-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
                  {e.description || 'Untitled entry'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                  {new Date(e.entry_date).toLocaleDateString()}
                  {scope.scopeMode === 'firm-client' && !clientId && e.client_id && (
                    <> · {clients.find(c => c.id === e.client_id)?.display_name ?? 'Client'}</>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--lp-text)' }}>
                {formatDuration(e.duration_minutes)}
              </div>
              <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: 'var(--lp-text)', width: 70, textAlign: 'right' }}>
                {fmtMoney(durationToHours(e.duration_minutes) * e.hourly_rate)}
              </div>
              {e.invoice_id ? (
                <span style={{ fontSize: 10.5, color: 'var(--sem-green)', fontWeight: 600 }}>Billed</span>
              ) : (
                <button onClick={() => handleDelete(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 12 }}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes lp-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  )
}

function ManualEntryForm({
  orgId, userId, clientId, onSaved
}: { orgId: string; userId: string; clientId: string | null; onSaved: () => void }) {
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState('')
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const h = Number(hours)
    if (!h || h <= 0) return
    setSaving(true)
    try {
      await addManualEntry({
        orgId, userId, clientId,
        description: desc.trim() || null,
        date,
        minutes: Math.round(h * 60),
        hourlyRate: Number(rate) || 0
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lp-card" style={{ marginBottom: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', alignItems: 'end' }}>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Description</label>
        <input className="lp-input" value={desc} onChange={e => setDesc(e.target.value)} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Date</label>
        <input className="lp-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Hours</label>
        <input className="lp-input" type="number" min="0.1" step="0.1" value={hours} onChange={e => setHours(e.target.value)} required />
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Rate/hr</label>
        <input className="lp-input" type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} />
      </div>
      <button className="lp-btn lp-btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Add entry'}
      </button>
    </div>
  )
}
