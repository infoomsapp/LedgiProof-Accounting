// PATH: src/components/ui/AccountTypeIcons.tsx
// The hand-drawn monoline icons for the three kinds of LedgiProof account
// (same style as the landing page's icons), plus the tinted tile they sit
// in. Shared by SignUp (invite/plan banner) and AccountSetup (type picker).

export function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
    </svg>
  )
}

export function IconBriefcase() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </svg>
  )
}

export function IconCalculator() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8 12h0M12 12h0M16 12h0M8 16h0M12 16h0M16 16h0" strokeWidth="2.4" />
    </svg>
  )
}

/** Rounded tile tinted with `color` (a CSS color or var()) behind an icon. */
export function IconTile({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `color-mix(in srgb, ${color} 12%, transparent)`, color
    }}>
      {children}
    </div>
  )
}
