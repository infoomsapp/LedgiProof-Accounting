// PATH: src/components/settings/SalesTaxSettingsCard.tsx
//
// "Charge sales tax on invoices" -- the switch QuickBooks calls "Turn on sales
// tax". When on, a new invoice (web and mobile) fills each line's tax from the
// client's state; clients marked tax-exempt are skipped. When off, nothing is
// added and tax is entered by hand, as before.

import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { getSalesTaxSettings, upsertSalesTaxSettings } from '../../services/sales-tax.service'
import { toSafeMessage } from '../../lib/errors'

interface Props {
  orgId:     string
  canEdit:   boolean
  onMessage?: (m: { type: 'ok' | 'err'; text: string }) => void
}

export default function SalesTaxSettingsCard({ orgId, canEdit, onMessage }: Props) {
  const { user } = useAuthStore()
  const [collects, setCollects] = useState<boolean | null>(null)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    let alive = true
    setCollects(null)
    getSalesTaxSettings(orgId)
      .then(s => { if (alive) setCollects(!!s?.collects_sales_tax) })
      .catch(e => { if (alive) { setCollects(false); onMessage?.({ type: 'err', text: toSafeMessage(e, 'Could not load the sales tax setting') }) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  async function toggle(next: boolean) {
    setSaving(true)
    try {
      await upsertSalesTaxSettings(orgId, { collects_sales_tax: next, ...(user?.id ? { updatedBy: user.id } : {}) })
      setCollects(next)
      onMessage?.({ type: 'ok', text: next ? 'Sales tax will be added to new invoices' : 'Sales tax will no longer be added automatically' })
    } catch (e) {
      onMessage?.({ type: 'err', text: toSafeMessage(e, 'Could not save the sales tax setting') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lp-card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>Sales tax on invoices</div>
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginTop: 4, lineHeight: 1.6, maxWidth: 380 }}>
            Turn this on if you charge sales tax. New invoices then fill the tax on each line from the client&apos;s
            state, so you never type a percentage. Clients marked tax-exempt are skipped. The state rate is a
            reference: check local taxes where they apply.
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, whiteSpace: 'nowrap',
                        cursor: canEdit && collects !== null && !saving ? 'pointer' : 'not-allowed' }}>
          <input
            type="checkbox"
            checked={!!collects}
            disabled={!canEdit || collects === null || saving}
            onChange={e => toggle(e.target.checked)}
          />
          {collects ? 'On' : 'Off'}
        </label>
      </div>
      {!canEdit && (
        <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 8 }}>
          Only the workspace owner or admin can change this.
        </div>
      )}
    </div>
  )
}
