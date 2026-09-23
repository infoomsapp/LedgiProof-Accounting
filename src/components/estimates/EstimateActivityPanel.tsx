// PATH: src/components/estimates/EstimateActivityPanel.tsx
//
// Surfaces the estimate_signatures / estimate_responses audit trail to the
// business owner. Both tables and their read functions
// (getEstimateSignatures / getEstimateResponses) already existed and were
// fully populated by the accept/reject/counter-offer RPCs -- no UI anywhere
// showed this to the org side, so a firm had no way to see who actually
// signed an accepted estimate, or why a client declined one, without
// querying the database directly.

import { useEffect, useState } from 'react'
import { getEstimateSignatures, getEstimateResponses } from '../../services/estimate.service'
import type { EstimateResponse, EstimateSignature } from '../../types/estimate'

interface Props {
  estimateId: string
  status: string
}

type ActivityEvent = {
  at:      string
  kind:    'signed' | 'accept' | 'reject' | 'counter_offer' | 'view'
  who:     string | null
  detail:  string | null
}

const KIND_CONFIG: Record<ActivityEvent['kind'], { label: string; color: string }> = {
  signed:        { label: 'Signed',          color: 'var(--sem-blue)' },
  accept:        { label: 'Accepted',        color: 'var(--sem-green)' },
  reject:        { label: 'Declined',        color: 'var(--sem-red)' },
  counter_offer: { label: 'Countered',       color: 'var(--sem-amber)' },
  view:          { label: 'Viewed',          color: 'var(--lp-text-muted)' }
}

export default function EstimateActivityPanel({ estimateId, status }: Props) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [open, setOpen]     = useState(false)

  useEffect(() => {
    if (status === 'draft') return // nothing to show — never sent yet
    let cancelled = false

    Promise.all([
      getEstimateSignatures(estimateId),
      getEstimateResponses(estimateId)
    ]).then(([signatures, responses]: [EstimateSignature[], EstimateResponse[]]) => {
      if (cancelled) return
      const sigEvents: ActivityEvent[] = signatures.map(s => ({
        at:     s.signed_at,
        kind:   'signed',
        who:    s.signer_name ?? s.signer_email,
        detail: s.signer_email && s.signer_name ? s.signer_email : null
      }))
      const respEvents: ActivityEvent[] = responses.map(r => ({
        at:     r.created_at,
        kind:   r.response_type as ActivityEvent['kind'],
        who:    r.responder_name ?? r.responder_email,
        detail: r.response_type === 'counter_offer' && r.proposed_total != null
          ? `Proposed $${Number(r.proposed_total).toFixed(2)}${r.message ? ` — "${r.message}"` : ''}`
          : r.message
      }))
      const merged = [...sigEvents, ...respEvents].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      setEvents(merged)
    }).catch(() => setEvents([]))

    return () => { cancelled = true }
  }, [estimateId, status])

  if (status === 'draft' || !events || events.length === 0) return null

  return (
    <div className="lp-no-print" style={{
      margin: '0 24px 16px', borderRadius: 10,
      border: '0.5px solid var(--lp-border)', background: 'var(--lp-surface)', overflow: 'hidden'
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit'
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)' }}>
          Activity ({events.length})
        </span>
        <span style={{ fontSize: 11, color: 'var(--lp-text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map((e, i) => {
            const cfg = KIND_CONFIG[e.kind]
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12 }}>
                <span style={{
                  flexShrink: 0, marginTop: 2, width: 7, height: 7, borderRadius: '50%', background: cfg.color
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                  {e.who && <span style={{ color: 'var(--lp-text)' }}> by {e.who}</span>}
                  <span style={{ color: 'var(--lp-text-subtle)' }}> · {new Date(e.at).toLocaleString()}</span>
                  {e.detail && <div style={{ color: 'var(--lp-text-muted)', marginTop: 2 }}>{e.detail}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
