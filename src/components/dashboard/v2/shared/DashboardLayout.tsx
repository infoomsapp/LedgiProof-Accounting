// PATH: src/components/dashboard/v2/DashboardLayout.tsx
//
// Reusable 70/30 grid layout for all dashboards.
// Provides structured slots:
//   · headerSlot:     greeting + role-specific actions (top, full width)
//   · alertSlot:      critical alert banner (optional, full width)
//   · mainSlot:       main content area (left 70%)
//   · sidebarSlot:    activity feed / lateral widgets (right 30%, fixed)
//
// Responsive:
//   · ≥1024px → 2-column grid (1fr / 320px)
//   · <1024px → stacked single column (sidebar moves below main)
//
// All dashboards (Bookkeeper / Solo / Pyme) wrap their content in this.
// Replaces ad-hoc `<div style={{padding}}>` wrappers.

import type { ReactNode } from 'react'

interface Props {
  /** Top header content: greeting + role-specific actions */
  headerSlot:   ReactNode
  /** Optional critical alert banner (red strip below header) */
  alertSlot?:   ReactNode
  /** Main content area (70% on desktop) */
  mainSlot:     ReactNode
  /** Activity sidebar (30% on desktop, optional) */
  sidebarSlot?: ReactNode
}

export default function DashboardLayout({
  headerSlot,
  alertSlot,
  mainSlot,
  sidebarSlot
}: Props) {
  return (
    <div style={{
      padding: '24px 28px',
      flex: 1,
      overflowY: 'auto',
      minHeight: 0
    }}>
      {/* Header — always full width */}
      <div style={{ marginBottom: 16 }}>
        {headerSlot}
      </div>

      {/* Alert banner — full width, optional */}
      {alertSlot && (
        <div style={{ marginBottom: 16 }}>
          {alertSlot}
        </div>
      )}

      {/* 2-column grid: main + sidebar */}
      <div className="lp-dashboard-grid" style={{
        display: 'grid',
        gridTemplateColumns: sidebarSlot ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr)',
        gap: 14,
        alignItems: 'start'
      }}>
        <div style={{ minWidth: 0 }}>
          {mainSlot}
        </div>

        {sidebarSlot && (
          <div style={{ minWidth: 0 }}>
            {sidebarSlot}
          </div>
        )}
      </div>

      {/* Responsive: collapse to single column under 1024px */}
      <style>{`
        @media (max-width: 1023px) {
          .lp-dashboard-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @keyframes lp-fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}