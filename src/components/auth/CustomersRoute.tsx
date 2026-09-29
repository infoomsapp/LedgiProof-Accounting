// PATH: src/components/auth/CustomersRoute.tsx
//
// /customers -- the address book of a workspace that keeps its OWN books
// (solo, business, a professional's personal books): the people it invoices.
// A firm's clients are a different thing (books, portal) and live at /clients,
// so a firm workspace is sent there.

import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useOrgStore } from '../../store/org.store'
import SemaphoreSpinner from '../ui/SemaphoreSpinner'

export default function CustomersRoute({ children }: { children: ReactNode }) {
  const activeOrg = useOrgStore(s => s.activeOrg)
  if (!activeOrg) {
    return <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><SemaphoreSpinner size="md" inline /></div>
  }
  if (activeOrg.is_firm) return <Navigate to="/clients" replace />
  return <>{children}</>
}
