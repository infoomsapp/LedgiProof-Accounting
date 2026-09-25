import { describe, it, expect } from 'vitest'
import { getRing } from './chat-ring'

const c = (n: number, tag?: 'normal' | 'pending' | 'invoice' | 'urgent' | null) =>
  ({ my_unread_count: n, ...(tag !== undefined ? { my_unread_tag: tag } : {}) })

describe('getRing', () => {
  it('is grey with nothing unread', () => {
    expect(getRing([]).ring).toBe('var(--lp-border)')
    expect(getRing([c(0, 'urgent')]).ring).toBe('var(--lp-border)')
  })

  it('a plain unread message is BLUE, not amber (the reported bug)', () => {
    expect(getRing([c(1, 'normal')]).ring).toBe('var(--sem-blue)')
    // even from three different clients: the count no longer turns it amber/red
    expect(getRing([c(1, 'normal'), c(2, 'normal'), c(1, 'normal')]).ring).toBe('var(--sem-blue)')
  })

  it('pending is amber, invoice green, urgent red', () => {
    expect(getRing([c(1, 'pending')]).ring).toBe('var(--sem-amber)')
    expect(getRing([c(1, 'invoice')]).ring).toBe('var(--sem-green)')
    expect(getRing([c(1, 'urgent')]).ring).toBe('var(--sem-red)')
  })

  it('the most important tag across conversations wins', () => {
    expect(getRing([c(1, 'normal'), c(1, 'pending')]).ring).toBe('var(--sem-amber)')
    expect(getRing([c(1, 'pending'), c(1, 'urgent'), c(3, 'normal')]).ring).toBe('var(--sem-red)')
    expect(getRing([c(1, 'invoice'), c(1, 'normal')]).ring).toBe('var(--sem-green)')
  })

  it('a missing tag (old server / Mark as unread) counts as a plain message', () => {
    expect(getRing([c(1)]).ring).toBe('var(--sem-blue)')
    expect(getRing([c(1, null)]).ring).toBe('var(--sem-blue)')
  })

  it('ignores conversations with nothing unread even if a tag is present', () => {
    expect(getRing([c(0, 'urgent'), c(1, 'normal')]).ring).toBe('var(--sem-blue)')
  })

  it('labels the winning tag and how many conversations carry it', () => {
    expect(getRing([c(1, 'urgent'), c(1, 'urgent'), c(1, 'normal')]).label).toBe('Needs a reply · 2 conversations')
    expect(getRing([c(4, 'normal')]).label).toBe('New message · 1 conversation')
  })
})
