// PATH: src/components/settings/WorkspaceTab.tsx

import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { useOrgStore }  from '../../store/org.store'
import { db }           from '../../lib/supabase'
import Button           from '../ui/Button'
import { useUserRole, USER_KIND_LABELS } from '../../hooks/useUserRole'
import { toSafeMessage } from '../../lib/errors'
import SalesTaxSettingsCard from './SalesTaxSettingsCard'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'ARS', 'COP']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

interface Props {
  onMessage?: (msg: { type: 'ok' | 'err'; text: string }) => void
}

export default function WorkspaceTab({ onMessage }: Props) {
  const { profile, signOut } = useAuthStore()
  const { activeOrg, loadOrgs } = useOrgStore()
  const role = useUserRole()

  const [orgName,   setOrgName]   = useState(activeOrg?.name ?? '')
  const [currency,  setCurrency]  = useState(activeOrg?.currency ?? 'USD')
  const [fyStart,   setFyStart]   = useState(activeOrg?.fiscal_year_start ?? 1)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    setOrgName(activeOrg?.name ?? '')
    setCurrency(activeOrg?.currency ?? 'USD')
    setFyStart(activeOrg?.fiscal_year_start ?? 1)
  }, [activeOrg])

  async function save() {
    if (!activeOrg?.id) return
    if (!role.canEditWorkspace) {
      onMessage?.({ type: 'err', text: 'You do not have permission to edit workspace settings' })
      return
    }
    setSaving(true)
    const { error } = await db.from('organizations').update({
      name: orgName.trim(),
      currency,
      fiscal_year_start: fyStart
    }).eq('id', activeOrg.id)

    if (error) {
      onMessage?.({ type: 'err', text: toSafeMessage(error, 'Could not save workspace settings') })
    } else {
      onMessage?.({ type: 'ok', text: 'Workspace settings saved' })
      if (profile?.id) await loadOrgs(profile.id)
    }
    setSaving(false)
  }

  // Title varies by role
  const workspaceLabel =
    role.kind === 'solo_owner'      ? 'My business' :
    role.kind === 'pyme_owner'      ? 'My company'  :
    role.kind === 'pyme_staff'      ? 'My company'  :
    role.kind === 'bookkeeper_owner' ||
    role.kind === 'bookkeeper_admin' ||
    role.kind === 'bookkeeper_staff' ? 'My firm' :
    'Workspace'

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="lp-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
            {workspaceLabel}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 3 }}>
            Your role here: <strong>{USER_KIND_LABELS[role.kind]}</strong>
            {role.workspaceRole && (
              <span style={{ marginLeft: 5, color: '#64748b' }}>
                ({role.workspaceRole})
              </span>
            )}
          </div>
        </div>

        {!role.canEditWorkspace && (
          <div style={{
            padding: '9px 12px', borderRadius: 7, fontSize: 12.5,
            color: '#fbbf24', background: 'rgba(251,191,36,0.08)',
            border: '0.5px solid rgba(251,191,36,0.25)'
          }}>
            👁️ Read-only — only the workspace owner or admin can modify these settings.
          </div>
        )}

        <div>
          <label style={lbl}>Workspace name</label>
          <input
            className="lp-input"
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            disabled={!role.canEditWorkspace}
            style={!role.canEditWorkspace ? disabledStyle : undefined}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Base currency</label>
            <select
              className="lp-input"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              disabled={!role.canEditWorkspace}
              style={!role.canEditWorkspace ? disabledStyle : undefined}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Fiscal year starts</label>
            <select
              className="lp-input"
              value={fyStart}
              onChange={e => setFyStart(Number(e.target.value))}
              disabled={!role.canEditWorkspace}
              style={!role.canEditWorkspace ? disabledStyle : undefined}
            >
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>

        {activeOrg && (
          <div style={{
            padding: '8px 12px', borderRadius: 7,
            background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid var(--lp-border)'
          }}>
            <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginBottom: 3 }}>
              Workspace ID
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#475569' }}>
              {activeOrg.id}
            </div>
          </div>
        )}

        {role.canEditWorkspace && (
          <Button
            variant="primary"
            loading={saving}
            disabled={!orgName.trim()}
            onClick={save}
          >
            Save workspace settings
          </Button>
        )}
      </div>

      {activeOrg?.id && (
        <SalesTaxSettingsCard orgId={activeOrg.id} canEdit={role.canEditWorkspace} {...(onMessage ? { onMessage } : {})} />
      )}

      <div className="lp-card" style={{ marginTop: 16, borderColor: 'rgba(239,68,68,0.2)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 12 }}>
          Danger zone
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)',
                      marginBottom: 12, lineHeight: 1.6 }}>
          Signing out will end your current session. All local data will be cleared.
        </div>
        <Button
          variant="ghost"
          onClick={signOut}
          style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}
        >
          Sign out
        </Button>
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