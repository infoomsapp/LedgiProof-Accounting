import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ db: {} }))
import { extraCompanyPrice, planHighlights } from './plans'

describe('extra companies (Option B)', () => {
  it('prices an extra company as a share of the plan', () => {
    expect(extraCompanyPrice('starter', 50)).toBe(5)        // 9.99 × 50% → 5.00 (rounded to cents)
    expect(extraCompanyPrice('entrepreneur', 50)).toBe(10)  // 19.99 × 50%
  })
  it('has no price without a share or a list price', () => {
    expect(extraCompanyPrice('starter', 0)).toBeNull()
    expect(extraCompanyPrice('enterprise', 50)).toBeNull()
  })
  it('says it on the pricing card only when the plan offers it', () => {
    expect(planHighlights({ extra_workspace_pct: 50 })).toContain('Extra companies: 50% of the plan each')
    expect(planHighlights({})).not.toContain('Extra companies: 50% of the plan each')
  })
})
