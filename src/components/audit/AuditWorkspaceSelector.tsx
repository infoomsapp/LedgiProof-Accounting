// PATH: src/components/audit/AuditWorkspaceSelector.tsx
// Workspace picker for auditors. Lists all orgs where current user has audit access.
// Visual style mirrors OrgSelector for consistency.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AuditorWorkspace } from '../../services/auditor.service'

interface Props {
  workspaces:    AuditorWorkspace[]
  selectedOrgId: string | null
  onSelect:      (orgId: string) => void
  loading?:      boolean
}

export default function AuditWorkspaceSelector({
  workspaces, selectedOrgId, onSelect, loading = false
}: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const clientCount = (n: number) =>
    n === 1 ? t('audit.clientCountOne', { count: n }) : t('audit.clientCountOther', { count: n })

  const selected = selectedOrgId
    ? workspaces.find(w => w.org_id === selectedOrgId)
    : null

  if (loading) {
    return (
      <div style={{
        padding: '8px 14px', borderRadius: 8,
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        fontSize: 12, color: '#64748b', fontStyle: 'italic',
        minWidth: 240
      }}>
        {t('audit.loadingWorkspaces')}
      </div>
    )
  }

  if (workspaces.length === 0) {
    return (
      <div style={{
        padding: '8px 14px', borderRadius: 8,
        background: 'rgba(239,68,68,0.06)',
        border: '0.5px solid rgba(239,68,68,0.25)',
        fontSize: 12, color: '#ef4444',
        minWidth: 240
      }}>
        {t('audit.noWorkspaces')}
      </div>
    )
  }

  // Single workspace: render as a non-interactive label
  if (workspaces.length === 1 && selected) {
    return (
      <div style={{
        padding: '8px 14px', borderRadius: 8,
        background: 'rgba(34,197,94,0.06)',
        border: '0.5px solid rgba(34,197,94,0.20)',
        display: 'flex', alignItems: 'center', gap: 10,
        minWidth: 240
      }}>
        <span style={{ fontSize: 14 }}>🏢</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, color: '#e2e8f0', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {selected.name}
          </div>
          <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
            {clientCount(selected.client_count)}
            {' · '}
            {t('audit.txCount30d', { count: selected.tx_count_30d })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: 8,
          background: 'var(--lp-surface)',
          border: `0.5px solid ${open ? 'rgba(34,197,94,0.40)' : 'var(--lp-border)'}`,
          color: '#e2e8f0',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 12.5,
          minWidth: 260,
          transition: 'border-color 0.12s'
        }}
      >
        <span style={{ fontSize: 14 }}>🏢</span>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 500, color: '#e2e8f0',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {selected?.name ?? t('audit.selectWorkspacePlaceholder')}
          </div>
          {selected && (
            <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 1 }}>
              {clientCount(selected.client_count)}
              {' · '}
              {t('audit.txCount30d', { count: selected.tx_count_30d })}
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, color: '#64748b' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          />

          {/* Dropdown */}
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            zIndex: 51, width: 320,
            background: '#0f172a',
            border: '0.5px solid var(--lp-border)',
            borderRadius: 10,
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden', maxHeight: 380
          }}>
            <div style={{
              padding: '8px 12px',
              borderBottom: '0.5px solid var(--lp-border)',
              fontSize: 10.5, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600
            }}>
              {workspaces.length === 1
                ? t('audit.workspacesAccessibleOne',   { count: workspaces.length })
                : t('audit.workspacesAccessibleOther', { count: workspaces.length })}
            </div>

            <div style={{ overflowY: 'auto', maxHeight: 330 }}>
              {workspaces.map(ws => {
                const active = ws.org_id === selectedOrgId
                return (
                  <button
                    key={ws.org_id}
                    onClick={() => { onSelect(ws.org_id); setOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', textAlign: 'left',
                      padding: '10px 12px',
                      background: active ? 'rgba(34,197,94,0.08)' : 'transparent',
                      borderLeft: active ? '2px solid #22c55e' : '2px solid transparent',
                      border: 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 0.12s'
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 13 }}>🏢</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, color: '#e2e8f0', fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>
                        {ws.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                        {clientCount(ws.client_count)}
                        {' · '}
                        {t('audit.txCount30d', { count: ws.tx_count_30d })}
                        {' · '}
                        <span style={{ color: '#a78bfa' }}>{t('audit.roleLabel', { role: ws.my_role })}</span>
                      </div>
                    </div>
                    {active && <span style={{ fontSize: 12, color: '#22c55e' }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}