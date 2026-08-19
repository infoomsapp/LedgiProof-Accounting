// PATH: src/pages/Estimates.tsx
//
// CSS-TODO (file-level): remaining are unique blue alpha gradations (0.02/0.03/0.04/0.08/0.12/0.15/0.4) for status badge states and row hover. Direct mappings migrated.
//
//
// REFACTOR v32 (CSS Sprint Mensaje 2):
//   · h1 → .lp-page-title
//   · "+ New" button → .lp-btn.lp-btn-primary (eliminé gradient inline)
//   · Create error → .lp-banner.error
//   · Search input → .lp-input
//   · Filter chips: status active mantiene inline (color dinámico desde
//     ESTIMATE_STATUS_CONFIG), inactive usa border var(--lp-border)
//   · Empty state → .lp-card pattern + .lp-btn-ghost para CTA secundaria
//   · Table → estructura grid (no es <table>, así que no se aplica .lp-table)
//
// Adaptive by role: bookkeeper → "Proposals", solo/pyme → "Estimates"
// Logic 100% preserved.

import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useChatBubbleStore } from '../store/chat-bubble.store'
import { useUserRole } from '../hooks/useUserRole'
import { useAuthStore } from '../store/auth.store'
import { useScope } from '../hooks/useScope'
import { useEstimatesList, useCreateEstimate } from '../hooks/useEstimates'
import {
  ESTIMATE_STATUS_CONFIG,
  type EstimateStatus,
  type EstimateTemplate,
  type EstimateTemplateCategory
} from '../types/estimate'
import EstimateStatusBadge   from '../components/estimates/EstimateStatusBadge'
import TemplatePicker        from '../components/estimates/TemplatePicker'
import SemaphoreSpinner      from '../components/ui/SemaphoreSpinner'
import { deleteEstimate }    from '../services/estimate.service'
import { db }                from '../lib/supabase'
import { formatCurrency }    from '../lib/currency'
import { formatDateShort }   from '../lib/dates'

const STATUS_FILTERS: Array<{ value: EstimateStatus | 'all'; label: string }> = [
  { value: 'all',             label: 'All' },
  { value: 'draft',           label: 'Draft' },
  { value: 'sent',            label: 'Sent' },
  { value: 'viewed',          label: 'Viewed' },
  { value: 'accepted',        label: 'Accepted' },
  { value: 'rejected',        label: 'Rejected' },
  { value: 'counter_offered', label: 'Counter-offered' },
  { value: 'converted',       label: 'Converted' }
]

export default function Estimates() {
  const navigate   = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { openChat } = useChatBubbleStore()
  // ── orgId source ──────────────────────────────────────────────────────────
  // Canonical pattern in LedgiProof: orgId comes from auth.store.membership,
  // NOT from useUserRole (which only exposes capabilities/role kind, no orgId).
  // useOrgStore.loadOrgs() populates membership during App initialization.
  const { membership } = useAuthStore()
  const orgId          = membership?.org_id ?? ''

  // 🆕 Client Switcher Sprint 3 Paso 2 — scope-aware data access.
  // In firm-client mode (/clients/:clientId/estimates), scope.clientId is
  // set and useEstimatesList filters to that client. Self mode = null.
  const scope          = useScope()

  const role           = useUserRole()
  // Sprint B3.5 — `accountant` added (was missing from B3.2 sweep).
  // All firm-side personas see "Proposals" terminology, including CPAs.
  const isBookkeeper   = role.kind === 'bookkeeper_owner'
                      || role.kind === 'bookkeeper_admin'
                      || role.kind === 'bookkeeper_staff'
                      || role.kind === 'accountant_owner'
                      || role.kind === 'accountant_admin'
                      || role.kind === 'accountant_staff'

  const screenTitle = isBookkeeper ? 'Proposals' : 'Estimates'
  const ctaLabel    = isBookkeeper ? '+ New proposal' : '+ New estimate'
  const emptyTitle  = isBookkeeper ? 'No proposals yet' : 'No estimates yet'
  const emptySub    = isBookkeeper
    ? 'Send your first proposal of accounting services to a client.'
    : 'Create your first estimate to send to a client.'

  const suggestedCategories: EstimateTemplateCategory[] = useMemo(() => {
    if (isBookkeeper)                          return ['bookkeeping_monthly', 'accounting_services', 'consulting']
    if (role.kind === 'pyme_owner'
      || role.kind === 'pyme_staff')           return ['general_b2b']
    return []
  }, [role.kind, isBookkeeper])

  const [statusFilter, setStatusFilter] = useState<EstimateStatus | 'all'>('all')
  const [search, setSearch]             = useState('')
  const [pickerOpen, setPickerOpen]     = useState(false)
  const [creating, setCreating]         = useState(false)
  const [createError, setCreateError]   = useState<string | null>(null)

  // Single canonical "create an estimate" entry point: every other trigger
  // in the app (the LP-add menu's "Estimate" item via /clients?intent=
  // estimate, the Pyme dashboard's "+ New estimate" button) now lands here
  // with ?openCreate=1 instead of each inventing its own creation flow.
  // Previously the /clients intent path navigated straight to
  // /clients/:id/estimates/new, which isn't a real route — it silently hit
  // the estimate EDITOR with id="new" and failed to load.
  useEffect(() => {
    if (searchParams.get('openCreate') === '1') {
      setPickerOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('openCreate')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🆕 Sprint 3 Paso 2 — Resolve edit route based on scope.
  // firm-client → /clients/:clientId/estimates/:id
  // self        → /estimates/:id
  const estimateEditPath = (estId: string) => scope.clientId
    ? `/clients/${scope.clientId}/estimates/${estId}`
    : `/estimates/${estId}`

  const listQuery = useEstimatesList({
    orgId,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(scope.clientId ? { clientId: scope.clientId } : {}),  // 🆕 Sprint 3 — scope filter
    limit: 100
  })

  const createMut = useCreateEstimate(orgId)

  const rows = useMemo(() => {
    const all = listQuery.data?.rows ?? []
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter(r => {
      const hay = `${r.estimate_number} ${r.client_name ?? ''} ${r.title ?? ''} ${r.scope_description ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [listQuery.data, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 }
    for (const r of listQuery.data?.rows ?? []) {
      c.all = (c.all ?? 0) + 1
      c[r.status] = (c[r.status] ?? 0) + 1
    }
    return c
  }, [listQuery.data])

  async function handleSelectTemplate(template: EstimateTemplate) {
    setPickerOpen(false)
    setCreating(true)
    setCreateError(null)

    try {
      // 🆕 Sprint 3 Paso 2 — Resolve target client_id:
      //   · firm-client scope → use scope.clientId (bookkeeper is inside that client)
      //   · self mode         → fall back to "first client" (legacy behavior)
      let targetClientId: string | null = scope.clientId

      if (!targetClientId) {
        const { data: clients, error: clientErr } = await db
          .from('clients')
          .select('id, display_name')
          .eq('org_id', orgId)
          .limit(1)

        if (clientErr) throw new Error(clientErr.message)

        const firstClient = clients?.[0]
        if (!firstClient) {
          setCreateError('You need at least one client before creating an estimate. Go to "Clients" and add one first.')
          setCreating(false)
          return
        }
        targetClientId = firstClient.id
      }

      const result = await createMut.mutateAsync({
        org_id:             orgId,
        client_id:          targetClientId,
        template_id:        template.id,
        template_category:  template.category,
        title:              template.name,
        valid_until:        template.default_valid_days
          ? new Date(Date.now() + template.default_valid_days * 86400_000).toISOString().slice(0, 10)
          : null,
        currency:           'USD'
      })

      // 🆕 Sprint 3 Paso 2 — Navigate within scope if firm-client:
      // /clients/:clientId/estimates/:id instead of /estimates/:id
      const editPath = scope.clientId
        ? `/clients/${scope.clientId}/estimates/${result.estimate_id}`
        : `/estimates/${result.estimate_id}`
      navigate(editPath)
    } catch (e: any) {
      setCreateError(e?.message ?? 'Could not create estimate')
    } finally {
      setCreating(false)
    }
  }

  // ── P4 Fase 2.C B2 — Per-row delete handler ───────────────────────────
  // Business rule: only estimates in 'draft' or 'cancelled' state can be
  // deleted. Sent/viewed/accepted estimates represent commitments and must
  // be cancelled (status change) rather than physically removed.
  async function handleDeleteEstimate(row: typeof rows[number]) {
    if (row.status !== 'draft' && row.status !== 'cancelled') return
    const ok = window.confirm(
      `Delete estimate ${row.estimate_number}?

` +
      `This action cannot be undone.`
    )
    if (!ok) return
    try {
      await deleteEstimate(row.id)
      await listQuery.refetch()
    } catch (e: any) {
      alert(`Could not delete estimate: ${e?.message ?? 'unknown error'}`)
    }
  }

  // ── Loading / unauthorized ─────────────────────────────────────────────
  // Auth is still initializing OR orgs haven't loaded yet
  const authLoading = useAuthStore(s => s.loading)
  if (authLoading) {
    return (
      <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
        <SemaphoreSpinner size="md" inline />
      </div>
    )
  }

  if (!orgId) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--lp-text-muted)' }}>
        No workspace selected.
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, marginBottom: 22, flexWrap: 'wrap'
      }}>
        <div>
          <h1 className="lp-page-title">
            {screenTitle}
            {listQuery.data && (
              <span style={{
                fontSize: 13, color: 'var(--lp-text-muted)',
                fontWeight: 500, marginLeft: 10
              }}>
                · {listQuery.data.total}
              </span>
            )}
          </h1>
          <p className="lp-page-sub">
            {isBookkeeper
              ? 'Service proposals sent to your clients.'
              : 'Quotes sent to clients for approval.'}
          </p>
        </div>

        {/* Hidden only in the TRUE empty state (no estimates at all, no
            search active) — the empty-state CTA below is the sole
            call-to-action there. Stays visible during a fruitless search
            (rows.length===0 but search is set) since the empty-state CTA
            itself doesn't render in that case either — this is still the
            only way to create one. */}
        {(rows.length > 0 || search) && (
          <button
            onClick={() => setPickerOpen(true)}
            disabled={creating}
            className="lp-btn lp-btn-primary"
            style={{ fontWeight: 600 }}
          >
            {creating ? <SemaphoreSpinner size="sm" inline /> : null}
            {ctaLabel}
          </button>
        )}
      </div>

      {/* ── Create error banner ─────────────────────────────────────── */}
      {createError && (
        <div className="lp-banner error" style={{
          marginBottom: 14,
          justifyContent: 'space-between'
        }}>
          <span>⚠ {createError}</span>
          <button
            onClick={() => setCreateError(null)}
            style={{
              background: 'none', border: 'none', color: 'inherit',
              cursor: 'pointer', fontSize: 14, fontFamily: 'inherit'
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Filter chips ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12
      }}>
        {STATUS_FILTERS.map(f => {
          const count  = counts[f.value] ?? 0
          const active = statusFilter === f.value
          const cfg    = f.value !== 'all' ? ESTIMATE_STATUS_CONFIG[f.value as EstimateStatus] : null

          // Active state uses status-specific color from config (dynamic — no CSS class).
          // Inactive uses default ghost styling.
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              style={{
                padding: '5px 12px', borderRadius: 100,
                background: active
                  ? (cfg ? cfg.bg : 'var(--sem-blue-bg-strong)')
                  : 'transparent',
                border: active
                  ? `0.5px solid ${cfg ? cfg.color + '60' : 'rgba(59,130,246,0.4)'}`
                  : '0.5px solid var(--lp-border)',
                color: active
                  ? (cfg ? cfg.color : 'var(--lp-accent)')
                  : 'var(--lp-text-muted)',
                fontSize: 11.5,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                whiteSpace: 'nowrap'
              }}
            >
              {f.label}
              {count > 0 && (
                <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Search ──────────────────────────────────────────────────── */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, client, or title…"
        className="lp-input"
        style={{ marginBottom: 14 }}
      />

      {/* ── List ────────────────────────────────────────────────────── */}
      {listQuery.isLoading ? (
        <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
          <SemaphoreSpinner size="md" inline />
        </div>
      ) : listQuery.isError ? (
        <div className="lp-banner error" style={{ padding: 24, justifyContent: 'center' }}>
          ⚠ Could not load estimates.{' '}
          <button
            onClick={() => listQuery.refetch()}
            style={{
              background: 'none', border: 'none', color: 'inherit',
              textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="lp-card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.4 }}>📋</div>
          <div style={{
            fontSize: 14, color: 'var(--lp-text)', fontWeight: 500, marginBottom: 6
          }}>
            {search ? 'No results match your search.' : emptyTitle}
          </div>
          {!search && (
            <>
              <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginBottom: 16 }}>
                {emptySub}
              </div>
              <button
                onClick={() => setPickerOpen(true)}
                className="lp-btn lp-btn-ghost"
                style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--lp-accent)' }}
              >
                {ctaLabel}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '130px 1fr 130px 140px 100px 110px 180px',
            gap: 12,
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.02)',
            borderBottom: '0.5px solid var(--lp-border)',
            fontSize: 10,
            color: 'var(--lp-text-muted)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em'
          }}>
            <div>Number</div>
            <div>Client / Title</div>
            <div>Status</div>
            <div>Issue date</div>
            <div style={{ textAlign: 'right' }}>Valid</div>
            <div style={{ textAlign: 'right' }}>Total</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {/* Rows */}
          {rows.map((row, i) => {
            // 🆕 P4 Fase 2.C B2 — Delete is restricted to non-binding states.
            // Accepted/sent/viewed estimates represent commitments and must
            // be cancelled (status change) rather than deleted.
            const canDelete = row.status === 'draft' || row.status === 'cancelled'
            return (
            <div
              key={row.id}
              onClick={() => navigate(estimateEditPath(row.id))}
              style={{
                display: 'grid',
                gridTemplateColumns: '130px 1fr 130px 140px 100px 110px 180px',
                gap: 12,
                padding: '11px 14px',
                borderBottom: i < rows.length - 1 ? '0.5px solid rgba(255,255,255,0.03)' : 'none',
                cursor: 'pointer',
                fontSize: 12.5,
                color: 'var(--lp-text)',
                transition: 'background 0.12s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {/* Estimate number */}
              <div style={{
                fontFamily: 'monospace', fontSize: 12,
                color: 'var(--lp-violet)', fontWeight: 500
              }}>
                {row.estimate_number}
              </div>

              {/* Client + title */}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5, fontWeight: 500, color: 'var(--lp-text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {row.client_name ?? 'Unknown client'}
                </div>
                {row.title && (
                  <div style={{
                    fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {row.title}
                  </div>
                )}
              </div>

              {/* Status */}
              <div>
                <EstimateStatusBadge status={row.status} compact />
              </div>

              {/* Issue date */}
              <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                {formatDateShort(row.issue_date)}
              </div>

              {/* Valid until */}
              <div style={{
                fontSize: 11.5, color: 'var(--lp-text-muted)',
                textAlign: 'right'
              }}>
                {row.valid_until ? formatDateShort(row.valid_until) : '—'}
              </div>

              {/* Total */}
              <div style={{
                fontFamily: 'monospace',
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--sem-green)',
                textAlign: 'right'
              }}>
                {formatCurrency(row.total, row.currency, { maximumFractionDigits: 0 })}
              </div>

              {/* 🆕 P4 Fase 2.C B2 — Per-row actions: Chat, Edit, Delete */}
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  justifyContent: 'flex-end',
                  alignItems: 'center'
                }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => openChat(row.client_id)}
                  title="Chat about this estimate"
                  style={{
                    background:   'transparent',
                    border:       '0.5px solid var(--lp-border)',
                    color:        'var(--lp-accent)',
                    borderRadius: 6,
                    padding:      '3px 8px',
                    fontSize:     10.5,
                    cursor:       'pointer',
                    fontFamily:   'inherit'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--chat-bubble-mine-bg)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  💬
                </button>
                <button
                  onClick={() => navigate(estimateEditPath(row.id))}
                  title="Edit estimate"
                  style={{
                    background:   'transparent',
                    border:       '0.5px solid var(--lp-border)',
                    color:        'var(--lp-text)',
                    borderRadius: 6,
                    padding:      '3px 8px',
                    fontSize:     10.5,
                    cursor:       'pointer',
                    fontFamily:   'inherit'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  ✏ Edit
                </button>
                <button
                  onClick={() => handleDeleteEstimate(row)}
                  disabled={!canDelete}
                  title={canDelete
                    ? 'Delete this estimate'
                    : 'Only draft or cancelled estimates can be deleted'}
                  style={{
                    background:   'transparent',
                    border:       '0.5px solid var(--lp-border)',
                    color:        canDelete ? 'var(--sem-red)' : 'var(--lp-text-muted)',
                    borderRadius: 6,
                    padding:      '3px 8px',
                    fontSize:     10.5,
                    cursor:       canDelete ? 'pointer' : 'not-allowed',
                    fontFamily:   'inherit',
                    opacity:      canDelete ? 1 : 0.5
                  }}
                  onMouseEnter={e => {
                    if (canDelete) e.currentTarget.style.background = 'var(--sem-red-bg)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  🗑
                </button>
              </div>
            </div>
          )})}
        </div>
      )}

      {/* ── Template picker modal ───────────────────────────────────── */}
      <TemplatePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectTemplate}
        suggestedCategories={suggestedCategories}
        orgId={orgId}
      />
    </div>
  )
}
