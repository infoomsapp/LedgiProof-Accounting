// PATH: src/components/Invoices/RecurringInvoicesTab.tsx
//
// Recurring billing manager (lives as a tab inside the Invoices page). Create /
// edit schedules with a line-item template, pause/resume, delete, and "Generate
// due now". Generation itself happens in SQL (daily cron + on-demand RPC); this
// screen only manages the schedules. Money math for the preview is done in
// integer cents (Constitution: no float for money).

import { useEffect, useState } from 'react'
import Modal  from '../ui/modal'
import Button from '../ui/Button'
import {
  createRecurringInvoice, replaceRecurringItems, setRecurringStatus,
  deleteRecurringInvoice, generateDueRecurringInvoices, getRecurringItems,
  FREQUENCY_LABELS,
  type RecurringFrequency, type RecurringItemDraft, type RecurringInvoiceWithClient
} from '../../services/recurring-invoice.service'
import { useRecurringInvoices } from '../../hooks/useRecurringInvoices'
import type { Client } from '../../types/database.types'
import { formatCurrency } from '../../lib/currency'
import InvoiceReminderCard from './InvoiceReminderCard'

/** Per-schedule template subtotal preview, computed in integer cents. */
function previewCents(items: RecurringItemDraft[]): number {
  return items.reduce((sum, it) => {
    const line   = Math.round(it.quantity * it.unit_price * 100)      // cents
    const disc   = Math.round(line * (it.discount_pct / 100))
    const taxed  = line - disc
    const tax    = Math.round(taxed * (it.tax_rate / 100))
    return sum + taxed + tax
  }, 0)
}

const emptyItem = (): RecurringItemDraft => ({
  item_type: 'service', description: '', quantity: 1, unit_price: 0, discount_pct: 0, tax_rate: 0
})

interface Props {
  orgId:    string
  userId:   string
  clients:  Client[]
  clientId: string | null
}

export default function RecurringInvoicesTab({ orgId, userId, clients, clientId }: Props) {
  const { data, loading, refresh } = useRecurringInvoices(orgId)
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null)
  const [generating, setGen]    = useState(false)

  // Editor state
  const [open, setOpen]         = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [fClient, setFClient]   = useState(clientId ?? '')
  const [fFreq, setFFreq]       = useState<RecurringFrequency>('monthly')
  const [fStart, setFStart]     = useState(new Date().toISOString().slice(0, 10))
  const [fNet, setFNet]         = useState(30)
  const [fAuto, setFAuto]       = useState(false)
  const [fEnd, setFEnd]         = useState('')
  const [fMax, setFMax]         = useState('')
  const [fTitle, setFTitle]     = useState('')
  const [fNotes, setFNotes]     = useState('')
  const [fTerms, setFTerms]     = useState('')
  const [items, setItems]       = useState<RecurringItemDraft[]>([emptyItem()])

  useEffect(() => {
    if (msg) { const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t) }
  }, [msg])

  function resetForm() {
    setEditId(null); setFClient(clientId ?? ''); setFFreq('monthly')
    setFStart(new Date().toISOString().slice(0, 10)); setFNet(30); setFAuto(false)
    setFEnd(''); setFMax(''); setFTitle(''); setFNotes(''); setFTerms(''); setItems([emptyItem()])
  }

  function openCreate() { resetForm(); setOpen(true) }

  async function openEdit(r: RecurringInvoiceWithClient) {
    resetForm()
    setEditId(r.id); setFClient(r.client_id); setFFreq(r.frequency)
    setFStart(r.next_run_date); setFNet(r.net_days); setFAuto(r.auto_send)
    setFEnd(r.end_date ?? ''); setFMax(r.max_occurrences?.toString() ?? '')
    setFTitle(r.title ?? ''); setFNotes(r.notes ?? ''); setFTerms(r.terms ?? '')
    try {
      const its = await getRecurringItems(r.id)
      setItems(its.length ? its.map(i => ({
        item_type: i.item_type, description: i.description, quantity: i.quantity,
        unit_price: i.unit_price, discount_pct: i.discount_pct, tax_rate: i.tax_rate
      })) : [emptyItem()])
    } catch { setItems([emptyItem()]) }
    setOpen(true)
  }

  function setItem(idx: number, patch: Partial<RecurringItemDraft>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  async function save() {
    if (!fClient) { setMsg({ ok: false, text: 'Pick a client.' }); return }
    const valid = items.filter(i => i.description.trim() !== '')
    if (valid.length === 0) { setMsg({ ok: false, text: 'Add at least one line item.' }); return }
    setSaving(true)
    try {
      if (editId) {
        // v1: the editor updates the line-item template only (header fields like
        // frequency/dates are set at creation). Status is untouched here so
        // editing a paused schedule's items does not silently resume it.
        await replaceRecurringItems(editId, orgId, valid)
        setMsg({ ok: true, text: 'Schedule items updated.' })
      } else {
        await createRecurringInvoice({
          orgId, clientId: fClient, userId,
          frequency: fFreq, startDate: fStart, netDays: fNet, autoSend: fAuto,
          ...(fEnd ? { endDate: fEnd } : {}),
          ...(fMax ? { maxOccurrences: parseInt(fMax) } : {}),
          ...(fTitle.trim() ? { title: fTitle.trim() } : {}),
          ...(fNotes.trim() ? { notes: fNotes.trim() } : {}),
          ...(fTerms.trim() ? { terms: fTerms.trim() } : {})
        }, valid)
        setMsg({ ok: true, text: 'Recurring schedule created.' })
      }
      setOpen(false); refresh()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Could not save' })
    } finally { setSaving(false) }
  }

  async function generateNow() {
    setGen(true)
    try {
      const n = await generateDueRecurringInvoices(orgId)
      setMsg({ ok: true, text: n > 0 ? `Generated ${n} invoice${n === 1 ? '' : 's'}.` : 'Nothing due right now.' })
      refresh()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Could not generate' })
    } finally { setGen(false) }
  }

  async function toggleStatus(r: RecurringInvoiceWithClient) {
    const next = r.status === 'active' ? 'paused' : 'active'
    try { await setRecurringStatus(r.id, next); refresh() }
    catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'Failed' }) }
  }

  async function remove(r: RecurringInvoiceWithClient) {
    if (!window.confirm(`Delete the recurring schedule for ${r.clients?.display_name ?? 'this client'}?`)) return
    try { await deleteRecurringInvoice(r.id); refresh() }
    catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'Failed' }) }
  }

  const statusColor = (s: string) =>
    s === 'active' ? 'var(--sem-green)' : s === 'paused' ? 'var(--sem-amber)' : 'var(--lp-text-muted)'

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <InvoiceReminderCard orgId={orgId} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 }}>
        <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
          {data.length} schedule{data.length !== 1 ? 's' : ''} · auto-generated daily
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={generateNow} disabled={generating}>
            {generating ? 'Generating…' : '⚡ Generate due now'}
          </Button>
          {/* Hidden when empty — the empty-state CTA below is the sole
              call-to-action there, so this doesn't duplicate it. */}
          {data.length > 0 && (
            <Button variant="primary" onClick={openCreate}>+ New schedule</Button>
          )}
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '9px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
          background: msg.ok ? 'rgba(34,197,94,0.08)' : 'var(--sem-red-bg)',
          border: `0.5px solid ${msg.ok ? 'rgba(34,197,94,0.3)' : 'var(--sem-red-border)'}`,
          color: msg.ok ? 'var(--sem-green)' : 'var(--sem-red)'
        }}>{msg.text}</div>
      )}

      {loading ? (
        <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>
      ) : data.length === 0 ? (
        <div className="lp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔁</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No recurring schedules yet</div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginBottom: 20 }}>
            Set up a schedule to bill a client automatically on a cadence.
          </div>
          <Button variant="primary" onClick={openCreate}>+ New schedule</Button>
        </div>
      ) : (
        <div className="lp-table-wrap">
          <table className="lp-table">
            <thead>
              <tr>{['Client', 'Frequency', 'Next run', 'Auto-send', 'Status', 'Done', 'Actions'].map(h =>
                <th key={h} style={{ textAlign: h === 'Actions' ? 'center' : 'left' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 13 }}>{r.clients?.display_name ?? '—'}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>{FREQUENCY_LABELS[r.frequency]}</td>
                  <td style={{ fontSize: 12.5 }}>{r.next_run_date}</td>
                  <td style={{ fontSize: 12.5, color: r.auto_send ? 'var(--sem-green)' : 'var(--lp-text-muted)' }}>
                    {r.auto_send ? 'Send' : 'Draft'}
                  </td>
                  <td><span style={{ fontSize: 11.5, fontWeight: 600, color: statusColor(r.status), textTransform: 'capitalize' }}>{r.status}</span></td>
                  <td style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>{r.occurrences_generated}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {r.status !== 'ended' && (
                        <button onClick={() => toggleStatus(r)} style={miniBtn}>
                          {r.status === 'active' ? '⏸ Pause' : '▶ Resume'}
                        </button>
                      )}
                      <button onClick={() => openEdit(r)} style={miniBtn}>✏ Items</button>
                      <button onClick={() => remove(r)} style={{ ...miniBtn, color: 'var(--sem-red)' }}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit schedule items' : 'New recurring schedule'} width={720}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!editId && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Client">
                  <select className="lp-input" value={fClient} onChange={e => setFClient(e.target.value)} disabled={!!clientId}>
                    <option value="">Select…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                  </select>
                </Field>
                <Field label="Frequency">
                  <select className="lp-input" value={fFreq} onChange={e => setFFreq(e.target.value as RecurringFrequency)}>
                    {(Object.keys(FREQUENCY_LABELS) as RecurringFrequency[]).map(f =>
                      <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="First invoice date"><input type="date" className="lp-input" value={fStart} onChange={e => setFStart(e.target.value)} /></Field>
                <Field label="Payment terms (net days)"><input type="number" min="0" className="lp-input" value={fNet} onChange={e => setFNet(parseInt(e.target.value) || 0)} /></Field>
                <Field label="Auto-send?">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--lp-text-muted)', height: 34 }}>
                    <input type="checkbox" checked={fAuto} onChange={e => setFAuto(e.target.checked)} />
                    Send automatically
                  </label>
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="End date (optional)"><input type="date" className="lp-input" value={fEnd} onChange={e => setFEnd(e.target.value)} /></Field>
                <Field label="Max occurrences (optional)"><input type="number" min="1" className="lp-input" value={fMax} onChange={e => setFMax(e.target.value)} /></Field>
              </div>
              <Field label="Title (optional)"><input className="lp-input" value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="e.g. Monthly bookkeeping" /></Field>
            </>
          )}

          {/* Line items */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line items</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Description', 'Qty', 'Unit price', 'Disc %', 'Tax %', ''].map(h =>
                  <th key={h} style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', textAlign: 'left', padding: '2px 4px', fontWeight: 500 }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 4px' }}><input className="lp-input" style={{ fontSize: 12.5 }} value={it.description} onChange={e => setItem(i, { description: e.target.value })} placeholder="Description" /></td>
                    <td style={{ padding: '3px 4px', width: 64 }}><input className="lp-input" style={{ fontSize: 12.5, textAlign: 'right' }} type="number" min="0" step="0.01" value={it.quantity} onChange={e => setItem(i, { quantity: parseFloat(e.target.value) || 0 })} /></td>
                    <td style={{ padding: '3px 4px', width: 90 }}><input className="lp-input" style={{ fontSize: 12.5, textAlign: 'right' }} type="number" min="0" step="0.01" value={it.unit_price} onChange={e => setItem(i, { unit_price: parseFloat(e.target.value) || 0 })} /></td>
                    <td style={{ padding: '3px 4px', width: 64 }}><input className="lp-input" style={{ fontSize: 12.5, textAlign: 'right' }} type="number" min="0" max="100" step="0.01" value={it.discount_pct} onChange={e => setItem(i, { discount_pct: parseFloat(e.target.value) || 0 })} /></td>
                    <td style={{ padding: '3px 4px', width: 64 }}><input className="lp-input" style={{ fontSize: 12.5, textAlign: 'right' }} type="number" min="0" max="100" step="0.01" value={it.tax_rate} onChange={e => setItem(i, { tax_rate: parseFloat(e.target.value) || 0 })} /></td>
                    <td style={{ padding: '3px 4px', width: 28 }}>
                      {items.length > 1 && <button onClick={() => setItems(items.filter((_, x) => x !== i))} style={{ ...miniBtn, color: 'var(--sem-red)' }}>✕</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setItems([...items, emptyItem()])} style={{ ...miniBtn, marginTop: 6 }}>+ Add line</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '0.5px solid var(--lp-border)' }}>
            <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
              Per-invoice total: <strong style={{ color: 'var(--lp-text)', fontFamily: 'monospace' }}>{formatCurrency(previewCents(items) / 100)}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editId ? 'Save items' : 'Create schedule'}</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

const miniBtn: React.CSSProperties = {
  background: 'transparent', border: '0.5px solid var(--lp-border)', borderRadius: 6,
  padding: '3px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--lp-accent)'
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
