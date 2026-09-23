// PATH: src/pages/AccountantDashboard.tsx
//
// Dedicated dashboard for ACCOUNTANT FIRMS (is_accountant_firm = true).
// Partners, controllers, CPAs — the supervision layer, not the day-to-day
// operational queue (that's BookkeeperDashboard.tsx).
//
// Data: useAccountantDashboard → accountant-dashboard.service → get_accountant_dashboard RPC.
// Real differentiator vs. the Bookkeeper dashboard: Certification Blue
// below — the formal "certify" step in the semaphore lifecycle
// (brain.service.ts) that closes a green transaction for good. It calls the
// resolve-transaction Edge Function, previously deployed but never invoked
// from any screen. OperationalKpis/PendingDocsCard are intentionally NOT
// here — chasing documents and working the day's queue is bookkeeper work;
// this dashboard is about certifying what the team already approved and
// closing periods.
// +Manual Entry (canPostJournalEntries) and Close Period (canClosePeriods)
// are gated by CBAC role flags, grouped under "Practice Actions".
// Accountant-exclusive widgets (journal backlog, period close, compliance)
// will be added here as get_accountant_dashboard RPC ships those surfaces.

import { useNavigate }              from 'react-router-dom'
import { useTranslation }           from 'react-i18next'
import { ShieldCheck, ClipboardList, AlertTriangle, AlertOctagon, Compass } from 'lucide-react'
import { staggerStyle }              from '../lib/motion'
import { useAuthStore }             from '../store/auth.store'
import { useUserRole }              from '../hooks/useUserRole'
import { formatDateHeadline }       from '../lib/dates'
import { useOrgActivityFeed }       from '../hooks/useAuditEvents'

import { useAccountantDashboard } from '../hooks/useAccountantDashboard'
import LpAddMenu                  from '../components/clients/LpAddMenu'
import MultiClientKanban          from '../components/dashboard/v2/bookkeeper/MultiClientKanban'
import ClientsWithIssuesPanel     from '../components/dashboard/v2/bookkeeper/ClientsWithIssuesPanel'
import CertificationQueue         from '../components/dashboard/v2/accountant/CertificationQueue'

import DashboardLayout            from '../components/dashboard/v2/shared/DashboardLayout'
import SectionCard                from '../components/dashboard/v2/shared/SectionCard'
import SemaphoreDonut             from '../components/dashboard/v2/shared/SemaphoreDonut'
import CriticalAlertBanner        from '../components/dashboard/v2/shared/CriticalAlertBanner'
import AttentionGrid              from '../components/dashboard/v2/shared/AttentionGrid'
import ActivitySidebar            from '../components/dashboard/v2/shared/ActivitySidebar'
import FirmHealthKpis             from '../components/dashboard/v2/shared/FirmHealthKpis'
import FirmInsightsPanel          from '../components/dashboard/v2/shared/FirmInsightsPanel'
import OnboardingHint             from '../components/dashboard/v2/shared/OnboardingHint'

import {
  buildAttentionItems, criticalCount,
  buildActivityItems, firmHealthProps
} from '../lib/firm-dashboard-helpers'
import { useFirmInsights }     from '../hooks/useFirmInsights'
import { useOrgCurrency }      from '../hooks/useOrgCurrency'
import { useOnboardingHints }  from '../hooks/useOnboardingHints'

export default function AccountantDashboard() {
  const navigate = useNavigate()
  const { t }    = useTranslation()
  const { membership, profile } = useAuthStore()
  const orgId                   = membership?.org_id ?? ''
  const role                    = useUserRole()

  const dash = useAccountantDashboard(orgId, true)
  const insights    = useFirmInsights(orgId, true)
  const orgCurrency = useOrgCurrency()
  const { data: events = [] } = useOrgActivityFeed(orgId, 12)

  const now = new Date()

  const firstName = profile?.display_name?.split(' ')[0]
  const timeOfDay = now.getHours() < 12 ? 'Morning' : now.getHours() < 18 ? 'Afternoon' : 'Evening'
  const greeting  = firstName
    ? t(`dashboard.greeting${timeOfDay}`, { name: firstName })
    : t(`dashboard.greeting${timeOfDay}NoName`)

  const attentionItems  = buildAttentionItems(dash.data, navigate, t)
  const critical        = criticalCount(attentionItems)
  const activityItems   = buildActivityItems(events, t)
  const sem             = dash.data?.semaphore_counts
  const hasPracticeActions = role.canPostJournalEntries || role.canClosePeriods
  const onboarding      = useOnboardingHints('accountant_dashboard')

  return (
    <DashboardLayout
      headerSlot={
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap'
        }}>
          <div>
            <h1 style={{
              fontSize: 22, fontWeight: 600,
              color: 'var(--lp-text)', letterSpacing: '-0.01em', margin: 0
            }}>
              {greeting} <span style={{ opacity: 0.5 }}>👋</span>
            </h1>
            <p style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 4, margin: 0 }}>
              {formatDateHeadline(now)}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <LpAddMenu orgId={orgId} onClientCreated={() => dash.refresh()} />
          </div>
        </div>
      }

      alertSlot={
        <CriticalAlertBanner
          count={critical}
          severity="critical"
          label={critical === 1 ? t('dashboard.criticalItemOne') : t('dashboard.criticalItemOther')}
          sub={t('dashboard.needAttentionToday')}
          onView={() => navigate('/clients')}
        />
      }

      mainSlot={
        <>
          {/* ── Row 1: Financial Health ───────────────────────────────── */}
          <div style={{ marginBottom: 14, ...staggerStyle(0) }}>
            <FirmHealthKpis
              {...firmHealthProps(dash.data?.financial_kpis)}
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
          </div>

          {/* ── Insights (QB parity: AR aging · cash flow · anomalies · P&L) ─ */}
          <div style={staggerStyle(1)}>
            <FirmInsightsPanel data={insights.data} loading={insights.loading} onNavigate={navigate} currency={orgCurrency} />
          </div>

          {/* ── Row 2: Certification Blue — the Accountant differentiator ── */}
          {orgId && (
            <>
              {onboarding.shouldShow && (
                <OnboardingHint
                  title={t('dashboard.certificationBlue')}
                  message={t('dashboard.certificationBlueHintMessage')}
                  onDismiss={onboarding.dismissAll}
                />
              )}
              <SectionCard
                title={t('dashboard.certificationBlue')}
                icon={ShieldCheck}
                accentColor="var(--lp-violet)"
                accentBg="var(--lp-violet-bg)"
                style={{ marginBottom: 14, ...staggerStyle(2) }}
              >
                <CertificationQueue orgId={orgId} onCertified={dash.refresh} />
              </SectionCard>
            </>
          )}

          {/* ── Row 3: Multi-Client Workflow ─────────────────────────── */}
          {dash.data && dash.data.kanban.length > 0 && (
            <>
              {onboarding.shouldShow && (
                <OnboardingHint
                  title={t('dashboard.multiClientWorkflow')}
                  message={t('dashboard.multiClientWorkflowHintMessage')}
                  onDismiss={onboarding.dismissAll}
                />
              )}
              <SectionCard
                title={t('dashboard.multiClientWorkflow')}
                icon={ClipboardList}
                accentColor="var(--sem-cyan)"
                accentBg="var(--sem-cyan-bg)"
                right={
                  <span style={{ fontSize: 10, color: 'var(--lp-text-muted)' }}>
                    {dash.data.kanban.length === 1
                      ? t('dashboard.clientsAcrossStagesOne',   { count: dash.data.kanban.length })
                      : t('dashboard.clientsAcrossStagesOther', { count: dash.data.kanban.length })}
                  </span>
                }
                style={{ marginBottom: 14, ...staggerStyle(3) }}
              >
                <MultiClientKanban clients={dash.data.kanban} onUpdate={dash.refresh} />
              </SectionCard>
            </>
          )}

          {/* ── Row 4: Attention Required ────────────────────────────── */}
          {attentionItems.length > 0 && (
            <SectionCard
              title={t('dashboard.attentionRequired')}
              icon={AlertTriangle}
              accentColor="var(--sem-amber)"
              accentBg="var(--sem-amber-bg)"
              right={
                <button className="lp-btn-outline" onClick={() => navigate('/clients')}>
                  {t('common.viewAll')}
                </button>
              }
              style={{ marginBottom: 14, ...staggerStyle(4) }}
            >
              <AttentionGrid
                items={attentionItems}
                columns={Math.min(4, Math.max(2, attentionItems.length))}
              />
            </SectionCard>
          )}

          {/* ── Row 5: Clients with Issues ───────────────────────────── */}
          {dash.data && dash.data.clients_with_issues.length > 0 && (
            <SectionCard
              title={t('dashboard.clientsWithIssues')}
              icon={AlertOctagon}
              accentColor="var(--sem-red)"
              accentBg="var(--sem-red-bg)"
              right={
                <span style={{ fontSize: 10, color: 'var(--lp-text-muted)' }}>
                  {dash.data.clients_with_issues.length === 1
                    ? t('dashboard.clientCountOne',   { count: dash.data.clients_with_issues.length })
                    : t('dashboard.clientCountOther', { count: dash.data.clients_with_issues.length })}
                </span>
              }
              style={staggerStyle(5)}
            >
              <ClientsWithIssuesPanel clients={dash.data.clients_with_issues} />
            </SectionCard>
          )}
        </>
      }

      sidebarSlot={
        <>
          {hasPracticeActions && (
            <SectionCard
              title={t('dashboard.practiceActions')}
              icon={Compass}
              accentColor="var(--lp-violet)"
              accentBg="var(--lp-violet-bg)"
              style={{ marginBottom: 12, ...staggerStyle(0) }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {role.canPostJournalEntries && (
                  <>
                    {onboarding.shouldShow && (
                      <OnboardingHint
                        title={t('dashboard.manualEntryHintTitle')}
                        message={t('dashboard.manualEntryHintMessage')}
                        onDismiss={onboarding.dismissAll}
                      />
                    )}
                    <button
                      className="lp-btn lp-btn-primary"
                      onClick={() => navigate('/clients?intent=journal')}
                      title={t('dashboard.manualEntryButtonTitle')}
                      style={{ width: '100%' }}
                    >
                      {t('dashboard.manualEntryButton')}
                    </button>
                  </>
                )}
                {role.canClosePeriods && (
                  <>
                    {onboarding.shouldShow && (
                      <OnboardingHint
                        title={t('dashboard.closePeriodHintTitle')}
                        message={t('dashboard.closePeriodHintMessage')}
                        onDismiss={onboarding.dismissAll}
                      />
                    )}
                    <button
                      className="lp-btn lp-btn-secondary"
                      onClick={() => navigate('/clients?intent=period')}
                      title={t('dashboard.closePeriodButtonTitle')}
                      style={{ width: '100%' }}
                    >
                      {t('dashboard.closePeriodButton')}
                    </button>
                  </>
                )}
              </div>
            </SectionCard>
          )}

          <div style={staggerStyle(1)}>
            <ActivitySidebar items={activityItems} maxVisible={8} />
          </div>
        </>
      }
    />
  )
}
