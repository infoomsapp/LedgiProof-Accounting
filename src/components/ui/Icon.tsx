// PATH: src/components/ui/Icon.tsx
//
// Shared outline-SVG icon set. Same visual language as AppShell.tsx's
// sidebar NavIcon (24 viewBox, ~1.6-1.8 stroke, round caps) -- introduced
// so the surfaces built this session (Settings tabs, Connections,
// ClientWorkspaceOverview cards, ClientScopeBanner) stop using emoji
// characters as icons. Reuses AppShell's own path data where the same
// destination already has one there, so a route's icon looks identical
// whether it's rendered in the sidebar or a card.

import type { CSSProperties } from 'react'

export const ICON_PATHS = {
  // Reused verbatim from AppShell.tsx's NAV arrays, for visual consistency.
  transactions:  'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  invoices:      'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  estimates:     'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  bank:          'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
  reports:       'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  time:          'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  checklist:     'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  payroll:       'M17 9V7a4 4 0 00-8 0v2M5 9h14l1 11H4L5 9zm7 3v4',
  settingsGear:  'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',

  // New, matching the same visual language.
  accounts:      'M4 6a2 2 0 012-2h8l6 6v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6z M14 4v6h6 M9 14h6 M9 17h4',
  reconciliation:'M12 3v18 M5 7l-3 6a3 3 0 006 0l-3-6z M19 7l-3 6a3 3 0 006 0l-3-6z M5 7h14 M7 21h10',
  journal:       'M4 19.5A2.5 2.5 0 016.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z M9 7h7 M9 11h7',
  periods:       'M5 11V8a7 7 0 0114 0v3 M4 11h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9z M12 15v3',
  branding:      'M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z',
  connection:    'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  vendors:       'M3 7l1-3h16l1 3M4 7h16v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7z M9 11a3 3 0 006 0',
  worksheet:     'M9 2H4v20h16V9l-7-7z M13 2v7h7 M8 14h8 M8 17h5',
  bills:         'M17 9V7a4 4 0 00-8 0v2M5 9h14l1 11H4L5 9zm4 3h6',
  apiAccess:     'M9 3v4M15 3v4M4 11h16M6 21h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  users:         'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  billing:       'M2 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7z M2 10h20 M6 15h4',
  workspace:     'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  taxInfo:       'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M9 13h1 M9 17h1 M14 13h1 M14 17h1',
  person:        'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z',
  chat:          'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z',
  car:           'M5 17h14M5 17a2 2 0 104 0M15 17a2 2 0 104 0M3 17v-5l2-5h14l2 5v5 M5 12h14',
} as const

export type IconName = keyof typeof ICON_PATHS

export default function Icon({
  name, size = 17, strokeWidth = 1.7, style, className,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  style?: CSSProperties
  className?: string
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className}
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}
