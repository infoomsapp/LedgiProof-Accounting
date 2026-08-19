// PATH: src/pages/PymeDashboard.tsx
//
// CSS-TODO (file-level): remaining: var(--sem-red-soft) (red-400) needs --sem-red-soft. Unique blue/red alpha gradations for activity card states. Direct mappings migrated.
//
//
// REFACTORED — FASE 4 of dashboard V2 redesign.
//
// Layout: DashboardLayout (70/30 grid)
//   ┌──────────────────────────────────────────────────────┐
//   │ Header: greeting + firm name + Send receipt + Estimate│
//   ├──────────────────────────────────────────────────────┤
//   │ CriticalAlertBanner (pending.red OR overdue requests) │
//   ├───────────────────────────────────┬──────────────────┤
//   │ MAIN (70%)                        │ SIDEBAR (30%)    │
//   │                                   │                  │
//   │ Pending Actions                   │ Talk with Firm   │
//   │                                   │   (Chat panel)   │
//   │ Financial Summary (KPIs)          │                  │
//   │   Income / Expenses / Net         │ Activity Feed    │
//   │                                   │                  │
//   │ Receipt Requests                  │                  │
//   │                                   │                  │
//   │ Recent Transactions               │                  │
//   └───────────────────────────────────┴──────────────────┘
//
// Logic preserved 100% — only the JSX changed.

import { useState, useMemo }      from 'react'
import { useNavigate }            from 'react-router-dom'
import { BarChart3, CreditCard, Gauge, MessageCircle } from 'lucide-react'
import { useAuthStore }           from '../store/auth.store'
import { useChatBubbleStore }     from '../store/chat-bubble.store'
import { usePymeDashboard }       from '../hooks/usePymeDashboard'
import { vsLastMonthPct }         from '../services/pyme-dashboard.service'

import PendingActionsCard         from '../components/pyme/PendingActionsCard'
import ReceiptRequestsCard        from '../components/pyme/ReceiptRequestsCard'
import WorkspaceChatPanel         from '../components/workspace-chat/WorkspaceChatPanel'
import UploadReceiptDialog        from '../components/upload/UploadReceiptDialog'

// 🆕 V2 dashboard components (Sprint A.1: moved to v2/shared/)
import DashboardLayout            from '../components/dashboard/v2/shared/DashboardLayout'
import SectionCard                from '../components/dashboard/v2/shared/SectionCard'
import KpiTile                    from '../components/dashboard/v2/shared/KpiTile'
import SemaphoreDonut             from '../components/dashboard/v2/shared/SemaphoreDonut'
import CriticalAlertBanner        from '../components/dashboard/v2/shared/CriticalAlertBanner'
import ActivitySidebar, { type ActivityItem } from '../components/dashboard/v2/shared/ActivitySidebar'
import { formatCurrency } from '../lib/currency'

const fmtCur = (n: number, ccy = 'USD') => formatCurrency(n, ccy, { maximumFractionDigits: 0 })

export default function PymeDashboard() {
  const navigate     = useNavigate()
  const { openChat } = useChatBubbleStore()
  const { profile }  = useAuthStore()

  // PYME users have profile.client_id pointing at their own client record
  const clientId = profile?.client_id ?? null

  const pd = usePymeDashboard(clientId, !!clientId)

  // Upload modal state — optionally tied to a specific receipt_request
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadingForRequestId, setUploadingForRequestId] = useState<string | null>(null)
  const [uploadingContext, setUploadingContext] = useState<string | null>(null)

  // ── V2: derived data (MUST come BEFORE any conditional early returns —
  //    React Rules of Hooks: hooks must always be called in the same order). ──
  const recentTxSafe = pd.data?.recent_transactions ?? []

  const semaphoreCounts = useMemo(() => {
    const c = { blue: 0, green: 0, amber: 0, red: 0 }
    for (const tx of recentTxSafe) {
      const sem = tx.semaphore as keyof typeof c
      if (sem in c) c[sem]++
    }
    return c
  }, [recentTxSafe])

  const activityItems: ActivityItem[] = useMemo(() => {
    return recentTxSafe.slice(0, 8).map(tx => {
      const color =
        tx.semaphore === 'red'   ? 'red'   :
        tx.semaphore === 'amber' ? 'amber' :
        tx.semaphore === 'green' ? 'green' :
        'blue'

      const amountStr = fmtCur(tx.amount, tx.currency)
      const sign = tx.amount >= 0 ? '+' : ''
      return {
        key:   tx.tx_id,
        color: color as ActivityItem['color'],
        text:  `${tx.merchant ?? tx.description ?? 'Transaction'}`,
        sub:   `${sign}${amountStr}${tx.has_message_thread ? ' · 💬' : ''}`,
        at:    tx.transaction_date,
        onClick: () => navigate(`/transactions?id=${tx.tx_id}`)
      }
    })
  }, [recentTxSafe, navigate])

  // ── Loading / error ────────────────────────────────────────────────────
  if (!clientId) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--sem-red)', fontSize: 13 }}>
        No client linked to your account. Please contact your firm.
      </div>
    )
  }

  if (pd.loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--lp-text-muted)', fontSize: 13 }}>
        Loading your dashboard…
      </div>
    )
  }

  if (pd.error || !pd.data) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <div style={{
          padding: '14px 18px',
          background: 'var(--sem-red-bg)',
          border: '0.5px solid var(--sem-red-border)',
          borderRadius: 10,
          color: 'var(--sem-red)', fontSize: 13
        }}>
          ⚠ {pd.error ?? 'Could not load dashboard'}
          <button onClick={pd.refresh} style={{
            marginLeft: 14, padding: '4px 10px', borderRadius: 6,
            background: 'var(--sem-red-bg-strong)',
            border: '0.5px solid rgba(239,68,68,0.4)',
            color: 'var(--sem-red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5
          }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const d   = pd.data
  const ccy = d.client.currency || 'USD'

  // ── Defensive fallbacks ────────────────────────────────────────────────
  const ZERO_KPI = { income: 0, expenses: 0, net_profit: 0, tx_count: 0 }
  const kpisThisMonth   = d.kpis_this_month ?? ZERO_KPI
  const kpisLastMonth   = d.kpis_last_month ?? ZERO_KPI
  const pending         = d.pending ?? {
    transactions_to_review: 0,
    amber_count:            0,
    red_count:              0,
    receipts_requested:     0,
    unread_workspace_messages: 0
  }
  const receiptRequests = d.receipt_requests ?? []
  // recentTxSafe already declared above (before early returns) — reuse it

  // ── Greeting ───────────────────────────────────────────────────────────
  const hourNow = new Date().getHours()
  const greeting =
    hourNow < 12 ? 'Good morning' :
    hourNow < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.display_name?.split(' ')[0]
    ?? profile?.email?.split('@')[0]
    ?? 'there'

  // KPI deltas
  const incomeDelta = vsLastMonthPct(kpisThisMonth.income,     kpisLastMonth.income)
  const expDelta    = vsLastMonthPct(kpisThisMonth.expenses,   kpisLastMonth.expenses)
  const netDelta    = vsLastMonthPct(kpisThisMonth.net_profit, kpisLastMonth.net_profit)

  // ── V2: critical = pending.red OR pending.amber from receipt requests ──
  const pendingReceiptCount = receiptRequests.length
  const criticalCount = pending.red_count + pendingReceiptCount

  return (
    <>
      <DashboardLayout
        headerSlot={
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap'
          }}>
            <div>
              <h1 style={{
                fontSize: 22, fontWeight: 600, color: 'var(--lp-text)',
                letterSpacing: '-0.01em', margin: 0
              }}>
                {greeting}, {firstName} <span style={{ opacity: 0.5 }}>👋</span>
              </h1>
              <p style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 4, margin: 0 }}>
                Your firm: <strong style={{ color: 'var(--lp-violet)', fontWeight: 600 }}>{d.firm.name}</strong>
                {pd.refreshing && (
                  <span style={{ marginLeft: 8, color: 'var(--lp-accent)' }}>
                    ⏳ refreshing…
                  </span>
                )}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* 🆕 P4 Fase 2.C (B3) — Direct chat with the firm's bookkeeper */}
              <button
                onClick={() => openChat()}
                title="Open chat with your bookkeeper"
                style={{
                  padding:      '7px 14px',
                  borderRadius: 8,
                  background:   'var(--lp-accent)',
                  border:       'none',
                  color:        '#fff',
                  fontSize:     12,
                  fontWeight:   600,
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                  whiteSpace:   'nowrap',
                  transition:   'opacity 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                💬 Chat with bookkeeper
              </button>

              {/* 🆕 P4 Fase 2.D — Customer management page */}
              <button
                onClick={() => navigate('/pyme/clients')}
                title="Manage your billing customers"
                style={{
                  padding:      '7px 14px',
                  borderRadius: 8,
                  background:   'transparent',
                  border:       '0.5px solid var(--lp-border)',
                  color:        'var(--lp-text)',
                  fontSize:     12,
                  fontWeight:   600,
                  cursor:       'pointer',
                  fontFamily:   'inherit',
                  whiteSpace:   'nowrap',
                  transition:   'background 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                👥 My customers
              </button>

              <button
                onClick={() => navigate('/estimates?openCreate=1')}
                style={{
                  padding: '7px 14px', borderRadius: 8,
                  background: 'rgba(59,130,246,0.12)',
                  border: '0.5px solid rgba(59,130,246,0.35)',
                  color: 'var(--lp-accent)',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap'
                }}
              >
                + New estimate
              </button>

              <button
                onClick={() => {
                  setUploadingForRequestId(null)
                  setUploadingContext(null)
                  setUploadOpen(true)
                }}
                style={{
                  padding: '7px 14px', borderRadius: 8,
                  background: 'linear-gradient(135deg, var(--lp-violet), #8b5cf6)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  transition: 'opacity 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                📥 Send receipt
              </button>
            </div>
          </div>
        }

        alertSlot={
          <CriticalAlertBanner
            count={criticalCount}
            severity="critical"
            label={criticalCount === 1 ? 'item' : 'items'}
            sub={
              pending.red_count > 0 && pendingReceiptCount > 0
                ? `${pending.red_count} red · ${pendingReceiptCount} receipt requests`
                : pending.red_count > 0
                ? 'transactions need urgent review'
                : 'receipt requests waiting for you'
            }
            onView={() => {
              if (pendingReceiptCount > 0) {
                // Scroll to receipt requests section
                document.getElementById('receipt-requests')?.scrollIntoView({ behavior: 'smooth' })
              } else {
                navigate('/transactions?status=red')
              }
            }}
          />
        }

        mainSlot={
          <>
            {/* ── Row 1: Pending Actions (preserved) ───────────────────── */}
            <div style={{ marginBottom: 14 }}>
              <PendingActionsCard pending={pending} />
            </div>

            {/* ── Row 2: Financial Summary (KPIs) ──────────────────────── */}
            <SectionCard
              title="This Month So Far"
              icon={BarChart3}
              right={
                <span style={{ fontSize: 10, color: 'var(--lp-text-muted)' }}>
                  {kpisThisMonth.tx_count} verified {kpisThisMonth.tx_count === 1 ? 'transaction' : 'transactions'}
                </span>
              }
              style={{ marginBottom: 14 }}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '14px 16px'
              }}>
                <KpiTile
                  label="Income"
                  value={fmtCur(kpisThisMonth.income, ccy)}
                  sub={`${incomeDelta >= 0 ? '↑' : '↓'} ${Math.abs(incomeDelta)}% vs last month`}
                  color="var(--sem-green)"
                  subColor={incomeDelta >= 0 ? 'var(--sem-green)' : 'var(--sem-red)'}
                />
                <KpiTile
                  label="Expenses"
                  value={fmtCur(kpisThisMonth.expenses, ccy)}
                  sub={`${expDelta >= 0 ? '↑' : '↓'} ${Math.abs(expDelta)}% vs last month`}
                  color="var(--sem-red)"
                  subColor={expDelta <= 0 ? 'var(--sem-green)' : 'var(--sem-red)'}
                />
                <KpiTile
                  label="Net Profit"
                  value={fmtCur(kpisThisMonth.net_profit, ccy)}
                  sub={`${netDelta >= 0 ? '↑' : '↓'} ${Math.abs(netDelta)}% vs last month`}
                  color={kpisThisMonth.net_profit >= 0 ? 'var(--sem-green)' : 'var(--sem-red)'}
                  subColor={netDelta >= 0 ? 'var(--sem-green)' : 'var(--sem-red)'}
                />
              </div>
            </SectionCard>

            {/* ── Row 3: Receipt Requests (preserved component) ─────────── */}
            <div id="receipt-requests" style={{ marginBottom: 14 }}>
              <ReceiptRequestsCard
                requests={receiptRequests}
                onUploadRequest={(req) => {
                  setUploadingForRequestId(req.id)
                  const parts: string[] = []
                  if (req.merchant_hint) parts.push(req.merchant_hint)
                  if (req.amount_hint != null) parts.push(`$${req.amount_hint}`)
                  if (req.date_hint) parts.push(req.date_hint)
                  setUploadingContext(parts.length > 0 ? parts.join(' · ') : null)
                  setUploadOpen(true)
                }}
              />
            </div>

            {/* ── Row 4: Recent Transactions ───────────────────────────── */}
            <SectionCard
              title="Recent Transactions"
              icon={CreditCard}
              right={
                <button
                  onClick={() => navigate('/transactions')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--lp-accent)', fontSize: 10.5, fontFamily: 'inherit'
                  }}
                >
                  View all →
                </button>
              }
            >
              {recentTxSafe.length === 0 ? (
                <div style={{
                  padding: 24, textAlign: 'center',
                  fontSize: 12, color: 'var(--lp-text-muted)', fontStyle: 'italic'
                }}>
                  No transactions yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {recentTxSafe.slice(0, 6).map((tx, i) => (
                    <button
                      key={tx.tx_id}
                      onClick={() => navigate(`/transactions?id=${tx.tx_id}`)}
                      style={{
                        width: '100%', display: 'grid',
                        gridTemplateColumns: '24px 1fr auto',
                        gap: 12, padding: '9px 4px',
                        borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.03)' : 'none',
                        background: 'transparent', border: 'none',
                        textAlign: 'left', cursor: 'pointer',
                        fontFamily: 'inherit', alignItems: 'center',
                        transition: 'background 0.12s',
                        borderLeft: tx.semaphore === 'red'   ? '3px solid var(--sem-red)'
                                  : tx.semaphore === 'amber' ? '3px solid var(--sem-amber)'
                                  : '3px solid transparent'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontSize: 13 }}>{semIcon(tx.semaphore)}</span>

                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, color: 'var(--lp-text)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>
                          {tx.merchant ?? tx.description ?? 'Transaction'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                          {tx.transaction_date}
                          {tx.requires_review && (
                            <span style={{ marginLeft: 6, color: 'var(--sem-amber)' }}>
                              · Was this for business?
                            </span>
                          )}
                          {tx.has_message_thread && (
                            <span style={{ marginLeft: 6, color: 'var(--sem-cyan)' }}>
                              · 💬
                            </span>
                          )}
                        </div>
                      </div>

                      <span style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 500,
                        color: tx.amount >= 0 ? 'var(--sem-green)' : 'var(--sem-red-soft)', whiteSpace: 'nowrap'
                      }}>
                        {fmtCur(tx.amount, tx.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        }

        sidebarSlot={
          <>
            {/* Semaphore Donut (small) */}
            <SectionCard
              title="Transaction Health"
              icon={Gauge}
              style={{ marginBottom: 12 }}
              compact
            >
              <SemaphoreDonut
                counts={semaphoreCounts}
                size={95}
                thickness={12}
              />
            </SectionCard>

            {/* Chat with firm (key feature for PYME) */}
            <SectionCard
              title="Talk With Your Firm"
              icon={MessageCircle}
              style={{ marginBottom: 12 }}
              compact
            >
              <div style={{ height: 320, display: 'flex', flexDirection: 'column' }}>
                <WorkspaceChatPanel
                  orgId={d.firm.org_id}
                  clientId={d.client.id}
                  firmName={d.firm.name}
                  compact={true}
                />
              </div>
            </SectionCard>

            {/* Activity Sidebar */}
            <ActivitySidebar
              items={activityItems}
              maxVisible={6}
              isLive={true}
              rightSlot={
                recentTxSafe.length > 0 ? (
                  <button
                    onClick={() => navigate('/transactions')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--lp-accent)', fontSize: 10, fontFamily: 'inherit'
                    }}
                  >
                    View all →
                  </button>
                ) : undefined
              }
            />
          </>
        }
      />

      {/* Upload receipt modal (rendered outside the grid, fixed positioning) */}
      <UploadReceiptDialog
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false)
          setUploadingForRequestId(null)
          setUploadingContext(null)
        }}
        orgId={d.firm.org_id}
        clientId={d.client.id}
        {...(uploadingForRequestId ? { receiptRequestId: uploadingForRequestId } : {})}
        {...(uploadingContext ? { contextLine: uploadingContext } : {})}
        onUploaded={() => pd.refresh()}
      />
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────

function semIcon(s: string): string {
  return s === 'red'   ? '🔴'
       : s === 'amber' ? '🟡'
       : s === 'green' ? '🟢'
       : '🔵'
}
