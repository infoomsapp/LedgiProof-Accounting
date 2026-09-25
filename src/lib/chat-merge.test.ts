import { describe, it, expect } from 'vitest'
import { mergeLatestPage } from './chat-merge'

const m = (...ids: string[]) => ids.map(id => ({ id }))
const ids = (r: { messages: { id: string }[] }) => r.messages.map(x => x.id)

describe('mergeLatestPage', () => {
  it('keeps older pages the user loaded and swaps in the fresh tail', () => {
    // On screen: a1 a2 (older page) + b1 b2 b3 (latest page). Refresh brings
    // b1..b4 (one new message).
    const r = mergeLatestPage(m('a1', 'a2', 'b1', 'b2', 'b3'), m('b1', 'b2', 'b3', 'b4'), true)
    expect(ids(r)).toEqual(['a1', 'a2', 'b1', 'b2', 'b3', 'b4'])
    expect(r.keptOlder).toBe(true)
  })

  it('replaces everything when the thread fits in one page', () => {
    const r = mergeLatestPage(m('b1', 'b2'), m('b1', 'b2', 'b3'), false)
    expect(ids(r)).toEqual(['b1', 'b2', 'b3'])
    expect(r.keptOlder).toBe(false)
  })

  it('takes the page as-is when nothing older is loaded (window starts at index 0)', () => {
    const r = mergeLatestPage(m('b1', 'b2'), m('b1', 'b2', 'b3'), true)
    expect(ids(r)).toEqual(['b1', 'b2', 'b3'])
    expect(r.keptOlder).toBe(false)
  })

  it('drops old pages instead of leaving a gap when more than a page arrived', () => {
    // First fetched id is not on screen at all: keeping a1 a2 would put a hole
    // between them and the new page.
    const r = mergeLatestPage(m('a1', 'a2'), m('z1', 'z2', 'z3'), true)
    expect(ids(r)).toEqual(['z1', 'z2', 'z3'])
    expect(r.keptOlder).toBe(false)
  })

  it('handles an empty fetch and an empty screen', () => {
    expect(ids(mergeLatestPage(m('a1'), [], true))).toEqual([])
    expect(ids(mergeLatestPage([], m('b1'), true))).toEqual(['b1'])
  })

  it('does not mutate its inputs', () => {
    const cur = m('a1', 'b1')
    const fet = m('b1', 'b2')
    mergeLatestPage(cur, fet, true)
    expect(cur).toEqual(m('a1', 'b1'))
    expect(fet).toEqual(m('b1', 'b2'))
  })
})
