// PATH: src/pages/BookkeeperDashboard.tsx
//
// REFACTORED — Firm dashboard correctness sprint (2026-07-25):
//   · Constitution fix: NO UI aggregation. Removed the full firm-wide
//     transaction pull (useTransactions) + getInvoiceSummary. Every KPI now
//     comes pre-computed from get_bookkeeper_dashboard (financial_kpis +
//     semaphore_counts).
//   · CBAC: raw system_role check replaced with a useUserRole flag.
//   · Dedup: attention / activity / pending-docs builders moved to
//     lib/firm-dashboard-helpers (shared with AccountantDashboard).
//
// Layout: DashboardLayout (70/30 grid) — unchanged.

import { useNavigate }              from 'react-router-dom'
import { ClipboardList, AlertTriangle, AlertOctagon, FileText } from 'lucide-react'
import { staggerStyle }              from '../lib/motion'
import { useAuthStore }             from '../store/auth.store'
import { useUserRole }              from '../hooks/useUserRole'
import { useOrgActivityFeed }       from '../hooks/useAuditEvents'
import { formatDateHeadline }       from '../lib/dates'

// Firm-wide dashboard data (single RPC — no raw transaction pull)
import { useBookkeeperDashboard } from '../hooks/useBookkeeperDashboard'
import TrialBannerInline          from '../components/dashboard/v2/bookkeeper/TrialBannerInline'
import LpAddMenu                  from '../components/clients/LpAddMenu'
import MultiClientKanban          from '../components/dashboard/v2/bookkeeper/MultiClientKanban'
import ClientsWithIssuesPanel     from '../components/dashboard/v2/bookkeeper/ClientsWithIssuesPanel'
import CertifyChip                from '../components/dashboard/v2/bookkeeper/CertifyChip'

// V2 dashboard shared components
import DashboardLayout            from '../components/dashboard/v2/shared/DashboardLayout'
import SectionCard                from '../components/dashboard/v2/shared/SectionCard'
import SemaphoreDonut             from '../components/dashboard/v2/shared/SemaphoreDonut'
import CriticalAlertBanner        from '../components/dashboard/v2/shared/CriticalAlertBanner'
import AttentionGrid              from '../components/dashboard/v2/shared/AttentionGrid'
import PendingDocsCard            from '../components/dashboard/v2/shared/PendingDocsCard'
import ActivitySidebar            from '../components/dashboard/v2/shared/ActivitySidebar'
import FirmHealthKpis             from '../components/dashboard/v2/shared/FirmHealthKpis'
import OperationalKpis            from '../components/dashboard/v2/shared/OperationalKpis'
import FirmInsightsPanel          from '../components/dashboard/v2/shared/FirmInsightsPanel'
import OnboardingHint             from '../components/dashboard/v2/shared/OnboardingHint'

// Shared, deduplicated builders
import {
  buildAttentionItems, criticalCount, buildPendingDocItems,
  buildActivityItems, firmHealthProps
} from '../lib/firm-dashboard-helpers'
import { useFirmInsights }     from '../hooks/useFirmInsights'
import { useOrgCurrency }      from '../hooks/useOrgCurrency'
import { useOnboardingHints }  from '../hooks/useOnboardingHints'

export default function BookkeeperDashboard() {
  const navigate = useNavigate()
  const { membership, profile } = useAuthStore()
  const orgId                   = membership?.org_id ?? ''
  const role                    = useUserRole()

  // CBAC: firm KPIs are shown for firm workspaces (or super_admin View As),
  // never gated on a raw system_role string.
  const showFirmKpis = role.isBookkeeperFirm || role.isAccountantFirm || role.isSuperAdmin
  // resolve-transaction allows certify for firm owner/admin regardless of
  // firm type — matches the WRITE_ROLES check in the Edge Function itself.
  const canCertify = role.isWorkspaceOwner || role.isWorkspaceAdmin || role.isSuperAdmin

  const bk = useBookkeeperDashboard(orgId, showFirmKpis)
  const insights   = useFirmInsights(orgId, showFirmKpis)
  const orgCurrency = useOrgCurrency()
  const { data: events = [] } = useOrgActivityFeed(orgId, 12)

  const now = new Date()

  // All derived state comes from the RPC DTO via shared helpers.
  const attentionItems  = buildAttentionItems(bk.data, navigate)
  const critical        = criticalCount(attentionItems)
  const pendingDocItems = buildPendingDocItems(bk.data, orgCurrency)
  const activityItems   = buildActivityItems(events)
  const sem             = bk.data?.semaphore_counts
  const onboarding      = useOnboardingHints('bookkeeper_dashboard')

  return (
    <DashboardLayout
      headerSlot={
        <>
          <TrialBannerInline />

          {onboarding.shouldShow && canCertify && orgId && (
            <OnboardingHint
              title="Certify"
              message="Certify simple transactions yourself, right from the header — no need to wait on your accountant to close them out."
              onDismiss={onboarding.dismissAll}
            />
          )}

          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap'
          }}>
            <div>
              <h1 style={{
                fontSize: 22, fontWeight: 600,
                color: 'var(--lp-text)', letterSpacing: '-0.01em', margin: 0
              }}>
                Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'},
                {' '}{profile?.display_name?.split(' ')[0] ?? 'there'} <span style={{ opacity: 0.5 }}>👋</span>
              </h1>
              <p style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 4, margin: 0 }}>
                {formatDateHeadline(now)}
                {' · '}
                <span style={{ color: 'var(--sem-amber)', fontWeight: 600 }}>Bookkeeping Practice</span>
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {canCertify && orgId && <CertifyChip orgId={orgId} onCertified={() => bk.refresh()} />}
              <LpAddMenu orgId={orgId} onClientCreated={() => bk.refresh()} />
            </div>
          </div>
        </>
      }

      alertSlot={
        <CriticalAlertBanner
          count={critical}
          severity="critical"
          label={critical === 1 ? 'critical item' : 'critical items'}
          sub="need your attention today"
          onView={() => navigate('/clients')}
        />
      }

      mainSlot={
        <>
          {/* ── Row 1: Financial Health + Operational Health ─────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
            gap: 12, marginBottom: 14,
            ...staggerStyle(0)
          }}>
            <FirmHealthKpis
              {...firmHealthProps(bk.data?.financial_kpis)}
              currency={orgCurrency}
              onClickOutstanding={() => navigate('/invoices')}
              rightSlot={
                <SemaphoreDonut
                  counts={{ blue: sem?.blue ?? 0, green: sem?.green ?? 0, amber: sem?.amber ?? 0, red: sem?.red ?? 0 }}
                  size={104}
                  thickness={13}
                />
              }
            />

            {bk.data && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {onboarding.shouldShow && (
                  <OnboardingHint
                    title="Today's Workflow"
                    message="Your daily queue, at a glance — active clients, what's pending review, and what's still unreconciled."
                    onDismiss={onboarding.dismissAll}
                  />
                )}
                <OperationalKpis
                  title="Today's Workflow"
                  activeClients={bk.data.kpis.active_clients}
                  pendingAmber={bk.data.kpis.pending_amber}
                  pendingRed={bk.data.kpis.pending_red}
                  unreconciled={bk.data.kpis.unreconciled}
                  onClickClients={() => navigate('/clients')}
                  onClickPending={() => navigate('/clients')}
                  onClickUnreconciled={() => navigate('/clients')}
                />
              </div>
            )}
          </div>

          {/* ── Insights (QB parity: AR aging · cash flow · anomalies · P&L) ─ */}
          <div style={staggerStyle(1)}>
            <FirmInsightsPanel data={insights.data} loading={insights.loading} onNavigate={navigate} currency={orgCurrency} />
          </div>

          {/* ── Row 2: Multi-Client Workflow (Kanban) ──────────────────── */}
          {bk.data && bk.data.kanban.length > 0 && (
            <>
              {onboarding.shouldShow && (
                <OnboardingHint
                  title="Multi-Client Workflow"
                  message="Every client, grouped by where they are in your process. Click a card to move it — or lock it manually if it needs to stay put."
                  onDismiss={onboarding.dismissAll}
                />
              )}
              <SectionCard
                title="Multi-Client Workflow"
                icon={ClipboardList}
                accentColor="var(--sem-cyan)"
                accentBg="var(--sem-cyan-bg)"
                right={
                  <span style={{ fontSize: 10, color: 'var(--lp-text-muted)' }}>
                    {bk.data.kanban.length} {bk.data.kanban.length === 1 ? 'client' : 'clients'} across 5 stages
                  </span>
                }
                style={{ marginBottom: 14, ...staggerStyle(2) }}
              >
                <MultiClientKanban clients={bk.data.kanban} onUpdate={bk.refresh} />
              </SectionCard>
            </>
          )}

          {/* ── Row 3: Attention Required ──────────────────────────────── */}
          {attentionItems.length > 0 && (
            <SectionCard
              title="Attention Required"
              icon={AlertTriangle}
              accentColor="var(--sem-amber)"
              accentBg="var(--sem-amber-bg)"
              right={
                <button className="lp-btn-outline" onClick={() => navigate('/clients')}>
                  View all →
                </button>
              }
              style={{ marginBottom: 14, ...staggerStyle(3) }}
            >
              <AttentionGrid
                items={attentionItems}
                columns={Math.min(4, Math.max(2, attentionItems.length))}
              />
            </SectionCard>
          )}

          {/* ── Row 4: Clients with Issues ─────────────────────────────── */}
          {bk.data && bk.data.clients_with_issues.length > 0 && (
            <SectionCard
              title="Clients with Issues"
              icon={AlertOctagon}
              accentColor="var(--sem-red)"
              accentBg="var(--sem-red-bg)"
              right={
                <span style={{ fontSize: 10, color: 'var(--lp-text-muted)' }}>
                  {bk.data.clients_with_issues.length} {bk.data.clients_with_issues.length === 1 ? 'client' : 'clients'}
                </span>
              }
              style={staggerStyle(4)}
            >
              <ClientsWithIssuesPanel clients={bk.data.clients_with_issues} />
            </SectionCard>
          )}
        </>
      }

      sidebarSlot={
        <>
          {orgId && (
            <>
              {onboarding.shouldShow && (
                <OnboardingHint
                  title="Pending Documents"
                  message="Receipts and statements your clients still owe you — attach them here as they come in."
                  onDismiss={onboarding.dismissAll}
                />
              )}
              <SectionCard title="Pending Documents" icon={FileText} style={{ marginBottom: 12, padding: 0, ...staggerStyle(0) }}>
                <PendingDocsCard
                  orgId={orgId}
                  items={pendingDocItems}
                  maxItems={5}
                  onUploaded={() => bk.refresh()}
                />
              </SectionCard>
            </>
          )}

          <div style={staggerStyle(1)}>
            <ActivitySidebar items={activityItems} maxVisible={8} />
          </div>
        </>
      }
    />
  )
}
