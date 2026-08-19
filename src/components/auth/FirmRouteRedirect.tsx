// PATH: src/components/auth/FirmRouteRedirect.tsx
//
// Client Switcher — Sprint 2 (Routing)
//
// Guard that wraps raw operational routes (/transactions, /invoices, etc).
//
// Behavior:
//   · SOLO owner / PYME owner / Bookkeeper-personal → renders children normally
//   · Bookkeeper FIRM (no client selected)          → redirects to /clients
//
// Per Decision 2 from architecture review:
//   "Solo Dashboard and /clients work without scope; the rest exigen cliente"
//
// This guard makes that policy enforceable at the routing layer.
//
// IMPORTANT: this is intentionally MORE permissive than RoleGuard.
// RoleGuard blocks based on user role; FirmRouteRedirect redirects
// based on scope context. The two compose: a route can have both.

import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScope }    from '../../hooks/useScope'
import SemaphoreSpinner from '../ui/SemaphoreSpinner'

interface Props {
  children: ReactNode
}

export default function FirmRouteRedirect({ children }: Props) {
  const scope    = useScope()
  const navigate = useNavigate()

  useEffect(() => {
    // Wait for auth + org to load before deciding
    if (!scope.isReady) return

    // Only bookkeeper firm context needs redirection
    if (scope.scopeMode !== 'firm-client') return

    // If they somehow got here with a clientId (shouldn't happen for
    // raw routes, but defensive), allow through
    if (scope.clientId) return

    // Bookkeeper firm without a client → bounce to /clients
    navigate('/clients', {
      replace: true,
      state: { reason: 'select-client' }
    })
  }, [scope.isReady, scope.scopeMode, scope.clientId, navigate])

  // While loading, show spinner (avoids flashing the wrong page)
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

  // If we're about to redirect, render nothing (prevents flash of content)
  if (scope.scopeMode === 'firm-client' && !scope.clientId) {
    return null
  }

  // Self mode (solo / pyme / personal): pass through
  return <>{children}</>
}