// PATH: src/pages/portal/PortalOverview.tsx
//
// "How are my numbers being managed" — the client-facing view of their own
// Balance Sheet / P&L. Reuses Reports.tsx as-is via its clientIdOverride/
// entityNameOverride props (added this session specifically so it could be
// embedded outside the normal /clients/:clientId/reports route). Both RPCs
// it calls (get_balance_sheet, get_profit_and_loss) are authorized for a
// client_portal_users member for this exact client — nothing extra needed here.

import { useOutletContext } from 'react-router-dom'
import type { ClientPortalMembership } from '../../store/client-portal.store'
import { useAuthStore } from '../../store/auth.store'
import { useMileageSummary, useMileageEntries, useAddMileage } from '../../hooks/useMileage'
import MileageCard from '../../components/solo/MileageCard'
import Reports from '../Reports'

export default function PortalOverview() {
  const membership = useOutletContext<ClientPortalMembership>()
  const session = useAuthStore(s => s.session)
  // Mirrors the mobile/self-service split for who can log a trip -- a
  // client_viewer stays read-only everywhere else in the app, and mileage
  // is no different (RLS enforces this server-side too, this only avoids
  // showing a form that would just come back "unauthorized").
  const canLogMiles = membership.role !== 'client_viewer'

  const year          = new Date().getFullYear()
  const mileage        = useMileageSummary(membership.orgId, year, membership.clientId)
  const mileageEntries = useMileageEntries(membership.orgId, year, membership.clientId)
  const addMileage     = useAddMileage(membership.orgId, year, membership.clientId)

  return (
    <>
      <Reports
        orgIdOverride={membership.orgId}
        clientIdOverride={membership.clientId}
        entityNameOverride={membership.clientName}
      />

      {canLogMiles && (
        <div style={{ marginTop: 16 }}>
          <MileageCard
            totalMilesYTD={mileage.data?.totalMiles ?? 0}
            totalDeduction={mileage.data?.totalDeduction ?? 0}
            entries={mileageEntries.data ?? []}
            saving={addMileage.isPending}
            onAddMileage={async (entry) => {
              if (!session?.user?.id) return
              await addMileage.mutateAsync({
                orgId:    membership.orgId,
                clientId: membership.clientId,
                userId:   session.user.id,
                miles:    entry.miles,
                date:     entry.date,
                purpose:  entry.purpose || null,
              })
            }}
          />
        </div>
      )}
    </>
  )
}
