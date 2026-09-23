// PATH: src/components/ui/BackToSiteLink.tsx
// Small "back" arrow shown on auth screens (Login, SignUp) so a visitor who
// landed there from the marketing site isn't stuck with no way out except
// the browser's own back button. Always points at the public landing page.

import { Link } from 'react-router-dom'

export default function BackToSiteLink() {
  return (
    <Link
      to="/"
      style={{
        position: 'fixed',
        top: 20,
        left: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--lp-text-muted)',
        textDecoration: 'none'
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--lp-text)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--lp-text-muted)' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
      Back
    </Link>
  )
}
