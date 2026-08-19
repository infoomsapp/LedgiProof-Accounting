// PATH: src/components/auth/RoleGuard.tsx
//
// Route-level access control. Wrap a route's element with this to ensure
// only allowed UserKinds can see it.
//
// Uses the existing useUserRole hook (which now exposes `loading` + `ready`).
//
// Usage:
//   <RoleGuard allowed={['bookkeeper_owner','bookkeeper_admin','bookkeeper_staff','super_admin']}>
//     <BookkeeperDashboard />
//   </RoleGuard>
//
// While loading → brand spinner (never renders children with undefined role).
// If not allowed → redirect to `redirectTo` (default /unauthorized).

import { Navigate } from 'react-router-dom'
import { useUserRole, type UserKind } from '../../hooks/useUserRole'
import SemaphoreSpinner from '../ui/SemaphoreSpinner'

interface RoleGuardProps {
  children:     React.ReactNode
  allowed:      UserKind[]
  /** Where to send unauthorized users. Default: /unauthorized */
  redirectTo?:  string
  /** Optional custom loading label */
  loadingLabel?: string
}

export default function RoleGuard({
  children,
  allowed,
  redirectTo = '/unauthorized',
  loadingLabel = 'Loading your workspace…'
}: RoleGuardProps) {
  const role = useUserRole()

  // Still resolving auth/profile — never render children with a half-loaded role
  if (role.loading) {
    return <SemaphoreSpinner label={loadingLabel} />
  }

  // Role resolved but not in the allowed set → redirect
  if (!allowed.includes(role.kind)) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}