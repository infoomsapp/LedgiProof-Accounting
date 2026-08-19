// PATH: src/hooks/useScope.ts
//
// Client Switcher — Sprint 1 (Foundation)
//
// Central hook that resolves the operational data scope for any page.
// This replaces the legacy pattern:
//
//   const { membership } = useAuthStore()
//   const orgId = membership?.org_id ?? ''
//
// with:
//
//   const scope = useScope()
//   if (!scope.isReady) return <Spinner />
//   const { orgId, clientId, client, scopeMode } = scope
//
// SCOPE MODES:
//
//   'self'         — solo owner, pyme owner, or bookkeeper-personal context.
//                    clientId is always null. Data is direct under org_id.
//
//   'firm-client'  — bookkeeper firm context.
//                    If URL has /clients/:clientId/*, clientId is set and
//                    validated. Otherwise clientId is null and the caller
//                    should redirect to /clients to pick one.
//
// IMPORTANT: this hook does NOT enforce redirects by itself. It surfaces
// the state via `requireClientOrRedirect()` which the page can call.
// This keeps the hook pure and testable.

import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { useOrgStore }  from '../store/org.store'
import { db }           from '../lib/supabase'
import type { Client }  from '../types/database.types'

export type ScopeMode = 'self' | 'firm-client'

export interface Scope {
  /** Always present once isReady=true. The owning organization. */
  orgId:       string

  /** Set only when scopeMode='firm-client' AND a clientId is in the URL. */
  clientId:    string | null

  /** Hydrated Client row, present when clientId is set. */
  client:      Client | null

  /** 'self' or 'firm-client' — derived from auth context, not URL. */
  scopeMode:   ScopeMode

  /** True once all data is loaded (org membership + client hydration if applicable). */
  isReady:     boolean

  /** Error message if client could not be hydrated (404, not in org, etc). */
  error:       string | null

  /**
   * Guard helper for firm-client pages that REQUIRE a clientId.
   * Call this in a useEffect; it redirects to /clients if no clientId.
   * Returns true if scope is valid for operational work, false if redirected.
   */
  requireClientOrRedirect: () => boolean
}

/**
 * Determine the scope mode purely from the auth context.
 * This is NOT URL-dependent — the URL only fills in WHICH client
 * when in firm-client mode.
 *
 * Uses the Organization flag model (is_personal / is_firm / is_client)
 * defined in v33+. Falls back to account_type when flags are absent
 * (orgs created before v33).
 */
function deriveScopeMode(
  accountType:    string | null | undefined,
  isPersonalOrg:  boolean,
  isFirmOrg:      boolean,
  isClientOrg:    boolean
): ScopeMode {
  // Bookkeeper acting on their personal org → 'self'
  if (isPersonalOrg) return 'self'

  // Client workspace (pyme/cliente own books) → 'self'
  if (isClientOrg) return 'self'

  // Firm workspace (bookkeeper managing many clients) → 'firm-client'
  if (isFirmOrg) return 'firm-client'

  // Fallback for orgs without flags (pre-v33): use account_type
  if (accountType === 'bookkeeper') return 'firm-client'

  // Default: self (solo owners, pyme owners, unknown)
  return 'self'
}

export function useScope(): Scope {
  const { membership, profile, loading: authLoading } = useAuthStore()
  const { activeOrg }                                 = useOrgStore()
  const params                                        = useParams<{ clientId?: string }>()
  const navigate                                      = useNavigate()
  const location                                      = useLocation()

  const orgId = membership?.org_id ?? activeOrg?.id ?? ''

  // ── Derive scope mode ───────────────────────────────────────────────────
  const scopeMode = useMemo<ScopeMode>(() => {
    const accountType  = (profile as any)?.account_type ?? null
    const isPersonalOrg = !!activeOrg?.is_personal
    const isFirmOrg     = !!activeOrg?.is_firm
    const isClientOrg   = !!activeOrg?.is_client
    return deriveScopeMode(accountType, isPersonalOrg, isFirmOrg, isClientOrg)
  }, [profile, activeOrg])

  // ── Determine effective clientId ────────────────────────────────────────
  const urlClientId  = params.clientId ?? null
  const effectiveClientId = scopeMode === 'firm-client' ? urlClientId : null

  // ── Hydrate client if needed ────────────────────────────────────────────
  const [client,        setClient]        = useState<Client | null>(null)
  const [clientLoading, setClientLoading] = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    // Only hydrate in firm-client mode with a real clientId
    if (scopeMode !== 'firm-client' || !effectiveClientId || !orgId) {
      setClient(null)
      setError(null)
      return
    }

    // Already hydrated for this clientId? skip
    if (client?.id === effectiveClientId) return

    setClientLoading(true)
    setError(null)

    // 🐛 Real bug fixed: the Postgrest query builder is a `PromiseLike`, not
    // a full `Promise` — it only implements `.then()`, so chaining `.finally()`
    // straight off it doesn't type-check (and would break at runtime the
    // moment `.then()`'s return value stopped being a real Promise on some
    // supabase-js version). Wrapping in `Promise.resolve()` gets a real
    // Promise back so try/finally works reliably.
    Promise.resolve(
      db
        .from('clients')
        .select('*')
        .eq('id', effectiveClientId)
        .eq('org_id', orgId)   // belt-and-suspenders; RLS also enforces
        .maybeSingle()
    )
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) {
          setError(err.message)
          setClient(null)
        } else if (!data) {
          setError('Client not found or you do not have access')
          setClient(null)
        } else {
          setClient(data as Client)
          setError(null)
        }
      })
      .finally(() => {
        if (alive) setClientLoading(false)
      })

    return () => { alive = false }
    // We intentionally exclude `client` from deps to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMode, effectiveClientId, orgId])

  // ── isReady ─────────────────────────────────────────────────────────────
  const isReady = !authLoading && (
    scopeMode === 'self'
      ? !!orgId
      : (
          // firm-client: ready when no clientId in URL (caller will redirect)
          // OR when we have client hydrated / errored
          !effectiveClientId || !clientLoading
        )
  )

  // ── Guard helper ────────────────────────────────────────────────────────
  function requireClientOrRedirect(): boolean {
    if (scopeMode !== 'firm-client') return true   // self-mode always OK
    if (effectiveClientId)             return true   // has client OK
    // No client — redirect to /clients, preserving the page they wanted
    const target = location.pathname.split('/').pop() ?? ''
    navigate('/clients', {
      replace: true,
      state: { redirectFrom: target, reason: 'select-client' }
    })
    return false
  }

  return {
    orgId,
    clientId:  effectiveClientId,
    client,
    scopeMode,
    isReady,
    error,
    requireClientOrRedirect
  }
}
