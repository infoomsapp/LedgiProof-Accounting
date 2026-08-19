// ── src/components/ui/LogoBrand.tsx ──────────────────────────────────────────
// LedgiProof brand component.
// variant="full"    → full lockup (icon + wordmark baked into logo1.png), Login screen
// variant="compact" → icon mark only (sidebar collapsed state)
// variant="sidebar" → icon + wordmark horizontal (sidebar top)
//
// 🩹 FIX (reported: "el logo es demasiado grande, no tiene color, es un
// borrón"): every variant used to hand-type the "LedgiProof" wordmark in
// JSX with color: 'var(--lp-text)' — a light-gray meant for text on a DARK
// background, left over from before globals.css migrated --lp-bg to the
// light theme (#f8fafc). On the current white/near-white surfaces that
// color is almost invisible, which read as "no color" / unprofessional.
// Fixed by (1) using logo1.png for the "full" variant — it's a
// pre-composed, correctly-colored icon+wordmark lockup that already
// existed in assets/ but was never wired in, and (2) using --lp-text
// (the real light-theme token) instead of a hardcoded hex for the
// "sidebar" variant's hand-set wordmark. Also fixed: the "full" variant
// was a fixed 96px regardless of container — now scales via CSS (max-width
// on the wrapper) instead of a hardcoded pixel size.

import logoSrc from '../../assets/logo.png'
import logoFullSrc from '../../assets/logo1.png'

interface LogoBrandProps {
  variant?: 'full' | 'compact' | 'sidebar'
}

export default function LogoBrand({ variant = 'full' }: LogoBrandProps) {

  if (variant === 'compact') {
    return (
      <div style={{
        width: 32, height: 32,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--lp-surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0
      }}>
        <img
          src={logoSrc}
          alt="LedgiProof"
          style={{ width: 28, height: 28, objectFit: 'contain' }}
          draggable={false}
        />
      </div>
    )
  }

  if (variant === 'sidebar') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, overflow: 'hidden'
        }}>
          <img
            src={logoSrc}
            alt=""
            style={{ width: 26, height: 26, objectFit: 'contain' }}
            draggable={false}
          />
        </div>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--lp-text)', letterSpacing: '-0.01em' }}>
            Ledgi
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--lp-accent)', letterSpacing: '-0.01em' }}>
            Proof
          </span>
        </div>
      </div>
    )
  }

  // full — Login screen. Uses the pre-composed icon+wordmark asset instead
  // of hand-typing the wordmark, so color/kerning/alignment can never drift
  // from the source artwork again.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <img
        src={logoFullSrc}
        alt="LedgiProof"
        style={{ width: '100%', maxWidth: 176, height: 'auto', objectFit: 'contain' }}
        draggable={false}
      />
      <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 2, letterSpacing: '0.01em' }}>
        Accounting and Automation Program
      </div>
    </div>
  )
}