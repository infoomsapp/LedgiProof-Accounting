// PATH: src/lib/motion.ts
//
// Small motion helpers shared across the dashboard redesign. Kept
// intentionally tiny — this app has no animation library, everything is
// hand-rolled CSS (see DashboardLayout.tsx's `lp-fade-in-up` keyframe).

import type { CSSProperties } from 'react'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Inline style for a staggered fade+slide-in entrance, keyed to a section's
 * position on the page. Relies on the `lp-fade-in-up` keyframe declared once
 * in DashboardLayout.tsx (every dashboard renders that layout exactly once).
 * No-ops under prefers-reduced-motion — the element just renders at its
 * final, settled state with no animation.
 */
export function staggerStyle(index: number): CSSProperties {
  if (prefersReducedMotion()) return {}
  return {
    animation: 'lp-fade-in-up 0.45s cubic-bezier(0.16,1,0.3,1) both',
    animationDelay: `${index * 60}ms`
  }
}
