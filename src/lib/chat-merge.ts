// PATH: src/lib/chat-merge.ts
//
// Merging a freshly fetched "latest page" of a conversation into the messages
// already on screen, so a realtime/catch-up refresh never throws away older
// pages the user has scrolled back and loaded.

export interface MergeResult<T> {
  messages:  T[]
  /** True when older messages already loaded were kept, so the caller must
   *  keep its existing pagination cursor instead of taking the page's. */
  keptOlder: boolean
}

/**
 * `current` and `fetched` are both oldest-first. `fetched` is the newest page
 * the server returned; `fetchedHasMore` says whether the thread has anything
 * older than that page.
 *
 * - The page is the whole thread (`!fetchedHasMore`) or nothing overlaps:
 *   the fetched page replaces everything (no gap can be left behind).
 * - The page's first message is already on screen after older loaded ones:
 *   keep those older ones and swap in the fresh tail.
 */
export function mergeLatestPage<T extends { id: string }>(
  current:        readonly T[],
  fetched:        readonly T[],
  fetchedHasMore: boolean
): MergeResult<T> {
  const firstId = fetched[0]?.id
  if (!fetchedHasMore || !firstId) return { messages: [...fetched], keptOlder: false }

  const at = current.findIndex(m => m.id === firstId)
  if (at > 0) return { messages: [...current.slice(0, at), ...fetched], keptOlder: true }
  return { messages: [...fetched], keptOlder: false }
}
