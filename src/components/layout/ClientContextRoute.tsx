// PATH: src/components/layout/ClientContextRoute.tsx
//
// Client Switcher — Sprint 1 (Foundation)
//
// Wrapper component for /clients/:clientId/* routes.
//
// Responsibilities:
//   1. Validate that the URL clientId resolves to a real client owned by
//      the current firm (via useScope which hits Supabase + RLS).
//   2. Show loading state during client hydration.
//   3. Render error state if client not found / no access.
//   4. Render the ClientScopeBanner + the route Outlet on success.
//
// Wire it like this in App.tsx:
//
//   <Route path="/clients/:clientId" element={<ClientContextRoute />}>
//     <Route path="transactions" element={<Transactions />} />
//     <Route path="invoices"     element={<Invoices />} />
//     ...
//   </Route>

import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect }           from 'react'
import { useScope }            from '../../hooks/useScope'
import ClientScopeBanner       from './ClientScopeBanner'
import SemaphoreSpinner        from '../ui/SemaphoreSpinner'

export default function ClientContextRoute() {
  const scope    = useScope()
  const navigate = useNavigate()

  // Defensive: if a non-firm user somehow lands on /clients/:id/*, kick out.
  useEffect(() => {
    if (scope.isReady && scope.scopeMode !== 'firm-client') {
      navigate('/', { replace: true })
    }
  }, [scope.isReady, scope.scopeMode, navigate])

  // Defensive: if firm user lands here WITHOUT a clientId in URL, send to list.
  useEffect(() => {
    if (scope.isReady && scope.scopeMode === 'firm-client' && !scope.clientId) {
      navigate('/clients', { replace: true })
    }
  }, [scope.isReady, scope.scopeMode, scope.clientId, navigate])

  // ── Loading ────────────────────────────────────────────────────────────
  if (!scope.isReady) {
    return (
      <div style={{
        flex:           1,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        48
      }}>
        <SemaphoreSpinner size="md" inline />
      </div>
    )
  }

  // ── Error: client not found ────────────────────────────────────────────
  if (scope.error || (scope.clientId && !scope.client)) {
    return (
      <div style={{
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        48,
        textAlign:      'center'
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
        <div style={{
          fontSize:     15,
          fontWeight:   600,
          color:        'var(--lp-text)',
          marginBottom: 6
        }}>
          Client not available
        </div>
        <div style={{
          fontSize:     12.5,
          color:        'var(--lp-text-muted)',
          marginBottom: 18,
          maxWidth:     420
        }}>
          {scope.error ?? 'This client could not be loaded. They may have been removed or you may no longer have access.'}
        </div>
        <button
          onClick={() => navigate('/clients')}
          style={{
            background:   'var(--lp-accent)',
            border:       'none',
            color:        '#fff',
            borderRadius: 8,
            padding:      '8px 16px',
            fontSize:     12.5,
            fontWeight:   600,
            cursor:       'pointer',
            fontFamily:   'inherit'
          }}
        >
          ← Back to client list
        </button>
      </div>
    )
  }

  // ── Happy path: render banner + nested route ───────────────────────────
  return (
    <div style={{
      flex:          1,
      display:       'flex',
      flexDirection: 'column',
      minHeight:     0
    }}>
      <ClientScopeBanner />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  )
}