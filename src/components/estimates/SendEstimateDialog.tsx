// PATH: src/components/estimates/SendEstimateDialog.tsx
//
// REFACTOR v32 (CSS Sprint):
//   · Public link input → .lp-input
//   · Copy/Cancel/Send buttons → .lp-btn variants
//   · Email input → .lp-input
//   · Banners (success/error/warning) → .lp-banner classes
//   · Removed local labelStyle/primaryBtnStyle/ghostBtnStyle helpers
//
// Logic 100% preserved.

import { useState, useEffect } from 'react'
import Modal from '../ui/modal'
import SemaphoreSpinner from '../ui/SemaphoreSpinner'
import { useSendEstimate } from '../../hooks/useEstimates'
import { buildPublicEstimateUrl } from '../../services/estimate.service'
import type { Estimate } from '../../types/estimate'

interface Props {
  open:         boolean
  onClose:      () => void
  estimate:     Estimate
  defaultEmail?: string
  onSent?:      () => void
}

type SendMethod = 'link_copied' | 'email'

export default function SendEstimateDialog({
  open, onClose, estimate, defaultEmail, onSent
}: Props) {
  const sendMut = useSendEstimate(estimate.org_id)

  const [method, setMethod]       = useState<SendMethod>('link_copied')
  const [email, setEmail]         = useState(defaultEmail ?? estimate.sent_to ?? '')
  const [copied, setCopied]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (open) {
      setMethod('link_copied')
      setEmail(defaultEmail ?? estimate.sent_to ?? '')
      setCopied(false)
      setError(null)
      setConfirmed(false)
    }
  }, [open, defaultEmail, estimate.sent_to])

  const publicUrl = estimate.public_token
    ? buildPublicEstimateUrl(estimate.public_token)
    : null

  async function handleCopyLink() {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard. Please select and copy manually.')
    }
  }

  async function handleConfirmSend() {
    setError(null)
    try {
      await sendMut.mutateAsync({
        estimateId: estimate.id,
        ...(method === 'email' && email ? { toEmail: email } : {}),
        method
      })
      setConfirmed(true)
      onSent?.()
    } catch (e: any) {
      setError(e?.message ?? 'Could not mark as sent')
    }
  }

  const alreadySent = !!estimate.sent_at

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={alreadySent ? 'Estimate sent' : 'Send estimate'}
      subtitle={
        alreadySent
          ? 'This estimate has been sent. You can resend or copy the link again.'
          : 'Share the link with your client to let them review and accept.'
      }
      width={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Already-confirmed banner ────────────────────────────────── */}
        {confirmed && (
          <div className="lp-banner success" style={{ alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <div>
              <strong style={{ fontWeight: 600 }}>Marked as sent</strong>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                Your client can now view and accept the estimate.
              </div>
            </div>
          </div>
        )}

        {/* ── Public link (always shown) ──────────────────────────────── */}
        {publicUrl ? (
          <div>
            <div className="lp-section-label">Public link</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
              <input
                readOnly
                value={publicUrl}
                onFocus={e => e.target.select()}
                className="lp-input"
                style={{
                  flex: 1,
                  fontSize: 11.5,
                  fontFamily: 'monospace',
                  color: '#a78bfa'
                }}
              />
              <button
                onClick={handleCopyLink}
                className={`lp-btn ${copied ? '' : 'lp-btn-ghost'}`}
                style={copied ? {
                  background: 'rgba(34,197,94,0.15)',
                  border: '0.5px solid rgba(34,197,94,0.4)',
                  color: '#22c55e',
                  fontWeight: 600
                } : { fontWeight: 600 }}
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
            <div style={{
              fontSize: 10.5, color: 'var(--lp-text-muted)', marginTop: 5
            }}>
              Anyone with this link can view and accept the estimate. No login required.
            </div>
          </div>
        ) : (
          <div className="lp-banner error">
            ⚠ This estimate doesn't have a public token yet. Save the estimate first.
          </div>
        )}

        {/* ── Method selector ─────────────────────────────────────────── */}
        {!confirmed && (
          <div>
            <div className="lp-section-label">How are you sharing it?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <MethodRadio
                value="link_copied"
                current={method}
                onChange={setMethod}
                label="I'll share the link"
                description="Copy the link manually (WhatsApp, SMS, etc.)"
                icon="🔗"
              />
              <MethodRadio
                value="email"
                current={method}
                onChange={setMethod}
                label="Send via email"
                description="(coming soon — for now, copy the link)"
                icon="✉️"
              />
            </div>
          </div>
        )}

        {/* ── Email input (when method = email) ───────────────────────── */}
        {method === 'email' && !confirmed && (
          <div>
            <div className="lp-section-label">Client email</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="lp-input"
            />
            <div style={{
              fontSize: 10.5, color: 'var(--lp-text-muted)', marginTop: 5
            }}>
              📌 Email sending requires an Edge Function. For now, the estimate will be marked
              as sent and you can copy the link manually.
            </div>
          </div>
        )}

        {/* ── Error banner ────────────────────────────────────────────── */}
        {error && (
          <div className="lp-banner error">
            ⚠ {error}
          </div>
        )}

        {/* ── Action buttons ──────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6
        }}>
          {confirmed ? (
            <button
              onClick={onClose}
              className="lp-btn lp-btn-primary"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={sendMut.isPending}
                className="lp-btn lp-btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSend}
                disabled={
                  sendMut.isPending ||
                  !publicUrl ||
                  (method === 'email' && (!email || !email.includes('@')))
                }
                className="lp-btn lp-btn-primary"
              >
                {sendMut.isPending && <SemaphoreSpinner size="sm" inline />}
                {alreadySent ? 'Mark as resent' : 'Mark as sent'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function MethodRadio({
  value, current, onChange, label, description, icon, disabled = false
}: {
  value:       SendMethod
  current:     SendMethod
  onChange:    (v: SendMethod) => void
  label:       string
  description: string
  icon:        string
  disabled?:   boolean
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(value)}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '12px',
        textAlign: 'left',
        background: active
          ? 'rgba(59,130,246,0.08)'
          : 'rgba(255,255,255,0.02)',
        border: active
          ? '0.5px solid rgba(59,130,246,0.5)'
          : '0.5px solid var(--lp-border)',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        transition: 'background 0.15s'
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4
      }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: active ? '#60a5fa' : 'var(--lp-text)'
        }}>
          {label}
        </span>
      </div>
      <div style={{
        fontSize: 10.5, color: 'var(--lp-text-muted)', lineHeight: 1.4
      }}>
        {description}
      </div>
    </button>
  )
}
