// PATH: src/components/dashboard/MultiClientKanban.tsx
// Kanban view: clients grouped by workflow state (todo / in_review / reconciling / closed).
// Click a client → opens state menu (set manual or clear).
// Manual states show a 🔒 indicator with expiry tooltip.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useImpersonationStore } from '../../../../store/impersonation.store'
import { useNavigate } from 'react-router-dom'
import {
  setClientWorkflowState,
  clearClientWorkflowState,
  type KanbanClient,
  type WorkflowState
} from '../../../../services/bookkeeper-dashboard.service'
import { formatDate } from '../../../../lib/dates'
import Icon, { type IconName } from '../../../ui/Icon'

interface Props {
  clients:  KanbanClient[]
  onUpdate: () => void  // called after state change to refresh dashboard
}

type SemColor = 'amber' | 'red' | 'blue' | 'green'

// `labelKey` holds an i18n KEY (module scope can't call hooks) — every render
// site resolves it with t().
const COLUMNS: Array<{
  state:    WorkflowState
  labelKey: string
  icon:     IconName
  sem:      SemColor
}> = [
  { state: 'todo',        labelKey: 'dashboard.kanbanTodo',        icon: 'clipboardList', sem: 'amber' },
  { state: 'in_review',   labelKey: 'dashboard.kanbanInReview',    icon: 'search',        sem: 'red' },
  { state: 'reconciling', labelKey: 'dashboard.kanbanReconciling', icon: 'scale',         sem: 'blue' },
  { state: 'closed',      labelKey: 'dashboard.kanbanClosed',      icon: 'checklist',     sem: 'green' }
]

function semTint(sem: SemColor) {
  return {
    text:     `var(--sem-${sem})`,
    bg:       `var(--sem-${sem}-bg)`,
    bgStrong: `var(--sem-${sem}-bg-strong)`,
    border:   `var(--sem-${sem}-border)`
  }
}

export default function MultiClientKanban({ clients, onUpdate }: Props) {
  const { t } = useTranslation()
  const [menuFor, setMenuFor] = useState<string | null>(null)

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10
      }}>
        <div style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em'
        }}>
          {t('dashboard.clientWorkflow')}
          <span style={{
            textTransform: 'none', letterSpacing: 0,
            fontWeight: 400, color: 'var(--lp-text-muted)', marginLeft: 8
          }}>
            · {clients.length === 1
                ? t('dashboard.clientCountOne',   { count: clients.length })
                : t('dashboard.clientCountOther', { count: clients.length })}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)' }}>
          {t('dashboard.manualOverrideLegend')}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10
      }}>
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.state}
            column={col}
            clients={clients.filter(c => c.state === col.state)}
            onSelect={(id) => setMenuFor(id === menuFor ? null : id)}
            menuFor={menuFor}
            onUpdate={() => { setMenuFor(null); onUpdate() }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Column ──────────────────────────────────────────────────────────────────

function KanbanColumn({
  column, clients, onSelect, menuFor, onUpdate
}: {
  column:   { state: WorkflowState; labelKey: string; icon: IconName; sem: SemColor }
  clients:  KanbanClient[]
  onSelect: (clientId: string) => void
  menuFor:  string | null
  onUpdate: () => void
}) {
  const { t } = useTranslation()
  const tint = semTint(column.sem)
  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: `0.5px solid ${tint.border}`,
      borderRadius: 10,
      overflow: 'hidden',
      minHeight: 140
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: tint.bg,
        borderBottom: `0.5px solid ${tint.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: tint.text, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em'
        }}>
          <Icon name={column.icon} size={12} />
          {t(column.labelKey)}
        </span>
        <span style={{
          fontSize: 11, color: tint.text, fontWeight: 700,
          padding: '1px 7px', borderRadius: 100,
          background: tint.bgStrong,
          minWidth: 20, textAlign: 'center'
        }}>
          {clients.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{
        padding: clients.length > 0 ? 6 : 0,
        display: 'flex', flexDirection: 'column', gap: 4,
        maxHeight: 320, overflowY: 'auto'
      }}>
        {clients.length === 0 ? (
          <div style={{
            padding: '20px 12px', fontSize: 11, color: 'var(--lp-text-muted)',
            textAlign: 'center', fontStyle: 'italic'
          }}>
            {t('dashboard.kanbanEmpty')}
          </div>
        ) : clients.map(c => (
          <ClientCard
            key={c.client_id}
            client={c}
            sem={column.sem}
            menuOpen={menuFor === c.client_id}
            onSelect={() => onSelect(c.client_id)}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  )
}

// ── Card ────────────────────────────────────────────────────────────────────

function ClientCard({
  client, sem, menuOpen, onSelect, onUpdate
}: {
  client:   KanbanClient
  sem:      SemColor
  menuOpen: boolean
  onSelect: () => void
  onUpdate: () => void
}) {
  const { t } = useTranslation()
  const tint = semTint(sem)
  const enterAdminView = useImpersonationStore(s => s.enterAdminView)
  const navigate = useNavigate()

  function viewAsClient() {
    enterAdminView({
      targetClientId:   client.client_id,
      targetClientName: client.client_name
    })
    navigate('/client')
  }

  async function changeState(newState: WorkflowState) {
    try {
      await setClientWorkflowState(client.client_id, newState, 30)
      onUpdate()
    } catch (e: any) {
      alert(t('dashboard.couldNotUpdate', { message: e.message }))
    }
  }

  async function clearOverride() {
    try {
      await clearClientWorkflowState(client.client_id)
      onUpdate()
    } catch (e: any) {
      alert(t('dashboard.couldNotClear', { message: e.message }))
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onSelect}
        style={{
          width: '100%', textAlign: 'left',
          padding: '8px 10px', borderRadius: 7,
          background: menuOpen ? tint.bgStrong : 'var(--lp-surface-2)',
          border: menuOpen ? `0.5px solid ${tint.border}` : '0.5px solid var(--lp-border)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.12s'
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 6, marginBottom: 3
        }}>
          <span style={{
            fontSize: 12, color: 'var(--lp-text)', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            flex: 1
          }}>
            {client.client_name}
          </span>
          {client.is_manual && (
            <span
              title={client.expires_at
                ? t('dashboard.manualUntil', { date: formatDate(client.expires_at) })
                : t('dashboard.manualNoExpiry')}
              style={{ flexShrink: 0, display: 'flex', color: 'var(--lp-text-muted)' }}
            >
              <Icon name="lock" size={10} />
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
          {client.red_count > 0 && (
            <span style={{ color: 'var(--sem-red)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sem-red)' }} />
              {client.red_count}
            </span>
          )}
          {client.amber_count > 0 && (
            <span style={{ color: 'var(--sem-amber)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sem-amber)' }} />
              {client.amber_count}
            </span>
          )}
          {client.red_count === 0 && client.amber_count === 0 && (
            <span style={{ color: 'var(--lp-text-muted)' }}>{t('dashboard.clean')}</span>
          )}
          {client.last_activity && (
            <span style={{ color: 'var(--lp-text-muted)', marginLeft: 'auto' }}>
              {relTime(client.last_activity, t)}
            </span>
          )}
        </div>
      </button>

      {/* Action menu */}
      {menuOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          zIndex: 30,
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border-2)',
          borderRadius: 8,
          boxShadow: 'var(--lp-shadow-lg)',
          overflow: 'hidden'
        }}>
          <MenuItem
            icon="eye"
            label={t('dashboard.viewAsClient')}
            onClick={viewAsClient}
          />
          <Divider />
          <MenuLabel>{t('dashboard.moveTo')}</MenuLabel>
          {COLUMNS.filter(col => col.state !== client.state).map(col => (
            <MenuItem
              key={col.state}
              icon={col.icon}
              label={t(col.labelKey)}
              hint={t('dashboard.manual30d')}
              onClick={() => changeState(col.state)}
            />
          ))}
          {client.is_manual && (
            <>
              <Divider />
              <MenuItem
                icon="refresh"
                label={t('dashboard.clearOverride')}
                hint={t('dashboard.backToAuto')}
                onClick={clearOverride}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon, label, hint, onClick
}: {
  icon: IconName; label: string; hint?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', textAlign: 'left',
        padding: '7px 12px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 11.5, color: 'var(--lp-text)'
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--sem-blue-bg-strong)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <Icon name={icon} size={13} />
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <span style={{ fontSize: 10, color: 'var(--lp-text-muted)' }}>{hint}</span>}
    </button>
  )
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '5px 12px 2px',
      fontSize: 10, color: 'var(--lp-text-muted)', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.06em'
    }}>{children}</div>
  )
}

function Divider() {
  return <div style={{ height: 0.5, background: 'var(--lp-border)', margin: '2px 0' }} />
}

function relTime(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return t('dashboard.relNow')
  if (m < 60)  return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}