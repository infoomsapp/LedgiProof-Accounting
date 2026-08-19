// PATH: src/hooks/useEstimateDraft.ts
//
// Specialized hook for the estimate EDITOR UI.
// Manages:
//   · Local draft state (items, scope, terms, etc.)
//   · Computed totals as user types
//   · Dirty flag + saving state
//   · Debounced auto-save on changes
//
// Different from useEstimate (which fetches read-only data via React Query).
// Use this only inside the editor component.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  updateEstimate,
  addEstimateItem,
  updateEstimateItem,
  deleteEstimateItem
} from '../services/estimate.service'
import {
  calcLineTotals,
  calcEstimateTotals,
  type Estimate,
  type EstimateItem,
  type EstimateItemType
} from '../types/estimate'

const AUTOSAVE_DEBOUNCE_MS = 800

// ── Local draft item shape (allows id=null while pending insert) ─────────────

export interface DraftItem {
  /** Real DB id; null = not yet persisted */
  id:            string | null
  /** Local id used for React keys before persistence */
  localId:       string
  sort_order:    number
  item_type:     EstimateItemType
  description:   string
  quantity:      number
  unit_price:    number
  discount_pct:  number
  tax_rate:      number
  line_subtotal: number
  line_discount: number
  line_tax:      number
  line_total:    number
  /** Flag for the row state */
  _dirty?:       boolean
  _saving?:      boolean
}

export interface UseEstimateDraft {
  // State
  items:        DraftItem[]
  totals:       { subtotal: number; discount_total: number; tax_total: number; total: number }
  isSaving:     boolean
  hasError:     boolean
  error:        string | null

  // Item operations
  addItem:        (partial?: Partial<DraftItem>) => void
  updateItem:     (localId: string, patch: Partial<DraftItem>) => void
  removeItem:     (localId: string) => Promise<void>
  reorderItem:    (localId: string, newIndex: number) => void

  // Estimate-level top fields (title, notes, terms, etc.)
  patchEstimate:  (patch: Partial<Pick<Estimate, 'title' | 'scope_description' | 'valid_until' | 'notes' | 'terms' | 'footer' | 'currency'>>) => Promise<void>

  // Manual save (forces flush of pending debounced saves)
  flush:          () => Promise<void>
}

/** Initialize draft from a fetched bundle */
export function useEstimateDraft(
  estimateId: string,
  initialItems: EstimateItem[]
): UseEstimateDraft {
  const [items, setItems]         = useState<DraftItem[]>(() => initialItems.map(toDraft))
  const [isSaving, setIsSaving]   = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Track pending debounced saves per localId so we can flush
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingPatchesRef = useRef<Record<string, Partial<DraftItem>>>({})

  // Re-hydrate when the upstream items change (e.g. after invalidate)
  useEffect(() => {
    setItems(initialItems.map(toDraft))
  }, [initialItems])

  // ── Totals (derived) ────────────────────────────────────────────────────
  const totals = useMemo(() => calcEstimateTotals(items), [items])

  // ── Local item operations ──────────────────────────────────────────────

  const updateItem = useCallback((localId: string, patch: Partial<DraftItem>) => {
    setItems(prev => prev.map(it => {
      if (it.localId !== localId) return it
      const next = { ...it, ...patch, _dirty: true }
      // Recompute line totals when relevant fields change
      if (
        patch.quantity     !== undefined ||
        patch.unit_price   !== undefined ||
        patch.discount_pct !== undefined ||
        patch.tax_rate     !== undefined
      ) {
        const t = calcLineTotals({
          quantity:     next.quantity,
          unit_price:   next.unit_price,
          discount_pct: next.discount_pct,
          tax_rate:     next.tax_rate
        })
        Object.assign(next, t)
      }
      return next
    }))

    // Queue auto-save
    const merged = { ...(pendingPatchesRef.current[localId] ?? {}), ...patch }
    pendingPatchesRef.current[localId] = merged
    scheduleItemSave(localId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scheduleItemSave = useCallback((localId: string) => {
    if (debounceTimersRef.current[localId]) {
      clearTimeout(debounceTimersRef.current[localId])
    }
    debounceTimersRef.current[localId] = setTimeout(async () => {
      const patch = pendingPatchesRef.current[localId]
      if (!patch) return
      const draft = itemsRef.current.find(i => i.localId === localId)
      if (!draft) return

      delete pendingPatchesRef.current[localId]
      delete debounceTimersRef.current[localId]

      try {
        setItems(prev => prev.map(it => it.localId === localId ? { ...it, _saving: true } : it))

        if (draft.id) {
          // Existing item — UPDATE
          await updateEstimateItem({
            item_id:       draft.id,
            description:   draft.description,
            quantity:      draft.quantity,
            unit_price:    draft.unit_price,
            discount_pct:  draft.discount_pct,
            tax_rate:      draft.tax_rate,
            sort_order:    draft.sort_order
          })
        } else {
          // New item — INSERT
          const newId = await addEstimateItem({
            estimate_id:   estimateId,
            description:   draft.description,
            quantity:      draft.quantity,
            unit_price:    draft.unit_price,
            discount_pct:  draft.discount_pct,
            tax_rate:      draft.tax_rate,
            item_type:     draft.item_type,
            sort_order:    draft.sort_order
          })
          setItems(prev => prev.map(it => it.localId === localId ? { ...it, id: newId } : it))
        }

        setItems(prev => prev.map(it => it.localId === localId ? { ...it, _saving: false, _dirty: false } : it))
        setError(null)
      } catch (e: any) {
        setError(e?.message ?? 'Could not save item')
        setItems(prev => prev.map(it => it.localId === localId ? { ...it, _saving: false } : it))
      }
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [estimateId])

  // Mirror state for use inside the debounce closure
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const addItem = useCallback((partial: Partial<DraftItem> = {}) => {
    const localId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const sortOrder = itemsRef.current.length > 0
      ? Math.max(...itemsRef.current.map(i => i.sort_order)) + 1
      : 0

    const draft: DraftItem = {
      id:            null,
      localId,
      sort_order:    sortOrder,
      item_type:     'service',
      description:   '',
      quantity:      1,
      unit_price:    0,
      discount_pct:  0,
      tax_rate:      0,
      line_subtotal: 0,
      line_discount: 0,
      line_tax:      0,
      line_total:    0,
      _dirty:        true,
      ...partial
    }
    // Recompute on init
    Object.assign(draft, calcLineTotals(draft))

    setItems(prev => [...prev, draft])

    // Auto-save the new row immediately if it has a description; otherwise wait
    if (draft.description.trim().length > 0) {
      pendingPatchesRef.current[localId] = { ...draft }
      scheduleItemSave(localId)
    }
  }, [scheduleItemSave])

  const removeItem = useCallback(async (localId: string) => {
    const target = itemsRef.current.find(i => i.localId === localId)
    if (!target) return

    // Optimistic local remove
    setItems(prev => prev.filter(i => i.localId !== localId))

    // If never persisted, no API call needed
    if (!target.id) return

    try {
      await deleteEstimateItem(target.id)
    } catch (e: any) {
      // Rollback
      setItems(prev => [...prev, target].sort((a, b) => a.sort_order - b.sort_order))
      setError(e?.message ?? 'Could not delete item')
    }
  }, [])

  const reorderItem = useCallback((localId: string, newIndex: number) => {
    // Snapshot the current order — cloned, not just referenced — before
    // reordering. The reorder below mutates item objects in place via
    // shared references, so a plain reference to itemsRef.current would
    // reflect the NEW order by the time a rollback needs the OLD one.
    const previousOrder = itemsRef.current.map(it => ({ ...it }))

    setItems(prev => {
      const idx = prev.findIndex(i => i.localId === localId)
      if (idx < 0 || newIndex < 0 || newIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(idx, 1)
      if (!moved) return prev   // defensive — idx was already bounds-checked above
      next.splice(newIndex, 0, moved)
      // Reassign sort_order based on new positions
      next.forEach((it, i) => { it.sort_order = i })
      return next
    })

    // Persist new sort_orders for all affected items. A failed save here
    // used to be swallowed silently — the row order looked saved on screen
    // even when the server never received it. Roll back to the pre-reorder
    // order and surface the error instead, so a failed reorder never looks
    // silently successful on a financial document.
    const saves: Promise<void>[] = []
    itemsRef.current.forEach(it => {
      if (it.id) {
        saves.push(updateEstimateItem({ item_id: it.id, sort_order: it.sort_order }))
      }
    })
    Promise.all(saves).catch((e: any) => {
      setItems(previousOrder)
      setError(e?.message ?? 'Could not save the new item order')
    })
  }, [])

  // ── Estimate-level update ──────────────────────────────────────────────
  const patchEstimate = useCallback(async (
    patch: Partial<Pick<Estimate, 'title' | 'scope_description' | 'valid_until' | 'notes' | 'terms' | 'footer' | 'currency'>>
  ) => {
    setIsSaving(true)
    try {
      await updateEstimate({ estimate_id: estimateId, ...patch })
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Could not save estimate')
      throw e
    } finally {
      setIsSaving(false)
    }
  }, [estimateId])

  // ── Flush pending saves ────────────────────────────────────────────────
  const flush = useCallback(async () => {
    const pending = Object.keys(debounceTimersRef.current)
    pending.forEach(localId => {
      clearTimeout(debounceTimersRef.current[localId])
      delete debounceTimersRef.current[localId]
    })

    // Wait a tick for any in-flight setItems to settle, then save each pending
    await Promise.all(pending.map(async localId => {
      const draft = itemsRef.current.find(i => i.localId === localId)
      if (!draft) return
      try {
        if (draft.id) {
          await updateEstimateItem({
            item_id:      draft.id,
            description:  draft.description,
            quantity:     draft.quantity,
            unit_price:   draft.unit_price,
            discount_pct: draft.discount_pct,
            tax_rate:     draft.tax_rate,
            sort_order:   draft.sort_order
          })
        } else {
          const newId = await addEstimateItem({
            estimate_id:  estimateId,
            description:  draft.description,
            quantity:     draft.quantity,
            unit_price:   draft.unit_price,
            discount_pct: draft.discount_pct,
            tax_rate:     draft.tax_rate,
            item_type:    draft.item_type,
            sort_order:   draft.sort_order
          })
          setItems(prev => prev.map(it => it.localId === localId ? { ...it, id: newId } : it))
        }
      } catch (e: any) {
        setError(e?.message ?? 'Could not save item')
      }
    }))
    // 🐛 Real bug fixed: `delete pendingPatchesRef.current` made no sense
    // (a ref's `.current` property always exists, it's never optional) and
    // TS correctly rejected it. The reassignment right below already clears
    // the pending-patches map — that's the actual intent.
    pendingPatchesRef.current = {}
  }, [estimateId])

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(debounceTimersRef.current).forEach(clearTimeout)
    }
  }, [])

  return {
    items,
    totals,
    isSaving: isSaving || items.some(i => i._saving),
    hasError: !!error,
    error,
    addItem,
    updateItem,
    removeItem,
    reorderItem,
    patchEstimate,
    flush
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDraft(item: EstimateItem): DraftItem {
  return {
    id:            item.id,
    localId:       item.id,   // existing items reuse their id
    sort_order:    item.sort_order,
    item_type:     item.item_type,
    description:   item.description,
    quantity:      Number(item.quantity)      || 0,
    unit_price:    Number(item.unit_price)    || 0,
    discount_pct:  Number(item.discount_pct)  || 0,
    tax_rate:      Number(item.tax_rate)      || 0,
    line_subtotal: Number(item.line_subtotal) || 0,
    line_discount: Number(item.line_discount) || 0,
    line_tax:      Number(item.line_tax)      || 0,
    line_total:    Number(item.line_total)    || 0,
    _dirty:        false,
    _saving:       false
  }
}
