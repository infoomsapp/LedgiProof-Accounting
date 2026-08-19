// PATH: src/pages/ReadOnlyDashboard.tsx
//
// Auditor dashboard (system_role = 'auditor').
// Read-only view of a chosen workspace's transactions + summary.
//
// Layout:
//   - Header: greeting + auditor badge + workspace selector + Export CSV
//   - Summary section: period + integrity + 4 KPIs + status breakdown
//   - AuditFilters
//   - AuditTransactionsTable (cursor pagination)

import { useAuthStore }            from '../store/auth.store'
import { useAuditorView }          from '../hooks/useAuditorView'

import AuditWorkspaceSelector      from '../components/audit/AuditWorkspaceSelector'
import AuditFilters                from '../components/audit/AuditFilters'
import AuditTransactionsTable      from '../components/audit/AuditTransactionsTable'
import { formatCurrency } from '../lib/currency'

const fmtCur = (n: number, ccy = 'USD') => formatCurrency(n, ccy, { maximumFractionDigits: 0 })

const SEM_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  blue:  { label: 'Verified',     color: '#3b82f6', emoji: '🔵' },
  green: { label: 'Reconciled',   color: '#22c55e', emoji: '🟢' },
  amber: { label: 'Needs review', color: '#f59e0b', emoji: '🟡' },
  red:   { label: 'Urgent',       color: '#ef4444', emoji: '🔴' }
}

export default function ReadOnlyDashboard() {
  const { profile } = useAuthStore()
  const view = useAuditorView()

  const firstName = profile?.display_name?.split(' ')[0]
    ?? profile?.email?.split('@')[0]
    ?? 'there'

  const selectedWorkspace = view.workspaces.find(w => w.org_id === view.selectedOrgId)

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, marginBottom: 22, flexWrap: 'wrap'
      }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: 'var(--lp-text)',
            letterSpacing: '-0.01em', margin: 0,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
          }}>
            <span>Audit view, {firstName}</span>
            <span style={{
              fontSize: 10.5, padding: '3px 10px', borderRadius: 100,
              background: 'rgba(34,197,94,0.10)',
              border: '0.5px solid rgba(34,197,94,0.35)',
              color: '#22c55e', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.07em',
              display: 'inline-flex', alignItems: 'center', gap: 5
            }}>
              🟢 Auditor access · Read-only
            </span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--lp-text-muted)', marginTop: 6 }}>
            You can view and export records. You cannot edit transactions or post changes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <AuditWorkspaceSelector
            workspaces={view.workspaces}
            selectedOrgId={view.selectedOrgId}
            onSelect={view.selectOrg}
            loading={view.workspacesLoading}
          />

          <button
            onClick={view.exportCsv}
            disabled={!view.selectedOrgId || view.exporting}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: view.selectedOrgId
                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                : 'rgba(255,255,255,0.04)',
              border: 'none',
              color: view.selectedOrgId ? '#0f172a' : '#475569',
              fontSize: 12.5, fontWeight: 600,
              cursor: view.selectedOrgId && !view.exporting ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            {view.exporting ? '⏳ Exporting…' : '⬇ Export CSV'}
          </button>
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {view.error && (
        <div style={{
          padding: '11px 14px',
          background: 'rgba(239,68,68,0.08)',
          border: '0.5px solid rgba(239,68,68,0.3)',
          borderRadius: 10,
          color: '#ef4444', fontSize: 12.5,
          marginBottom: 16
        }}>
          ⚠ {view.error}
        </div>
      )}

      {/* ── Empty: no workspace selected ──────────────────────────────────── */}
      {!view.selectedOrgId && !view.workspacesLoading && (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border)',
          borderRadius: 11
        }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.4 }}>🏢</div>
          <div style={{ fontSize: 14, color: '#cbd5e1', fontWeight: 500, marginBottom: 6 }}>
            {view.workspaces.length === 0
              ? 'No workspaces accessible'
              : 'Select a workspace to begin'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {view.workspaces.length === 0
              ? 'Your account does not have audit access to any workspace yet.'
              : 'Choose a firm from the dropdown above to load its audit data.'}
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      {view.selectedOrgId && (
        <>
          {/* Summary card */}
          {view.summaryLoading && !view.summary ? (
            <div style={{
              padding: 24, textAlign: 'center',
              background: 'var(--lp-surface)',
              border: '0.5px solid var(--lp-border)',
              borderRadius: 11,
              marginBottom: 14,
              color: '#64748b', fontSize: 12.5, fontStyle: 'italic'
            }}>
              Loading summary…
            </div>
          ) : view.summary ? (
            <SummarySection
              summary={view.summary}
              {...(selectedWorkspace?.name ? { workspaceName: selectedWorkspace.name } : {})}
            />
          ) : null}

          {/* Filters */}
          <AuditFilters
            value={view.filters}
            onChange={view.setFilters}
            onReset={view.resetFilters}
            loading={view.txLoading}
          />

          {/* Transactions table */}
          <AuditTransactionsTable
            transactions={view.transactions}
            loading={view.txLoading}
            loadingMore={view.txLoadingMore}
            hasMore={view.hasMore}
            onLoadMore={view.loadMore}
          />
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY SECTION
// ─────────────────────────────────────────────────────────────────────────────

function SummarySection({ summary, workspaceName }: {
  summary: import('../services/auditor.service').AuditSummary
  workspaceName?: string
}) {
  const t = summary.totals
  const breakdown = summary.by_status
  const totalCount = Object.values(breakdown).reduce((sum, n) => sum + n, 0)

  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: '0.5px solid var(--lp-border)',
      borderRadius: 11,
      padding: 18,
      marginBottom: 14
    }}>

      {/* Period + integrity */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10, marginBottom: 14
      }}>
        <div>
          <div style={{
            fontSize: 11, color: 'var(--lp-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
            marginBottom: 3
          }}>
            Summary {workspaceName && `· ${workspaceName}`}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
            {summary.period.from} → {summary.period.to}
          </div>
        </div>

        {/* Workspace integrity indicator (neutral language) */}
        {summary.integrity?.workspace_integrity && (
          <span style={{
            fontSize: 11, padding: '5px 12px', borderRadius: 100,
            background: 'rgba(34,197,94,0.10)',
            border: '0.5px solid rgba(34,197,94,0.30)',
            color: '#22c55e', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 5
          }}>
            ✓ Workspace integrity verified
          </span>
        )}
      </div>

      {/* 4 KPI cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10, marginBottom: 16
      }}>
        <Kpi
          label="Income"
          value={fmtCur(t.income)}
          color="#22c55e"
          icon="📥"
        />
        <Kpi
          label="Expenses"
          value={fmtCur(t.expenses)}
          color="#f87171"
          icon="📤"
        />
        <Kpi
          label="Net profit"
          value={fmtCur(t.net_profit)}
          color={t.net_profit >= 0 ? '#22c55e' : '#ef4444'}
          icon="💹"
        />
        <Kpi
          label="Transactions"
          value={t.transactions_count.toLocaleString()}
          color="#3b82f6"
          icon="📋"
          monospace
        />
      </div>

      {/* Status breakdown chips */}
      {totalCount > 0 && (
        <div>
          <div style={{
            fontSize: 10, color: '#64748b', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6
          }}>
            Status breakdown
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(breakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => {
                const cfg = SEM_LABELS[key] ?? {
                  label: key, color: 'var(--lp-text-muted)', emoji: '•'
                }
                const pct = totalCount > 0
                  ? Math.round((count / totalCount) * 100)
                  : 0
                return (
                  <span key={key} style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 100,
                    background: `${cfg.color}10`,
                    border: `0.5px solid ${cfg.color}30`,
                    color: cfg.color, fontWeight: 500,
                    display: 'inline-flex', alignItems: 'center', gap: 6
                  }}>
                    {cfg.emoji} {cfg.label} · {count}
                    <span style={{ color: `${cfg.color}99`, fontWeight: 400, fontSize: 10 }}>
                      ({pct}%)
                    </span>
                  </span>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Kpi({
  label, value, color, icon, monospace = false
}: {
  label: string; value: string; color: string; icon: string; monospace?: boolean
}) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 9,
      background: 'rgba(255,255,255,0.02)',
      border: '0.5px solid var(--lp-border)'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 5
      }}>
        <span style={{
          fontSize: 10.5, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em'
        }}>
          {label}
        </span>
        <span style={{ fontSize: 13 }}>{icon}</span>
      </div>
      <div style={{
        fontSize: 20, fontWeight: 700, color,
        fontFamily: monospace ? 'monospace' : 'inherit',
        letterSpacing: '-0.02em', lineHeight: 1.1
      }}>
        {value}
      </div>
    </div>
  )
}
