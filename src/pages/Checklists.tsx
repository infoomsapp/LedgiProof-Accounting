// PATH: src/pages/Checklists.tsx
//
// Recurring monthly close checklist -- the competitive-audit gap where
// neither QuickBooks nor Xero do this natively (a whole separate paid
// category -- Karbon/Canopy/Financial Cents -- bolts this on top of them
// instead). Two views: "Runs" (the actual close work a firm does every
// period) and "Templates" (the recurring schedule + step list that
// generates a new run automatically).

import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/auth.store'
import { useScope } from '../hooks/useScope'
import { useChecklistLive } from '../hooks/useChecklistLive'
import { getClients } from '../services/invoice.service'
import {
  listChecklistRuns, getChecklistRunItems, createChecklistRun, toggleChecklistItem,
  completeChecklistRun, deleteChecklistRun,
  getRecurringChecklists, getRecurringChecklistItems, createRecurringChecklist,
  setRecurringChecklistStatus, deleteRecurringChecklist, generateDueRecurringChecklists,
  CHECKLIST_FREQUENCY_LABELS,
  type ChecklistFrequency, type ChecklistItemDraft, type ChecklistRunWithClient,
  type ChecklistRunItem, type RecurringChecklistWithClient
} from '../services/recurring-checklist.service'
import type { Client } from '../types/database.types'

type Tab = 'runs' | 'templates'

export default function Checklists() {
  const { user, profile } = useAuthStore()
  const userId = user?.id ?? profile?.id ?? ''
  const scope = useScope()
  const { orgId, clientId } = scope

  const [tab, setTab] = useState<Tab>('runs')
  const [clients, setClients] = useState<Client[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!orgId) return
    getClients(orgId).then(setClients).catch(() => {})
  }, [orgId])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  if (!scope.isReady) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--lp-text-muted)' }}>Loading…</div>
  }

  const clientName = (id: string | null) => id ? (clients.find(c => c.id === id)?.display_name ?? 'Client') : null

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="lp-page-title">Checklists</h1>
          <p className="lp-page-sub">Recurring close work, tracked to done -- not a freeform note you have to remember to check.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`lp-btn ${tab === 'runs' ? 'lp-btn-primary' : 'lp-btn-ghost'}`} onClick={() => setTab('runs')}>Runs</button>
          <button className={`lp-btn ${tab === 'templates' ? 'lp-btn-primary' : 'lp-btn-ghost'}`} onClick={() => setTab('templates')}>Templates</button>
        </div>
      </div>

      {msg && (
        <div className={`lp-banner ${msg.ok ? '' : 'error'}`} style={{ marginBottom: 14, padding: '8px 14px', borderRadius: 8, fontSize: 12.5 }}>
          {msg.text}
        </div>
      )}

      {tab === 'runs'
        ? <RunsView orgId={orgId} userId={userId} clientId={clientId} clientName={clientName} onMsg={setMsg} />
        : <TemplatesView orgId={orgId} userId={userId} clientId={clientId} clients={clients} onMsg={setMsg} />}
    </div>
  )
}

// ── Runs ──────────────────────────────────────────────────────────────────────

function RunsView({
  orgId, userId, clientId, clientName, onMsg
}: {
  orgId: string; userId: string; clientId: string | null
  clientName: (id: string | null) => string | null
  onMsg: (m: { ok: boolean; text: string }) => void
}) {
  const [runs, setRuns] = useState<ChecklistRunWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [items, setItems] = useState<ChecklistRunItem[]>([])
  const [showNew, setShowNew] = useState(false)

  useEffect(() => { load() }, [orgId, clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // `silent` is a refresh triggered by someone else's change (the phone, another
  // tab): it must not flip the whole view to "Loading…", which would tear down an
  // open form or a run being worked on.
  async function load(silent = false) {
    if (!silent) setLoading(true)
    try {
      setRuns(await listChecklistRuns(orgId, clientId ? { clientId } : {}))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Changes made on the phone show up here on their own: the run list, and the
  // tasks of whichever run is open.
  useChecklistLive(orgId, () => {
    void load(true)
    if (expanded) {
      getChecklistRunItems(expanded).then(setItems).catch(() => { /* keep what is shown */ })
    }
  })

  async function openRun(runId: string) {
    if (expanded === runId) { setExpanded(null); return }
    setExpanded(runId)
    setItems(await getChecklistRunItems(runId))
  }

  async function handleToggle(item: ChecklistRunItem) {
    const updated = await toggleChecklistItem(item.id, item.completed_at ? null : userId)
    setItems(prev => prev.map(i => i.id === item.id ? updated : i))
  }

  async function handleComplete(runId: string) {
    await completeChecklistRun(runId)
    onMsg({ ok: true, text: 'Checklist marked complete.' })
    load()
  }

  async function handleDelete(runId: string) {
    await deleteChecklistRun(runId)
    if (expanded === runId) setExpanded(null)
    load()
  }

  if (loading) return <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="lp-btn lp-btn-primary" onClick={() => setShowNew(true)}>+ New checklist</button>
      </div>

      {showNew && (
        <NewRunForm orgId={orgId} userId={userId} clientId={clientId}
          onSaved={() => { setShowNew(false); load() }} onCancel={() => setShowNew(false)} />
      )}

      {runs.length === 0 ? (
        <div className="lp-card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--lp-text-muted)', fontSize: 13 }}>
          No checklists yet. Create one, or set up a recurring template.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {runs.map(run => (
            <div key={run.id} className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => openRun(run.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>
                    {run.title}{run.clients?.display_name ? ` · ${run.clients.display_name}` : ''}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                    {new Date(run.run_date).toLocaleDateString()}
                  </div>
                </div>
                <span style={{
                  fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 100,
                  color: run.status === 'completed' ? 'var(--sem-green)' : 'var(--sem-amber)',
                  background: run.status === 'completed' ? 'var(--sem-green-bg)' : 'var(--sem-amber-bg)',
                  border: `0.5px solid ${run.status === 'completed' ? 'var(--sem-green-border)' : 'var(--sem-amber-border)'}`
                }}>
                  {run.status === 'completed' ? 'Done' : 'Open'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--lp-text-muted)' }}>{expanded === run.id ? '▲' : '▼'}</span>
              </button>

              {expanded === run.id && (
                <div style={{ padding: '4px 16px 14px', borderTop: '0.5px solid var(--lp-border)' }}>
                  {items.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', padding: '10px 0' }}>No tasks on this checklist.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                      {items.map(item => (
                        <label key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!item.completed_at} onChange={() => handleToggle(item)} style={{ marginTop: 3 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontSize: 13, color: item.completed_at ? 'var(--lp-text-muted)' : 'var(--lp-text)',
                              textDecoration: item.completed_at ? 'line-through' : 'none'
                            }}>
                              {item.title}
                            </div>
                            {item.description && (
                              <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>{item.description}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {run.status !== 'completed' && (
                      <button className="lp-btn lp-btn-primary" style={{ fontSize: 12 }} onClick={() => handleComplete(run.id)}>
                        Mark checklist complete
                      </button>
                    )}
                    <button onClick={() => handleDelete(run.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 12 }}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NewRunForm({
  orgId, userId, clientId, onSaved, onCancel
}: { orgId: string; userId: string; clientId: string | null; onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [steps, setSteps] = useState<ChecklistItemDraft[]>([{ title: '', description: null }])
  const [saving, setSaving] = useState(false)

  function updateStep(i: number, title: string) {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, title } : s))
  }
  function addStep() { setSteps(prev => [...prev, { title: '', description: null }]) }
  function removeStep(i: number) { setSteps(prev => prev.filter((_, idx) => idx !== i)) }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await createChecklistRun(orgId, userId, title.trim(), date, steps.filter(s => s.title.trim()), clientId)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lp-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 2 }}>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Title</label>
          <input className="lp-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. October close" autoFocus />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Date</label>
          <input className="lp-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Tasks</label>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input className="lp-input" value={s.title} onChange={e => updateStep(i, e.target.value)} placeholder={`Task ${i + 1}`} />
          {steps.length > 1 && (
            <button onClick={() => removeStep(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)' }}>✕</button>
          )}
        </div>
      ))}
      <button onClick={addStep} className="lp-btn lp-btn-ghost" style={{ fontSize: 12, marginBottom: 12 }}>+ Add task</button>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="lp-btn lp-btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : 'Create checklist'}
        </button>
        <button className="lp-btn lp-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Templates ─────────────────────────────────────────────────────────────────

function TemplatesView({
  orgId, userId, clientId, clients, onMsg
}: { orgId: string; userId: string; clientId: string | null; clients: Client[]; onMsg: (m: { ok: boolean; text: string }) => void }) {
  const [templates, setTemplates] = useState<RecurringChecklistWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load(silent = false) {
    if (!silent) setLoading(true)
    try {
      setTemplates(await getRecurringChecklists(orgId))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // A template created, paused or deleted on the phone appears here on its own.
  useChecklistLive(orgId, () => { void load(true) })

  async function handleGenerate() {
    setGenerating(true)
    try {
      const n = await generateDueRecurringChecklists(orgId)
      onMsg({ ok: true, text: n > 0 ? `Generated ${n} checklist${n === 1 ? '' : 's'}.` : 'Nothing due yet.' })
      load()
    } catch (e: any) {
      onMsg({ ok: false, text: e?.message ?? 'Could not generate checklists.' })
    } finally {
      setGenerating(false)
    }
  }

  async function handlePause(t: RecurringChecklistWithClient) {
    await setRecurringChecklistStatus(t.id, t.status === 'active' ? 'paused' : 'active')
    load()
  }

  async function handleDelete(id: string) {
    await deleteRecurringChecklist(id)
    load()
  }

  if (loading) return <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="lp-btn lp-btn-ghost" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating…' : 'Generate due now'}
        </button>
        <button className="lp-btn lp-btn-primary" onClick={() => setShowNew(true)}>+ New template</button>
      </div>

      {showNew && (
        <NewTemplateForm orgId={orgId} userId={userId} clientId={clientId} clients={clients}
          onSaved={() => { setShowNew(false); load() }} onCancel={() => setShowNew(false)} />
      )}

      {templates.length === 0 ? (
        <div className="lp-card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--lp-text-muted)', fontSize: 13 }}>
          No recurring templates yet. Set one up once, get a new checklist every period automatically.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} className="lp-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>
                  {t.title}{t.clients?.display_name ? ` · ${t.clients.display_name}` : ''}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                  {CHECKLIST_FREQUENCY_LABELS[t.frequency as ChecklistFrequency]} · next {new Date(t.next_run_date).toLocaleDateString()}
                  {t.occurrences_generated > 0 ? ` · ${t.occurrences_generated} generated` : ''}
                </div>
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 100,
                color: t.status === 'active' ? 'var(--sem-green)' : 'var(--lp-text-muted)',
                background: t.status === 'active' ? 'var(--sem-green-bg)' : 'var(--lp-surface-2)',
                border: `0.5px solid ${t.status === 'active' ? 'var(--sem-green-border)' : 'var(--lp-border)'}`
              }}>
                {t.status}
              </span>
              {t.status !== 'ended' && (
                <button className="lp-btn lp-btn-ghost" style={{ fontSize: 12 }} onClick={() => handlePause(t)}>
                  {t.status === 'active' ? 'Pause' : 'Resume'}
                </button>
              )}
              <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 12 }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NewTemplateForm({
  orgId, userId, clientId, clients, onSaved, onCancel
}: {
  orgId: string; userId: string; clientId: string | null; clients: Client[]
  onSaved: () => void; onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [selectedClient, setSelectedClient] = useState(clientId ?? '')
  const [frequency, setFrequency] = useState<ChecklistFrequency>('monthly')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [steps, setSteps] = useState<ChecklistItemDraft[]>([{ title: '', description: null }])
  const [saving, setSaving] = useState(false)

  function updateStep(i: number, title: string) {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, title } : s))
  }
  function addStep() { setSteps(prev => [...prev, { title: '', description: null }]) }
  function removeStep(i: number) { setSteps(prev => prev.filter((_, idx) => idx !== i)) }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await createRecurringChecklist(
        { orgId, userId, clientId: selectedClient || null, title: title.trim(), frequency, startDate },
        steps.filter(s => s.title.trim())
      )
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lp-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Title</label>
          <input className="lp-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Monthly close" autoFocus />
        </div>
        {clients.length > 0 && (
          <div>
            <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Client (optional)</label>
            <select className="lp-input" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
              <option value="">Firm-wide</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Frequency</label>
          <select className="lp-input" value={frequency} onChange={e => setFrequency(e.target.value as ChecklistFrequency)}>
            {Object.entries(CHECKLIST_FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Starts</label>
          <input className="lp-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
      </div>

      <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Tasks (regenerated every period)</label>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input className="lp-input" value={s.title} onChange={e => updateStep(i, e.target.value)} placeholder={`Task ${i + 1}`} />
          {steps.length > 1 && (
            <button onClick={() => removeStep(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)' }}>✕</button>
          )}
        </div>
      ))}
      <button onClick={addStep} className="lp-btn lp-btn-ghost" style={{ fontSize: 12, marginBottom: 12 }}>+ Add task</button>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="lp-btn lp-btn-primary" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : 'Create template'}
        </button>
        <button className="lp-btn lp-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
