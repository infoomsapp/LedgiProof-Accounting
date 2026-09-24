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
  income:        'M12 19V5 M5 12l7-7 7 7',
  expense:       'M12 5v14 M5 12l7 7 7-7',
  trendUp:       'M22 7l-8.5 8.5-5-5L2 17 M16 7h6v6',
  chartBar:      'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  warning:       'M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0Z M12 9v4 M12 17h.01',
  wave:          'M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0',
  clipboardList: 'M9 2H5a2 2 0 00-2 2v16a2 2 0 002 2h14a2 2 0 002-2V4a2 2 0 00-2-2h-4 M9 2a2 2 0 002 2h2a2 2 0 002-2M9 2a2 2 0 012-2h2a2 2 0 012 2 M9 12h6 M9 16h6 M9 8h2',
  search:        'M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.35-4.35',
  scale:         'M12 3v18 M5 7l-3 6a3 3 0 006 0l-3-6z M19 7l-3 6a3 3 0 006 0l-3-6z M5 7h14 M7 21h10',
  lock:          'M5 11V8a7 7 0 0114 0v3 M4 11h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9z',
  eye:           'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 100-6 3 3 0 000 6z',
  refresh:       'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
  repeat:        'M17 1l4 4-4 4 M3 11V9a4 4 0 014-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 01-4 4H3',
  edit:          'M12 20h9 M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4Z',
  link:          'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  print:         'M6 9V2h12v7 M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2 M6 14h12v8H6z',
  calculator:    'M4 2h16v20H4z M8 6h8 M8 10h.01 M12 10h.01 M16 10h.01 M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01 M16 18h.01',
  trash:         'M3 6h18 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 11v6 M14 11v6',
  send:          'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
  attachment:    'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
  mail:          'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z M22 6l-10 7L2 6',
  shield:        'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  xCircle:       'M12 22a10 10 0 100-20 10 10 0 000 20z M15 9l-6 6 M9 9l6 6',
  bell:          'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0',
  folder:        'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  building:      'M3 21h18 M5 21V7l7-4 7 4v14 M9 9h1 M14 9h1 M9 13h1 M14 13h1 M9 17h1 M14 17h1',
  briefcase:     'M20 7h-3V5a2 2 0 00-2-2h-6a2 2 0 00-2 2v2H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z M9 5h6v2H9V5',
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
