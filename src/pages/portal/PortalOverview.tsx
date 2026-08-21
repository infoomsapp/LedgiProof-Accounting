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
import Reports from '../Reports'

export default function PortalOverview() {
  const membership = useOutletContext<ClientPortalMembership>()

  return (
    <Reports
      orgIdOverride={membership.orgId}
      clientIdOverride={membership.clientId}
      entityNameOverride={membership.clientName}
    />
  )
}
