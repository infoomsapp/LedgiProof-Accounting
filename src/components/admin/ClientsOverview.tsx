// PATH: src/components/admin/ClientsOverview.tsx

import { useViewAs } from '../../hooks/useViewAs'
import type {
  TopClient,
  ClientWithIssues,
  InactiveClient
} from '../../services/admin-command.service'

interface Props {
  topClients:        TopClient[]
  clientsWithIssues: ClientWithIssues[]
  inactiveClients:   InactiveClient[]
}

export default function ClientsOverview({
  topClients, clientsWithIssues, inactiveClients
}: Props) {
  const { viewAsOrg: enterViewAsOrg } = useViewAs()

  async function viewAsOrg(orgId: string, _orgName: string) {
    try {
      await enterViewAsOrg(orgId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to enter View As mode')
    }
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        marginBottom: 8, fontWeight: 600
      }}>
        Multi-client overview
        <span style={{
          textTransform: 'none', letterSpacing: 0,
          fontWeight: 400, color: '#475569', marginLeft: 8
        }}>
          · Click any row to view as that organization
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>

        {/* TOP BY ACTIVITY */}
        <Panel title="Top by activity (30d)" emptyText="No activity yet" badge={topClients.length}>
          {topClients.map(c => (
            <Row
              key={c.org_id}
              orgName={c.org_name}
              orgSlug={c.org_slug}
              right={<span style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#06b6d4' }}>
                {c.tx_count.toLocaleString('en-US')} tx
              </span>}
              onClick={() => viewAsOrg(c.org_id, c.org_name)}
            />
          ))}
        </Panel>

        {/* WITH ISSUES (RED) */}
        <Panel
          title="With issues 🔴"
          emptyText="No clients with red flags ✓"
          badge={clientsWithIssues.length}
          tone="warning"
        >
          {clientsWithIssues.map(c => (
            <Row
              key={c.org_id}
              orgName={c.org_name}
              orgSlug={c.org_slug}
              right={
                <span style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>
                    {c.red_count} 🔴
                  </span>
                  {c.amber_count > 0 && (
                    <span style={{ color: '#f59e0b' }}>
                      {c.amber_count} 🟡
                    </span>
                  )}
                </span>
              }
              onClick={() => viewAsOrg(c.org_id, c.org_name)}
            />
          ))}
        </Panel>

        {/* INACTIVE */}
        <Panel
          title="Inactive (7+ days)"
          emptyText="All clients active ✓"
          badge={inactiveClients.length}
          tone="muted"
        >
          {inactiveClients.map(c => (
            <Row
              key={c.org_id}
              orgName={c.org_name}
              orgSlug={c.org_slug}
              right={
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {c.days_inactive}d
                </span>
              }
              onClick={() => viewAsOrg(c.org_id, c.org_name)}
            />
          ))}
        </Panel>

      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Panel({
  title, badge, tone = 'normal', emptyText, children
}: {
  title:     string
  badge?:    number
  tone?:     'normal' | 'warning' | 'muted'
  emptyText: string
  children:  React.ReactNode
}) {
  const childArray = Array.isArray(children) ? children : [children]
  const isEmpty = childArray.length === 0 || childArray.every(c => !c)

  const borderColor =
    tone === 'warning' ? 'rgba(239,68,68,0.25)' :
    tone === 'muted'   ? 'var(--lp-border)'     :
                         'var(--lp-border)'

  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: `0.5px solid ${borderColor}`,
      borderRadius: 10,
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '0.5px solid var(--lp-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <span style={{
          fontSize: 11, color: '#cbd5e1', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em'
        }}>
          {title}
        </span>
        {badge != null && (
          <span style={{
            fontSize: 10.5, padding: '1px 7px', borderRadius: 100,
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--lp-text-muted)',
            border: '0.5px solid var(--lp-border)'
          }}>
            {badge}
          </span>
        )}
      </div>

      <div style={{ minHeight: 80 }}>
        {isEmpty ? (
          <div style={{
            padding: '20px 14px', fontSize: 12, color: '#475569',
            textAlign: 'center', fontStyle: 'italic'
          }}>
            {emptyText}
          </div>
        ) : children}
      </div>
    </div>
  )
}

function Row({
  orgName, orgSlug, right, onClick
}: {
  orgName: string
  orgSlug: string
  right:   React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, width: '100%', textAlign: 'left',
        padding: '8px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: '0.5px solid rgba(255,255,255,0.03)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s'
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {orgName}
        </div>
        <div style={{
          fontSize: 10, fontFamily: 'monospace', color: '#475569',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {orgSlug}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        {right}
      </div>
    </button>
  )
}