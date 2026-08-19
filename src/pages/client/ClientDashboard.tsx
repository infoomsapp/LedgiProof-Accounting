// PATH: src/pages/client/ClientDashboard.tsx
//
// CSS-TODO (file-level): remaining are unique alpha gradations (green 0.06/0.25, amber 0.25, red 0.25, violet 0.12/0.3, indigo rgba(99,102,241,0.08)). Direct mappings migrated.
//
// Landing page of the client portal.
//
// MERGED VERSION:
//   - Full UI (welcome, bank CTA, stats grid, action items, empty state)
//   - Impersonation-safe data loading (uses admin RPCs when staff is viewing as)

import { useEffect, useState } from 'react'
import { useNavigate }        from 'react-router-dom'
import { useAuthStore }       from '../../store/auth.store'
import { useClientContext }   from '../../hooks/useClientContext'
import { useImpersonationStore } from '../../store/impersonation.store'
import { formatCurrency } from '../../lib/currency'
import { useChatBubbleStore } from '../../store/chat-bubble.store'
import {
  useClientStats,
  useClientTransactions,
  type ClientDashboardStats
} from '../../hooks/useClientTransactions'
import { db } from '../../lib/supabase'

export default function ClientDashboard() {
  const { profile } = useAuthStore()
  const { clientId } = useClientContext()
  const { isImpersonating } = useImpersonationStore()
  const navigate     = useNavigate()
  const { openChat } = useChatBubbleStore()

  const impersonating = isImpersonating()

  const { data: stats } = useClientStats(clientId ?? '')
  const { data: txs = [], isLoading: txLoading } = useClientTransactions(clientId ?? '')

  const [hasBankConnection, setHasBankConnection] = useState<boolean | null>(null)
  const [clientName, setClientName] = useState<string>('')
  const [metaLoading, setMetaLoading] = useState(true)

  // ─────────────────────────────────────────────────────────────────────────
  // Load bank-connection status + client name.
  // Branches based on whether we're being viewed by an admin (impersonation)
  // or by the actual client user — admins use SECURITY DEFINER RPCs.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true

    async function loadMeta() {
      if (!clientId) {
        if (!alive) return
        setHasBankConnection(false)
        setClientName('')
        setMetaLoading(false)
        return
      }

      setMetaLoading(true)

      try {
        // Direct table reads under RLS — is_org_member(org_id) already grants
        // impersonating staff the same read access as the real client user,
        // so no separate admin-bypass RPC is needed here. (The old
        // get_bank_connections_admin / get_client_info_admin RPCs referenced
        // below didn't even exist in the DB — every impersonation session
        // was silently falling through to the catch block.)
        const [bankRes, clientRes] = await Promise.all([
          db
            .from('bank_connections')
            .select('id', { count: 'exact', head: true })
            .eq('client_id', clientId)
            .eq('is_active', true),
          db
            .from('clients')
            .select('display_name, company_name')
            .eq('id', clientId)
            .single()
        ])
        if (!alive) return
        setHasBankConnection((bankRes.count ?? 0) > 0)
        setClientName(clientRes.data?.company_name ?? clientRes.data?.display_name ?? '')
      } catch (err) {
        console.warn('[ClientDashboard] loadMeta failed:', err)
        if (!alive) return
        setHasBankConnection(null)
        setClientName('')
      } finally {
        if (alive) setMetaLoading(false)
      }
    }

    void loadMeta()

    return () => {
      alive = false
    }
  }, [clientId, impersonating])

  // Guard while context resolves
  if (!clientId) return null

  const safeStats: ClientDashboardStats = stats ?? {
    client_id: clientId,
    total_transactions: 0,
    pending_amber: 0,
    pending_red: 0,
    verified_blue: 0,
    in_review_green: 0,
    latest_transaction_date: null,
    recent_messages_count: 0
  }

  const pendingCount = (safeStats.pending_amber ?? 0) + (safeStats.pending_red ?? 0)

  const hourNow = new Date().getHours()
  const greeting =
    hourNow < 12 ? 'Good morning' : hourNow < 18 ? 'Good afternoon' : 'Good evening'

  // When impersonating, the bookkeeper's first name is irrelevant — show client context
  const firstName = impersonating
    ? (clientName.split(' ')[0] || 'there')
    : (profile?.display_name?.split(' ')[0]
        ?? profile?.email?.split('@')[0]
        ?? 'there')

  return (
    <div
      style={{
        padding: '32px 32px',
        flex: 1,
        overflow: 'auto',
        maxWidth: 900,
        margin: '0 auto',
        width: '100%'
      }}
    >
      {/* Welcome */}
      <div style={{
        marginBottom: 28,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: 'var(--lp-text)', letterSpacing: '-0.01em'
          }}>
            {greeting}, {firstName} 👋
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--lp-text-muted)', marginTop: 5 }}>
            {impersonating
              ? `Viewing ${clientName || 'client'}'s portal`
              : `Welcome to your ${clientName || 'business'} financial portal`}
          </p>
        </div>

        {/* 🆕 P4 Fase 2.C — Quick actions for the external client.
            Audience A scope: Chat with bookkeeper + Account settings.
            No edit/delete on billing data (bookkeeper owns it). */}
        {!impersonating && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => openChat()}
              title="Open chat with your bookkeeper"
              style={{
                background:    'var(--lp-accent)',
                border:        'none',
                color:         '#fff',
                borderRadius:  8,
                padding:       '7px 13px',
                fontSize:      12,
                fontWeight:    600,
                cursor:        'pointer',
                fontFamily:    'inherit',
                whiteSpace:    'nowrap'
              }}
            >
              💬 Chat with bookkeeper
            </button>
            <button
              onClick={() => navigate('/client/settings')}
              title="Edit your account info"
              style={{
                background:    'transparent',
                border:        '0.5px solid var(--lp-border)',
                color:         'var(--lp-text)',
                borderRadius:  8,
                padding:       '7px 13px',
                fontSize:      12,
                fontWeight:    500,
                cursor:        'pointer',
                fontFamily:    'inherit',
                whiteSpace:    'nowrap'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              ⚙ Settings
            </button>
          </div>
        )}
      </div>

      {/* ── Bank connection CTA / status ─────────────────────────── */}
      {!metaLoading && hasBankConnection === false ? (
        <div style={{
          padding: '24px 26px',
          borderRadius: 14,
          marginBottom: 24,
          background: 'linear-gradient(135deg, rgba(167,139,250,0.12), rgba(99,102,241,0.08))',
          border: '0.5px solid rgba(167,139,250,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <span style={{ fontSize: 28 }}>🏦</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)' }}>
                {impersonating
                  ? 'No bank connection yet'
                  : 'Connect your bank to get started'}
              </div>
              <div style={{ fontSize: 12.5, color: '#c4b5fd', marginTop: 3 }}>
                {impersonating
                  ? 'The client has not linked an account yet'
                  : 'Securely link your accounts via Plaid'}
              </div>
            </div>
          </div>

          {!impersonating && (
            <>
              <div style={{
                fontSize: 12, color: 'var(--lp-text-muted)',
                lineHeight: 1.7, marginBottom: 16
              }}>
                ✓ Bank-grade encryption<br />
                ✓ Your credentials never touch our servers<br />
                ✓ Read-only access — we can&apos;t move money<br />
                ✓ Takes less than 2 minutes
              </div>

              <button
                onClick={() => navigate('/client/bank')}
                style={{
                  padding: '10px 20px', borderRadius: 9, cursor: 'pointer',
                  background: 'var(--lp-violet)', color: '#1c1330', border: 'none',
                  fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600
                }}
              >
                Connect Your Bank →
              </button>
            </>
          )}
        </div>
      ) : !metaLoading && hasBankConnection === true ? (
        <div style={{
          padding: '12px 18px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(34,197,94,0.06)', border: '0.5px solid rgba(34,197,94,0.25)',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: 14 }}>✓</span>
          <span style={{ fontSize: 12.5, color: 'var(--sem-green)' }}>
            {impersonating
              ? 'Bank is connected and syncing'
              : 'Your bank is connected and syncing automatically'}
          </span>
        </div>
      ) : (
        <div style={{
          padding: '12px 18px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(255,255,255,0.03)', border: '0.5px solid var(--lp-border)',
          fontSize: 12.5, color: 'var(--lp-text-muted)'
        }}>
          Checking bank connection…
        </div>
      )}

      {/* ── Stats grid ─────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 28
      }}>
        <StatCard
          label="Pending your attention"
          value={pendingCount}
          detail={
            pendingCount > 0
              ? `${safeStats.pending_red ?? 0} urgent · ${safeStats.pending_amber ?? 0} review`
              : 'All caught up'
          }
          color={pendingCount > 0 ? 'var(--sem-amber)' : 'var(--sem-green)'}
          icon={pendingCount > 0 ? '⚠' : '✓'}
          {...(pendingCount > 0
            ? { onClick: () => navigate('/client/transactions?filter=pending') }
            : {})}
        />

        <StatCard
          label="Total transactions"
          value={safeStats.total_transactions ?? 0}
          detail={
            safeStats.latest_transaction_date
              ? `Last: ${safeStats.latest_transaction_date}`
              : 'No activity yet'
          }
          color="var(--lp-accent)"
          icon="📊"
        />

        <StatCard
          label="Verified"
          value={safeStats.verified_blue ?? 0}
          detail="Cleared by your bookkeeper"
          color="var(--lp-accent)"
          icon="🔒"
        />

        <StatCard
          label="Recent messages"
          value={safeStats.recent_messages_count ?? 0}
          detail="Last 7 days"
          color="var(--lp-violet)"
          icon="💬"
          onClick={() => openChat()}
        />
      </div>

      {/* ── Action items (pending transactions) ────────────────────── */}
      {pendingCount > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, color: 'var(--lp-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10
          }}>
            Needs {impersonating ? 'client' : 'your'} attention
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {txs
              .filter(t => t.semaphore === 'amber' || t.semaphore === 'red')
              .slice(0, 5)
              .map(tx => (
                <div
                  key={tx.id}
                  onClick={() => navigate(`/client/transactions?id=${tx.id}`)}
                  style={{
                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                    background: 'var(--lp-surface)',
                    border: `0.5px solid ${
                      tx.semaphore === 'red'
                        ? 'rgba(239,68,68,0.25)'
                        : 'rgba(245,158,11,0.25)'
                    }`,
                    borderLeft: `3px solid ${tx.semaphore === 'red' ? 'var(--sem-red)' : 'var(--sem-amber)'}`,
                    display: 'flex', alignItems: 'center', gap: 14,
                    transition: 'transform 0.1s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'  }}
                >
                  <span style={{ fontSize: 16 }}>
                    {tx.semaphore === 'red' ? '🔴' : '🟡'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, color: 'var(--lp-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {tx.description ?? 'Transaction'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                      {tx.transaction_date}
                      {' · '}
                      {tx.ai_reason ?? 'Bookkeeper needs clarification'}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: 'monospace', fontSize: 13, fontWeight: 500,
                    color: tx.amount >= 0 ? 'var(--lp-text)' : '#f87171', whiteSpace: 'nowrap'
                  }}>
                    {formatCurrency(tx.amount, tx.currency ?? 'USD')}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Empty state — only when really empty AND bank is connected */}
      {!txLoading && txs.length === 0 && hasBankConnection === true && (
        <div style={{
          padding: '40px 24px', borderRadius: 12, textAlign: 'center',
          background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)'
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
            Waiting for first transactions
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
            Plaid is syncing the bank. This usually takes a few minutes.
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function StatCard({
  label, value, detail, color, icon, onClick
}: {
  label: string
  value: number | string
  detail?: string
  color: string
  icon: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '16px',
        borderRadius: 11,
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.12s'
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = color + '50' }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.borderColor = 'var(--lp-border)' }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8
      }}>
        <span style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em'
        }}>
          {label}
        </span>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {detail && (
        <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 5 }}>
          {detail}
        </div>
      )}
    </div>
  )
}