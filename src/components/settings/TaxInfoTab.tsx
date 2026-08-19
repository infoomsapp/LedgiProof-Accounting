// PATH: src/components/settings/TaxInfoTab.tsx

import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { useOrgStore }  from '../../store/org.store'
import Button           from '../ui/Button'
import {
  updateOrgTaxInfo,
  US_STATES,
  BUSINESS_TYPES,
  type OrgTaxInfo
} from '../../services/settings.service'
import { useUserRole } from '../../hooks/useUserRole'

interface Props {
  onMessage?: (msg: { type: 'ok' | 'err'; text: string }) => void
}

export default function TaxInfoTab({ onMessage }: Props) {
  const { profile } = useAuthStore()
  const { activeOrg, loadOrgs } = useOrgStore()
  const role = useUserRole()

  const [tax, setTax] = useState<OrgTaxInfo>({
    state_code: null, ein: null, business_type: null,
    principal_business: null, business_code: null
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!activeOrg) return
    setTax({
      state_code:         (activeOrg as any).state_code         ?? null,
      ein:                (activeOrg as any).ein                ?? null,
      business_type:      (activeOrg as any).business_type      ?? null,
      principal_business: (activeOrg as any).principal_business ?? null,
      business_code:      (activeOrg as any).business_code      ?? null
    })
  }, [activeOrg])

  async function save() {
    if (!activeOrg?.id) return
    if (!role.canEditTaxInfo) {
      onMessage?.({ type: 'err', text: 'Only the workspace owner can update tax information' })
      return
    }
    setSaving(true)
    try {
      await updateOrgTaxInfo(activeOrg.id, tax)
      onMessage?.({ type: 'ok', text: 'Tax information saved' })
      if (profile?.id) await loadOrgs(profile.id)
    } catch (e: any) {
      onMessage?.({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const readOnly = !role.canEditTaxInfo

  return (
    <div style={{ maxWidth: 540 }}>
      <div className="lp-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
            Tax information
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 4 }}>
            Used for Schedule C export, quarterly tax estimates, and CPA-ready reports.
          </div>
        </div>

        {readOnly && (
          <div style={{
            padding: '9px 12px', borderRadius: 7, fontSize: 12.5,
            color: '#fbbf24', background: 'rgba(251,191,36,0.08)',
            border: '0.5px solid rgba(251,191,36,0.25)'
          }}>
            👁️ Read-only — only the workspace owner can edit tax information.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>State (where you file)</label>
            <select
              className="lp-input"
              value={tax.state_code ?? ''}
              onChange={e => setTax(t => ({ ...t, state_code: e.target.value || null }))}
              disabled={readOnly}
              style={readOnly ? disabledStyle : undefined}
            >
              <option value="">— Select —</option>
              {US_STATES.map(s => (
                <option key={s.code} value={s.code}>{s.code} · {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>EIN (optional)</label>
            <input
              className="lp-input"
              value={tax.ein ?? ''}
              onChange={e => setTax(t => ({ ...t, ein: e.target.value || null }))}
              placeholder="12-3456789"
              disabled={readOnly}
              style={readOnly ? disabledStyle : undefined}
            />
            <div style={{ fontSize: 10.5, color: '#475569', marginTop: 3 }}>
              Format: XX-XXXXXXX (skip if using SSN as sole proprietor)
            </div>
          </div>
        </div>

        <div>
          <label style={lbl}>Business type</label>
          <select
            className="lp-input"
            value={tax.business_type ?? ''}
            onChange={e => setTax(t => ({ ...t, business_type: e.target.value || null }))}
            disabled={readOnly}
            style={readOnly ? disabledStyle : undefined}
          >
            <option value="">— Select —</option>
            {BUSINESS_TYPES.map(b => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={lbl}>Principal business activity (Schedule C — Line A)</label>
          <input
            className="lp-input"
            value={tax.principal_business ?? ''}
            onChange={e => setTax(t => ({ ...t, principal_business: e.target.value || null }))}
            placeholder="e.g. Consulting services, Mobile food sales"
            disabled={readOnly}
            style={readOnly ? disabledStyle : undefined}
          />
        </div>

        <div>
          <label style={lbl}>IRS Business code (Schedule C — Line B)</label>
          <input
            className="lp-input"
            value={tax.business_code ?? ''}
            onChange={e => setTax(t => ({ ...t, business_code: e.target.value || null }))}
            placeholder="6 digits — e.g. 541510"
            disabled={readOnly}
            style={readOnly ? disabledStyle : undefined}
          />
          <div style={{ fontSize: 10.5, color: '#475569', marginTop: 3 }}>
            See IRS Schedule C instructions for the 6-digit code matching your business.
          </div>
        </div>

        {!readOnly && (
          <Button variant="primary" loading={saving} onClick={save}>
            Save tax information
          </Button>
        )}
      </div>

      <div className="lp-card" style={{
        marginTop: 12,
        borderColor: 'rgba(59,130,246,0.2)',
        background: 'rgba(59,130,246,0.04)'
      }}>
        <div style={{ fontSize: 12, color: '#93c5fd', lineHeight: 1.7, fontWeight: 500 }}>
          💡 Why this matters
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 6, lineHeight: 1.6 }}>
          These fields populate your Schedule C export and unlock the quarterly
          tax estimator. State code is used for state-specific tax rules.
          None of this is shared with third parties.
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = {
  fontSize: 12, color: 'var(--lp-text-muted)',
  display: 'block', marginBottom: 5
}

const disabledStyle: React.CSSProperties = {
  opacity: 0.65, cursor: 'not-allowed'
}