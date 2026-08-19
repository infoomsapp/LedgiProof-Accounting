// PATH: src/hooks/useOrgCurrency.ts
// Returns the active org's configured display currency (default 'USD').

import { useOrgStore } from '../store/org.store'

export function useOrgCurrency(): string {
  return useOrgStore(s => s.activeOrg?.currency ?? 'USD')
}
