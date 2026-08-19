// PATH: src/hooks/useAuditorView.ts
// State + actions for the ReadOnly (auditor) dashboard.
//
// Manages:
//   - workspace selector (auditor can audit multiple orgs)
//   - filter state
//   - summary (KPIs)
//   - cursor-paginated transactions (load more pattern)
//   - CSV export

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAuditorWorkspaces,
  getAuditSummary,
  getAuditTransactions,
  exportAuditCsv,
  downloadCsvBlob,
  type AuditorWorkspace,
  type AuditSummary,
  type AuditTransaction,
  type AuditFilters
} from '../services/auditor.service'

export interface UseAuditorView {
  // Workspace selector
  workspaces:           AuditorWorkspace[]
  workspacesLoading:    boolean
  selectedOrgId:        string | null
  selectOrg:            (orgId: string) => void

  // Filters
  filters:              AuditFilters
  setFilters:           (next: AuditFilters) => void
  resetFilters:         () => void

  // Summary
  summary:              AuditSummary | null
  summaryLoading:       boolean

  // Transactions (paginated)
  transactions:         AuditTransaction[]
  txLoading:            boolean
  txLoadingMore:        boolean
  hasMore:              boolean
  loadMore:             () => Promise<void>

  // Errors
  error:                string | null

  // Actions
  refresh:              () => Promise<void>
  exportCsv:            () => Promise<void>
  exporting:            boolean
}

const PAGE_SIZE = 200

export function useAuditorView(): UseAuditorView {
  // ── Workspace selector ─────────────────────────────────────────────────────
  const [workspaces,        setWorkspaces]        = useState<AuditorWorkspace[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(true)
  const [selectedOrgId,     setSelectedOrgId]     = useState<string | null>(null)

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<AuditFilters>({})

  // ── Summary ────────────────────────────────────────────────────────────────
  const [summary,        setSummary]        = useState<AuditSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // ── Transactions ───────────────────────────────────────────────────────────
  const [transactions,   setTransactions]   = useState<AuditTransaction[]>([])
  const [txLoading,      setTxLoading]      = useState(false)
  const [txLoadingMore,  setTxLoadingMore]  = useState(false)
  const [nextCursor,     setNextCursor]     = useState<string | null>(null)
  const [hasMore,        setHasMore]        = useState(false)

  // ── Misc ───────────────────────────────────────────────────────────────────
  const [error,     setError]     = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const inFlight = useRef(false)

  // ── Initial: load workspaces ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setWorkspacesLoading(true)
      setError(null)
      try {
        const res = await getAuditorWorkspaces()
        if (cancelled) return
        setWorkspaces(res.workspaces)
        // Auto-select first workspace if none selected
        const firstWorkspace = res.workspaces[0]
        if (firstWorkspace && !selectedOrgId) {
          setSelectedOrgId(firstWorkspace.org_id)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Could not load workspaces')
      } finally {
        if (!cancelled) setWorkspacesLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load summary + first page of tx whenever org or filters change ────────
  const loadAll = useCallback(async () => {
    if (!selectedOrgId || inFlight.current) return
    inFlight.current = true
    setError(null)
    setSummaryLoading(true)
    setTxLoading(true)

    try {
      const [summaryRes, txRes] = await Promise.all([
        getAuditSummary(selectedOrgId, {
          ...(filters.date_from ? { date_from: filters.date_from } : {}),
          ...(filters.date_to   ? { date_to:   filters.date_to   } : {}),
          ...(filters.client_id ? { client_id: filters.client_id } : {})
        }),
        getAuditTransactions(selectedOrgId, filters, null, PAGE_SIZE)
      ])
      setSummary(summaryRes)
      setTransactions(txRes.transactions)
      setHasMore(txRes.has_more)
      setNextCursor(txRes.next_cursor)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load audit data')
    } finally {
      setSummaryLoading(false)
      setTxLoading(false)
      inFlight.current = false
    }
  }, [selectedOrgId, filters])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // ── Load next page (cursor pagination) ─────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!selectedOrgId || !hasMore || !nextCursor || txLoadingMore) return
    setTxLoadingMore(true)
    setError(null)

    try {
      const res = await getAuditTransactions(
        selectedOrgId,
        filters,
        nextCursor,
        PAGE_SIZE
      )
      setTransactions(prev => [...prev, ...res.transactions])
      setHasMore(res.has_more)
      setNextCursor(res.next_cursor)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load more transactions')
    } finally {
      setTxLoadingMore(false)
    }
  }, [selectedOrgId, filters, nextCursor, hasMore, txLoadingMore])

  // ── CSV export ─────────────────────────────────────────────────────────────
  const exportCsv = useCallback(async () => {
    if (!selectedOrgId || exporting) return
    setExporting(true)
    setError(null)

    try {
      const csv = await exportAuditCsv(selectedOrgId, filters)
      const ws  = workspaces.find(w => w.org_id === selectedOrgId)
      const slug = ws?.slug ?? 'workspace'
      const ts   = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
      downloadCsvBlob(csv, `audit-${slug}-${ts}.csv`)
    } catch (e: any) {
      setError(e?.message ?? 'Could not export CSV')
    } finally {
      setExporting(false)
    }
  }, [selectedOrgId, filters, exporting, workspaces])

  // ── Public actions ─────────────────────────────────────────────────────────
  const selectOrg = useCallback((orgId: string) => {
    setSelectedOrgId(orgId)
    setTransactions([])
    setSummary(null)
    setNextCursor(null)
    setHasMore(false)
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({})
  }, [])

  return {
    workspaces,
    workspacesLoading,
    selectedOrgId,
    selectOrg,
    filters,
    setFilters,
    resetFilters,
    summary,
    summaryLoading,
    transactions,
    txLoading,
    txLoadingMore,
    hasMore,
    loadMore,
    error,
    refresh: loadAll,
    exportCsv,
    exporting
  }
}
