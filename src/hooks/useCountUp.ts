// PATH: src/hooks/useCountUp.ts
//
// Animates a number from its previous value up (or down) to `target` over
// `duration` ms, eased out. Skips the animation entirely and jumps straight
// to `target` when the user has requested reduced motion.

import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'

export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      fromRef.current = target
      setValue(target)
      return
    }

    const from  = fromRef.current
    const delta = target - from
    if (delta === 0) return

    const start = performance.now()
    let timer: ReturnType<typeof setTimeout>

    // setTimeout, not requestAnimationFrame — rAF is suspended entirely for a
    // hidden/backgrounded tab (e.g. opened in a background tab, prerendered),
    // which would leave the number stuck at its starting value forever. A
    // ~60fps timeout still fires in that case (just possibly throttled), and
    // progress is computed from real elapsed time either way, so the
    // animation's duration stays correct regardless of throttling.
    function tick() {
      const now   = performance.now()
      const t     = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + delta * eased)
      if (t < 1) {
        timer = setTimeout(tick, 16)
      } else {
        fromRef.current = target
      }
    }

    timer = setTimeout(tick, 16)
    return () => clearTimeout(timer)
  }, [target, duration])

  return value
}
