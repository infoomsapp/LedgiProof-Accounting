// PATH: src/pages/EstimatePublic.tsx
//
// CSS-TODO (file-level): remaining are 2 box-shadow declarations: rgba(0,0,0,0.04) for soft elevation and rgba(0,0,0,0.08) for hover. These are paper-canvas shadows for the printable view. Direct mappings migrated.
//
//
// Public-facing estimate page for clients receiving a /e/:token link.
//
// Standalone — NO AppShell wrapper. The client is not an authenticated user.
//
// Layout:
//   ┌──────────────────────────────────────────────────┐
//   │ Top bar: company name + "Powered by LedgiProof"  │
//   ├──────────────────────────────────────────────────┤
//   │ Status banner (if accepted/rejected/converted)   │
//   ├──────────────────────────────────────────────────┤
//   │ Estimate preview (EstimatePrint, light theme)    │
//   ├──────────────────────────────────────────────────┤
//   │ Action area (only if status = sent | viewed):    │
//   │   · Decline                                      │
//   │   · Counter-offer                                │
//   │   · Accept (signature + name)                    │
//   └──────────────────────────────────────────────────┘

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  useEstimatePublic,
  useAcceptEstimatePublic,
  useRejectEstimatePublic
} from '../hooks/useEstimates'
import EstimatePrint        from '../components/estimates/EstimatePrint'
import SignaturePad         from '../components/estimates/SignaturePad'
import CounterOfferDialog   from '../components/estimates/CounterOfferDialog'
import { ESTIMATE_STATUS_CONFIG } from '../types/estimate'
import { formatDateShort } from '../lib/dates'

export default function EstimatePublic() {
  const { token } = useParams<{ token: string }>()
  const { data: payload, isLoading, isError, error: queryError, refetch } = useEstimatePublic(token, true)

  const acceptMut = useAcceptEstimatePublic()
  const rejectMut = useRejectEstimatePublic()

  // ── Action state ─────────────────────────────────────────────────────────
  const [mode, setMode]               = useState<'idle' | 'accepting' | 'declining' | 'counter'>('idle')
  const [signerName, setSignerName]   = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [declineReason, setDeclineReason] = useState('')
  const [counterOpen, setCounterOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionDone,  setActionDone]  = useState<'accepted' | 'declined' | 'counter' | null>(null)

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return <LoadingScreen />
  }

  // ── Error states ─────────────────────────────────────────────────────────
  if (isError || !payload) {
    return (
      <ErrorScreen
        message={
          queryError instanceof Error && queryError.message.includes('not found')
            ? 'This estimate link is invalid or has expired.'
            : queryError instanceof Error && queryError.message.includes('not yet sent')
            ? 'This estimate is still being prepared. Please check back later.'
            : 'We could not load this estimate. Please try again.'
        }
        onRetry={() => refetch()}
      />
    )
  }

  const { estimate, items, org, client } = payload
  const statusCfg = ESTIMATE_STATUS_CONFIG[estimate.status]

  // Determine if actions are still available
  const isActionable = estimate.status === 'sent' || estimate.status === 'viewed'

  // ── Action handlers ──────────────────────────────────────────────────────
  async function handleAccept() {
    if (!token) return
    setActionError(null)

    if (!signerName.trim() || signerName.trim().length < 2) {
      setActionError('Please type your full legal name.')
      return
    }

    try {
      await acceptMut.mutateAsync({
        token,
        signerName:    signerName.trim(),
        signatureText: signerName.trim(),
        ...(signerEmail.trim() ? { signerEmail: signerEmail.trim() } : {})
      })
      setActionDone('accepted')
      setMode('idle')
      refetch()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not accept estimate'
      setActionError(msg)
    }
  }

  async function handleDecline() {
    if (!token) return
    setActionError(null)

    if (!declineReason.trim() || declineReason.trim().length < 3) {
      setActionError('Please provide a brief reason.')
      return
    }

    try {
      await rejectMut.mutateAsync({
        token,
        reason: declineReason.trim(),
        ...(signerName.trim() ? { signerName: signerName.trim() } : {}),
        ...(signerEmail.trim() ? { signerEmail: signerEmail.trim() } : {})
      })
      setActionDone('declined')
      setMode('idle')
      refetch()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not decline estimate'
      setActionError(msg)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="lp-web-page" style={{
      paddingBottom: 60,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>

      {/* ── Top bar (org name + LedgiProof branding) ────────────────────── */}
      <div className="lp-no-print" style={{
        background: 'var(--web-surface)',
        borderBottom: '1px solid var(--web-border)',
        padding: '14px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--web-text)'
        }}>
          {org.name}
        </div>
        <a
          href="https://ledgiproof.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11,
            color: 'var(--web-text-muted)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          Powered by <strong style={{ color: 'var(--web-primary)', fontWeight: 600 }}>LedgiProof</strong>
        </a>
      </div>

      {/* ── Action-completed banner (after acceptance/decline) ──────────── */}
      {actionDone && (
        <ActionConfirmationBanner action={actionDone} estimateNumber={estimate.estimate_number} />
      )}

      {/* ── Status banner (always shown for non-actionable statuses) ───── */}
      {!isActionable && !actionDone && (
        <StatusBanner status={estimate.status} statusCfg={statusCfg} estimate={estimate} />
      )}

      {/* ── Estimate preview ─────────────────────────────────────────────── */}
      <div style={{
        maxWidth: 900,
        margin: '24px auto 0',
        padding: '0 16px'
      }}>
        <EstimatePrint
          estimate={estimate}
          items={items}
          org={org}
          client={client}
        />
      </div>

      {/* ── Actions (only if actionable + no actionDone yet) ────────────── */}
      {isActionable && !actionDone && (
        <div className="lp-no-print" style={{
          maxWidth: 900,
          margin: '24px auto 0',
          padding: '0 16px'
        }}>
          <div style={{
            background: 'var(--web-surface)',
            border: '1px solid var(--web-border)',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>

            {/* Idle state — 3 buttons */}
            {mode === 'idle' && (
              <>
                <h3 style={{
                  margin: 0, marginBottom: 6,
                  fontSize: 15, fontWeight: 600, color: 'var(--web-text)'
                }}>
                  Ready to respond?
                </h3>
                <p style={{
                  margin: 0, marginBottom: 18,
                  fontSize: 12.5, color: 'var(--web-text-muted)', lineHeight: 1.5
                }}>
                  Review the estimate above and choose how you'd like to proceed.
                </p>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10
                }}>
                  <button
                    onClick={() => setMode('declining')}
                    className="lp-web-btn lp-web-btn-decline"
                  >
                    ✗ Decline
                  </button>
                  <button
                    onClick={() => setCounterOpen(true)}
                    className="lp-web-btn lp-web-btn-counter"
                  >
                    ↔ Counter-offer
                  </button>
                  <button
                    onClick={() => setMode('accepting')}
                    className="lp-web-btn lp-web-btn-accept"
                  >
                    ✓ Accept estimate
                  </button>
                </div>
              </>
            )}

            {/* Accept mode — signature pad */}
            {mode === 'accepting' && (
              <>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 16
                }}>
                  <div>
                    <h3 style={{
                      margin: 0, marginBottom: 4,
                      fontSize: 15, fontWeight: 600, color: 'var(--web-text)'
                    }}>
                      Accept this estimate
                    </h3>
                    <p style={{
                      margin: 0,
                      fontSize: 12.5, color: 'var(--web-text-muted)'
                    }}>
                      Type your name below to sign and authorize this estimate.
                    </p>
                  </div>
                  <button
                    onClick={() => { setMode('idle'); setActionError(null) }}
                    className="lp-web-btn-text"
                  >
                    ← Back
                  </button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <SignaturePad
                    value={signerName}
                    onChange={setSignerName}
                    hasError={!!actionError && signerName.trim().length < 2}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label className="lp-web-label">Email (optional)</label>
                  <input
                    type="email"
                    value={signerEmail}
                    onChange={e => setSignerEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="lp-web-input"
                  />
                  <div style={{ fontSize: 10.5, color: 'var(--web-text-muted)', marginTop: 5 }}>
                    We'll send you a confirmation email with a copy of the signed estimate.
                  </div>
                </div>

                {actionError && (
                  <div className="lp-web-error" style={{ marginBottom: 12 }}>⚠ {actionError}</div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  marginTop: 8
                }}>
                  <button
                    onClick={() => { setMode('idle'); setActionError(null) }}
                    disabled={acceptMut.isPending}
                    className="lp-web-btn lp-web-btn-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAccept}
                    disabled={acceptMut.isPending || signerName.trim().length < 2}
                    className="lp-web-btn lp-web-btn-accept"
                  >
                    {acceptMut.isPending ? 'Signing…' : '✓ Sign & Accept'}
                  </button>
                </div>
              </>
            )}

            {/* Decline mode — reason input */}
            {mode === 'declining' && (
              <>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 16
                }}>
                  <div>
                    <h3 style={{
                      margin: 0, marginBottom: 4,
                      fontSize: 15, fontWeight: 600, color: 'var(--web-text)'
                    }}>
                      Decline this estimate
                    </h3>
                    <p style={{
                      margin: 0,
                      fontSize: 12.5, color: 'var(--web-text-muted)'
                    }}>
                      Let the vendor know why you're declining. This helps them improve their proposals.
                    </p>
                  </div>
                  <button
                    onClick={() => { setMode('idle'); setActionError(null) }}
                    className="lp-web-btn-text"
                  >
                    ← Back
                  </button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label className="lp-web-label">
                    Reason <span style={{ color: 'var(--web-danger)' }}>*</span>
                  </label>
                  <textarea
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    placeholder="E.g. Too expensive, changed our plans, found another vendor…"
                    rows={3}
                    className="lp-web-textarea"
                  />
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 16
                }}>
                  <div>
                    <label className="lp-web-label">Your name (optional)</label>
                    <input
                      type="text"
                      value={signerName}
                      onChange={e => setSignerName(e.target.value)}
                      placeholder="Full name"
                      className="lp-web-input"
                    />
                  </div>
                  <div>
                    <label className="lp-web-label">Email (optional)</label>
                    <input
                      type="email"
                      value={signerEmail}
                      onChange={e => setSignerEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="lp-web-input"
                    />
                  </div>
                </div>

                {actionError && (
                  <div className="lp-web-error" style={{ marginBottom: 12 }}>⚠ {actionError}</div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  marginTop: 8
                }}>
                  <button
                    onClick={() => { setMode('idle'); setActionError(null) }}
                    disabled={rejectMut.isPending}
                    className="lp-web-btn lp-web-btn-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDecline}
                    disabled={rejectMut.isPending}
                    className="lp-web-btn lp-web-btn-decline"
                  >
                    {rejectMut.isPending ? 'Declining…' : '✗ Confirm decline'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="lp-no-print" style={{
        maxWidth: 900,
        margin: '32px auto 0',
        padding: '0 16px',
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--web-text-subtle)'
      }}>
        This estimate is delivered securely via LedgiProof.
        Questions? Reply to the email you received or contact <strong>{org.name}</strong> directly.
      </div>

      {/* ── Counter-offer dialog ─────────────────────────────────────────── */}
      {token && (
        <CounterOfferDialog
          open={counterOpen}
          onClose={() => setCounterOpen(false)}
          token={token}
          originalItems={items}
          currency={estimate.currency}
          onSubmitted={() => {
            setActionDone('counter')
            setCounterOpen(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="lp-web-page" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36,
          border: '3px solid var(--web-border)',
          borderTopColor: 'var(--web-primary)',
          borderRadius: '50%',
          animation: 'lp-spin 0.8s linear infinite',
          margin: '0 auto 12px'
        }} />
        <div style={{ fontSize: 13, color: 'var(--web-text-muted)' }}>
          Loading estimate…
        </div>
        <style>{`@keyframes lp-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="lp-web-page" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      <div style={{
        background: 'var(--web-surface)',
        borderRadius: 12,
        padding: '32px 28px',
        maxWidth: 420,
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)'
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
        <h2 style={{
          margin: 0, marginBottom: 8,
          fontSize: 16, fontWeight: 600, color: 'var(--web-text)'
        }}>
          Estimate not available
        </h2>
        <p style={{
          margin: 0, marginBottom: 18,
          fontSize: 13, color: 'var(--web-text-muted)', lineHeight: 1.5
        }}>
          {message}
        </p>
        <button onClick={onRetry} className="lp-web-btn lp-web-btn-primary">
          Try again
        </button>
      </div>
    </div>
  )
}

function StatusBanner({
  status, statusCfg, estimate
}: {
  status: string
  statusCfg: { label: string; color: string; bg: string; emoji: string }
  estimate: { accepted_at: string | null; rejected_at: string | null; converted_at: string | null; converted_to_invoice_id: string | null; accepted_by_name: string | null; rejected_reason: string | null }
}) {
  const message =
    status === 'accepted'   ? `Accepted on ${formatDateShort(estimate.accepted_at)} by ${estimate.accepted_by_name ?? 'client'}`
  : status === 'rejected'   ? `Declined on ${formatDateShort(estimate.rejected_at)}`
  : status === 'counter_offered' ? 'A counter-offer was submitted. The vendor will respond soon.'
  : status === 'converted'  ? `This estimate was converted to an invoice on ${formatDateShort(estimate.converted_at)}.`
  : status === 'expired'    ? 'This estimate has expired and is no longer valid.'
  : status === 'cancelled'  ? 'This estimate was cancelled by the vendor.'
  : `Status: ${statusCfg.label}`

  return (
    <div className="lp-no-print" style={{
      background: statusCfg.bg.replace(/0\.1/, '0.08'),
      borderBottom: `1px solid ${statusCfg.color}40`,
      padding: '12px 24px',
      textAlign: 'center'
    }}>
      <span style={{ fontSize: 16, marginRight: 8 }}>{statusCfg.emoji}</span>
      <span style={{ fontSize: 13, color: 'var(--web-text)' }}>
        <strong style={{ color: statusCfg.color, fontWeight: 600 }}>{statusCfg.label}</strong>
        {' · '}
        {message}
      </span>
    </div>
  )
}

function ActionConfirmationBanner({
  action, estimateNumber
}: {
  action: 'accepted' | 'declined' | 'counter'
  estimateNumber: string
}) {
  const config = {
    accepted: {
      bg:    'var(--sem-green-bg)',
      border: 'var(--web-success)',
      emoji: '✓',
      title: 'Estimate accepted',
      message: `Thank you! ${estimateNumber} has been signed. The vendor has been notified.`
    },
    declined: {
      bg:    'var(--sem-red-bg)',
      border: 'var(--web-danger)',
      emoji: '✗',
      title: 'Estimate declined',
      message: `Your response to ${estimateNumber} has been recorded.`
    },
    counter: {
      bg:    'var(--sem-amber-bg)',
      border: 'var(--web-warning)',
      emoji: '↔',
      title: 'Counter-offer submitted',
      message: `Your counter-offer for ${estimateNumber} has been sent. The vendor will review and respond.`
    }
  }[action]

  return (
    <div className="lp-no-print" style={{
      background: config.bg,
      borderBottom: `2px solid ${config.border}`,
      padding: '16px 24px',
      textAlign: 'center'
    }}>
      <div style={{
        fontSize: 24,
        marginBottom: 4,
        color: config.border
      }}>
        {config.emoji}
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--web-text)',
        marginBottom: 4
      }}>
        {config.title}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--web-text-muted)' }}>
        {config.message}
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
//
// 🆕 CSS Sprint Mensaje 3 (v32) — All inline style constants removed.
// Replaced by lp-web-* utility classes defined in src/styles/globals.css.
//
// Constitution-compliant:
//   · Zero hardcoded hex colors in this file
//   · All visual properties controlled by CSS variables (--web-*)
//   · Scoped via .lp-web-page wrapper to prevent leak into dark-theme app
//
// To customize the look: edit .lp-web-page CSS variables in globals.css.