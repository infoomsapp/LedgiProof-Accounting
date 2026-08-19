// PATH: src/components/dashboard/v2/shared/OnboardingHint.tsx
//
// A single first-time-only contextual hint bubble, rendered directly above
// the control it explains (normal document flow, not viewport-anchored —
// no getBoundingClientRect/scroll-listener fragility). Reuses the app's
// existing visual language: modal.tsx's hairline border + fade/slide-in,
// CriticalAlertBanner's "info" severity gradient tint.
//
// Dismissing ANY hint (its own × , or the caller's shared "Got it" control)
// marks the whole onboarding surface as seen — see useOnboardingHints. That
// keeps the mental model simple: this is a one-time explanation of a screen,
// not a per-item checklist.

import { X } from 'lucide-react'

interface Props {
  title:      string
  message:    string
  onDismiss:  () => void
}

export default function OnboardingHint({ title, message, onDismiss }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '8px 10px',
      marginBottom: 6,
      borderRadius: 9,
      border: '0.5px solid var(--sem-blue-border)',
      background: 'linear-gradient(90deg, var(--sem-blue-bg-strong), var(--sem-blue-bg))',
      animation: 'lp-modal-fade-in 0.25s ease both'
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sem-blue)', marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', lineHeight: 1.4 }}>
          {message}
        </div>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20, height: 20,
          background: 'transparent',
          border: 'none',
          borderRadius: 5,
          color: 'var(--lp-text-muted)',
          cursor: 'pointer',
          opacity: 0.75,
          transition: 'opacity 0.12s, background 0.12s'
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--sem-blue-bg-strong)' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.background = 'transparent' }}
      >
        <X size={12} strokeWidth={2.5} />
      </button>

      <style>{`
        @keyframes lp-modal-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
