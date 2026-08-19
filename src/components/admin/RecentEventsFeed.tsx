// PATH: src/components/admin/RecentEventsFeed.tsx

import type { AdminEvent } from '../../services/admin-command.service'
import { formatDate } from '../../lib/dates'

const KIND_VISUALS: Record<string, { icon: string; color: string; label: string }> = {
  impersonation: { icon: '👁️', color: '#a78bfa', label: 'Impersonation' },
  signup:        { icon: '🟢', color: '#22c55e', label: 'New signup' }
}

export default function RecentEventsFeed({ events }: { events: AdminEvent[] }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        marginBottom: 8, fontWeight: 600
      }}>
        Recent activity
        <span style={{
          textTransform: 'none', letterSpacing: 0,
          fontWeight: 400, color: '#475569', marginLeft: 8
        }}>
          · Last {events.length} events
        </span>
      </div>

      <div style={{
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        borderRadius: 10,
        overflow: 'hidden'
      }}>
        {events.length === 0 ? (
          <div style={{
            padding: '24px 14px', fontSize: 12, color: '#475569',
            textAlign: 'center', fontStyle: 'italic'
          }}>
            No recent events
          </div>
        ) : (
          events.map((e, i) => (
            <EventRow key={`${e.kind}-${e.ref_id}-${i}`} event={e} />
          ))
        )}
      </div>
    </div>
  )
}

function EventRow({ event }: { event: AdminEvent }) {
  const visual = KIND_VISUALS[event.kind] ?? {
    icon: '•', color: '#64748b', label: event.kind
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px',
      borderBottom: '0.5px solid rgba(255,255,255,0.03)',
      borderLeft: `2px solid ${visual.color}40`
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        background: `${visual.color}15`,
        border: `0.5px solid ${visual.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, flexShrink: 0
      }}>
        {visual.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, color: 'var(--lp-text)', lineHeight: 1.4,
          marginBottom: 2
        }}>
          {event.summary}
        </div>
        <div style={{
          fontSize: 10.5, color: '#475569',
          display: 'flex', gap: 8, alignItems: 'center'
        }}>
          {event.actor && (
            <span style={{ fontFamily: 'monospace' }}>
              {event.actor}
            </span>
          )}
          <span>·</span>
          <span>{relativeTime(event.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1)   return 'just now'
  if (minutes < 60)  return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)    return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7)      return `${days}d ago`
  return formatDate(iso)
}