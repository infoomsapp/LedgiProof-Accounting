// PATH: src/components/Invoices/InvoiceReminderCard.tsx
//
// Turns payment-reminder emails on or off and picks their schedule. Sits at the
// top of the Recurring tab: recurring billing and reminders are the two things
// that send invoices to clients without anyone remembering to. Same policy the
// mobile app edits.

import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import {
  getReminderPolicy, saveReminderPolicy, normalizeOverdueDays, summarizePolicy,
  DEFAULT_REMINDER_POLICY, DAYS_BEFORE_CHOICES, OVERDUE_CHOICES,
  type ReminderPolicy
} from '../../services/invoice-reminder.service'

export default function InvoiceReminderCard({ orgId }: { orgId: string }) {
  const [saved, setSaved]     = useState<ReminderPolicy | null>(null)
  const [draft, setDraft]     = useState<ReminderPolicy>(DEFAULT_REMINDER_POLICY)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    getReminderPolicy(orgId)
      .then(p => { if (alive) { setSaved(p); setDraft(p) } })
      .catch(e => { if (alive) setMsg({ ok: false, text: e?.message ?? 'Could not load the reminder settings' }) })
    return () => { alive = false }
  }, [orgId])

  const dirty = saved !== null && JSON.stringify(saved) !== JSON.stringify(draft)

  function toggleOverdue(d: number) {
    const has = draft.overdue_days.includes(d)
    setDraft({
      ...draft,
      overdue_days: normalizeOverdueDays(has ? draft.overdue_days.filter(x => x !== d) : [...draft.overdue_days, d])
    })
  }

  async function save() {
    setSaving(true); setMsg(null)
    try {
      await saveReminderPolicy(orgId, draft)
      setSaved(draft)
      setMsg({ ok: true, text: draft.enabled ? 'Reminders are on.' : 'Reminders are off.' })
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '4px 11px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    border: `0.5px solid ${active ? 'var(--lp-accent)' : 'var(--lp-border)'}`,
    background: active ? 'var(--lp-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--lp-text-muted)'
  })
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--lp-text-muted)', marginBottom: 6 }

  return (
    <div className="lp-card" style={{ padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Payment reminders</div>
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginTop: 3, maxWidth: 560 }}>
            Email clients about unpaid invoices before and after they are due. Sent each morning
            (Eastern time), and never twice for the same milestone.
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={draft.enabled}
                 onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />
          {draft.enabled ? 'On' : 'Off'}
        </label>
      </div>

      <div style={{ opacity: draft.enabled ? 1 : 0.45, pointerEvents: draft.enabled ? 'auto' : 'none', marginTop: 14 }}>
        <div style={label}>BEFORE IT IS DUE</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DAYS_BEFORE_CHOICES.map(d => (
            <button key={d} onClick={() => setDraft({ ...draft, days_before: d })} style={chip(draft.days_before === d)}>
              {d === 0 ? 'None' : `${d} day${d === 1 ? '' : 's'}`}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '12px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.on_due}
                 onChange={e => setDraft({ ...draft, on_due: e.target.checked })} />
          On the due date
        </label>

        <div style={label}>AFTER IT IS DUE (DAYS LATE)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {OVERDUE_CHOICES.map(d => (
            <button key={d} onClick={() => toggleOverdue(d)} style={chip(draft.overdue_days.includes(d))}>{d}</button>
          ))}
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginTop: 12 }}>{summarizePolicy(draft)}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <Button variant="primary" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {msg && (
          <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--sem-green)' : 'var(--sem-red)' }}>{msg.text}</span>
        )}
      </div>
    </div>
  )
}
