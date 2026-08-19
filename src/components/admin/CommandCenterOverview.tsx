// PATH: src/components/admin/CommandCenterOverview.tsx
// The new SuperAdmin Overview tab content.
// Orchestrates the 5 panels + Quick Search palette.
// Drop-in replacement for the old StatCard-based overview.

import { useEffect, useState } from 'react'
import { useAdminCommandCenter } from '../../hooks/useAdminCommandCenter'
import SystemHealthRow   from './SystemHealthRow'
import RevenueRow        from './RevenueRow'
import RiskRow           from './RiskRow'
import ClientsOverview   from './ClientsOverview'
import RecentEventsFeed  from './RecentEventsFeed'
import QuickSearchPalette from './QuickSearchPalette'

export default function CommandCenterOverview() {
  const { data, loading, refreshing, error, lastRefreshedAt, refresh } =
    useAdminCommandCenter(true)

  const [paletteOpen, setPaletteOpen] = useState(false)

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const modKey = isMac ? e.metaKey : e.ctrlKey
      if (modKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Initial load skeleton
  if (loading && !data) {
    return (
      <div style={{
        padding: 60, textAlign: 'center', color: 'var(--lp-text-muted)', fontSize: 13
      }}>
        Loading command center…
      </div>
    )
  }

  // Hard error (will not happen normally — RPC has graceful fallback)
  if (error && !data) {
    return (
      <div style={{
        padding: '14px 18px', borderRadius: 10,
        background: 'rgba(239,68,68,0.08)',
        border: '0.5px solid rgba(239,68,68,0.3)',
        color: '#ef4444', fontSize: 13
      }}>
        ⚠ Could not load command center: {error}
        <button
          onClick={refresh}
          style={{
            marginLeft: 12, padding: '3px 10px', borderRadius: 6,
            background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)',
            color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  // Soft error (RPC succeeded with partial data)
  return (
    <>
      {/* Quick action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 18,
        padding: '10px 14px', borderRadius: 10,
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)'
      }}>
        <button
          onClick={() => setPaletteOpen(true)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid var(--lp-border)',
            color: 'var(--lp-text-muted)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left'
          }}
        >
          <span style={{ fontSize: 13 }}>🔍</span>
          <span style={{ flex: 1 }}>Search clients, users, organizations…</span>
          <kbd style={{
            fontSize: 9.5, padding: '2px 7px', borderRadius: 4,
            background: 'rgba(255,255,255,0.05)',
            border: '0.5px solid var(--lp-border)',
            color: '#64748b', fontFamily: 'inherit'
          }}>
            ⌘K
          </kbd>
        </button>

        <button
          onClick={refresh}
          disabled={refreshing}
          title="Refresh now"
          style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid var(--lp-border)',
            color: refreshing ? '#475569' : 'var(--lp-text-muted)',
            cursor: refreshing ? 'wait' : 'pointer',
            fontFamily: 'inherit', fontSize: 12.5,
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          {refreshing ? '⏳' : '🔄'}
          <span style={{ fontSize: 11 }}>
            {lastRefreshedAt ? formatLastRefresh(lastRefreshedAt) : 'Refresh'}
          </span>
        </button>
      </div>

      {/* Soft error banner if RPC returned partial */}
      {data.error && (
        <div style={{
          padding: '8px 14px', borderRadius: 8, marginBottom: 14, fontSize: 12,
          background: 'rgba(245,158,11,0.08)',
          border: '0.5px solid rgba(245,158,11,0.3)',
          color: '#fbbf24'
        }}>
          ⚠ Partial data — some KPIs may be unavailable: {data.error}
        </div>
      )}

      {/* Panels */}
      <SystemHealthRow data={data.system_health} />
      <RevenueRow      data={data.revenue} />
      <RiskRow         data={data.risk} />

      <ClientsOverview
        topClients={data.top_clients}
        clientsWithIssues={data.clients_with_issues}
        inactiveClients={data.inactive_clients}
      />

      <RecentEventsFeed events={data.recent_events} />

      {/* ⌘K palette */}
      <QuickSearchPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </>
  )
}

function formatLastRefresh(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 5)  return 'just now'
  if (diff < 60) return `${diff}s ago`
  return `${Math.floor(diff / 60)}m ago`
}