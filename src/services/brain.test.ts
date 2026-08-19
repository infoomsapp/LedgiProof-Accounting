// PATH: src/services/brain.test.ts
// Worked-examples for the semaphore engine's PURE core: priority resolution
// and defensive config parsing. No DB, no I/O.
import { describe, it, expect } from 'vitest'
import { resolvePriority, cfgNumber } from './brain.service'
import type { RuleSeverity } from '../types/database.types'

function rule(
  id: string,
  severity: RuleSeverity,
  score: number,
  fired = true
): {
  id: string; name: string; severity: RuleSeverity
  score: number; fired: boolean; reason: string | null
} {
  return { id, name: id, severity, score, fired, reason: `${id} reason` }
}

describe('semaphore priority (critical→red > review→amber > info→green > none→green)', () => {
  it('no fired rules → green with no winner', () => {
    const r = resolvePriority([rule('a', 'critical', 0.9, false)])
    expect(r.finalStatus).toBe('green')
    expect(r.ruleTriggered).toBeNull()
    expect(r.ruleScore).toBeNull()
  })

  it('a single info rule → green, still surfaces the rule (blue is never auto-assigned)', () => {
    const r = resolvePriority([rule('info1', 'info', 0.4)])
    expect(r.finalStatus).toBe('green')
    expect(r.ruleTriggered).toBe('info1')
  })

  it('the engine never emits blue on its own', () => {
    const statuses = [
      resolvePriority([]).finalStatus,
      resolvePriority([rule('i', 'info', 0.5)]).finalStatus,
      resolvePriority([rule('r', 'review', 0.5)]).finalStatus,
      resolvePriority([rule('c', 'critical', 0.5)]).finalStatus
    ]
    expect(statuses).not.toContain('blue')
  })

  it('review beats info → amber', () => {
    const r = resolvePriority([rule('i', 'info', 0.99), rule('rev', 'review', 0.1)])
    expect(r.finalStatus).toBe('amber')
    expect(r.ruleTriggered).toBe('rev')
  })

  it('critical beats review AND info → red, even with a lower score', () => {
    const r = resolvePriority([
      rule('rev', 'review',   0.95),
      rule('inf', 'info',     0.90),
      rule('crit', 'critical', 0.20)
    ])
    expect(r.finalStatus).toBe('red')
    expect(r.ruleTriggered).toBe('crit')
    expect(r.ruleScore).toBe(0.20)
  })

  it('within the winning severity, highest score wins', () => {
    const r = resolvePriority([
      rule('crit_low',  'critical', 0.30),
      rule('crit_high', 'critical', 0.80),
      rule('crit_mid',  'critical', 0.55)
    ])
    expect(r.finalStatus).toBe('red')
    expect(r.ruleTriggered).toBe('crit_high')
    expect(r.ruleScore).toBe(0.80)
  })

  it('does not mutate the input array order', () => {
    const input = [rule('a', 'critical', 0.1), rule('b', 'critical', 0.9)]
    resolvePriority(input)
    expect(input.map(x => x.id)).toEqual(['a', 'b'])
  })
})

describe('cfgNumber — defensive config parsing', () => {
  it('returns a real number as-is', () => {
    expect(cfgNumber({ k: 5 }, 'k', 9)).toBe(5)
  })
  it('falls back when the key is missing or null', () => {
    expect(cfgNumber({}, 'k', 9)).toBe(9)
    expect(cfgNumber({ k: null }, 'k', 9)).toBe(9)
  })
  it('coerces a numeric string', () => {
    expect(cfgNumber({ k: '7' }, 'k', 9)).toBe(7)
  })
  it('falls back on a non-numeric string', () => {
    expect(cfgNumber({ k: 'abc' }, 'k', 9)).toBe(9)
  })
  it('falls back on non-finite numbers (NaN / Infinity)', () => {
    expect(cfgNumber({ k: NaN }, 'k', 9)).toBe(9)
    expect(cfgNumber({ k: Infinity }, 'k', 9)).toBe(9)
  })
})
