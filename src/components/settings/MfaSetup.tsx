// PATH: src/components/settings/MfaSetup.tsx
// 2FA management panel embedded in Settings → My account tab.
// Handles: enroll (show QR + verify), confirmed state, disable.

import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth.store'

interface MfaFactor {
  id: string
  type: string
  status: string
}

export default function MfaSetup() {
  const {
    enrollMfa,
    confirmMfaEnrollment,
    disableMfa,
    getMfaFactors,
    error,
    clearError
  } = useAuthStore()

  const [factors, setFactors] = useState<MfaFactor[]>([])
  const [step, setStep] = useState<'idle' | 'enroll' | 'confirm' | 'done' | 'disable-verify'>('idle')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    loadFactors()
  }, [])

  async function loadFactors() {
    clearError()
    const list = await getMfaFactors()
    setFactors(list)
  }

  function resetEnrollmentState() {
    setStep('idle')
    setQrCode('')
    setSecret('')
    setFactorId('')
    setCode('')
  }

  const verifiedFactor = factors.find(f => f.status === 'verified')

  // ── Start enrollment ─────────────────────────────────────────────────
  async function handleEnroll() {
    setLoading(true)
    clearError()
    setMsg(null)

    const result = await enrollMfa()

    if (!result) {
      setMsg({ type: 'err', text: 'Failed to start enrollment' })
      resetEnrollmentState()
    } else {
      setQrCode(result.qrCode)
      setSecret(result.secret)
      setFactorId(result.factorId)
      setCode('')
      setStep('enroll')
    }

    setLoading(false)
  }

  // ── Confirm enrollment ────────────────────────────────────────────────
  async function handleConfirm() {
    if (code.length < 6 || !factorId) return

    setLoading(true)
    clearError()
    setMsg(null)

    await confirmMfaEnrollment(factorId, code)

    // Reload factors after verification and trust the resulting source of truth
    const list = await getMfaFactors()
    setFactors(list)

    const nowVerified = list.find(f => f.status === 'verified' && f.id === factorId)

    if (nowVerified) {
      setStep('done')
      setMsg({ type: 'ok', text: '2FA enabled successfully' })
      setCode('')
    } else {
      setMsg({ type: 'err', text: error || 'Invalid code — check your authenticator app and try again' })
    }

    setLoading(false)
  }

  // ── Disable 2FA — step 1: show TOTP code input ───────────────────────
  function handleDisableClick() {
    if (!verifiedFactor) return
    clearError()
    setMsg(null)
    setDisableCode('')
    setStep('disable-verify')
  }

  // ── Disable 2FA — step 2: verify code then unenroll ──────────────────
  async function handleDisableConfirm() {
    if (!verifiedFactor || disableCode.length < 6) return

    setLoading(true)
    clearError()
    setMsg(null)

    try {
      await disableMfa(verifiedFactor.id, disableCode)
      await loadFactors()
      setMsg({ type: 'ok', text: '2FA disabled' })
      resetEnrollmentState()
      setDisableCode('')
    } catch {
      // error already set in the store
    }

    setLoading(false)
  }

  return (
    <div style={{ borderTop: '0.5px solid var(--lp-border)', paddingTop: 16, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--lp-text)' }}>
            Two-factor authentication
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 2 }}>
            {verifiedFactor
              ? '🟢 Enabled — your account is protected'
              : '⚪ Not enabled — add an extra layer of security'}
          </div>
        </div>

        {verifiedFactor ? (
          <button
            onClick={handleDisableClick}
            disabled={loading || step === 'disable-verify'}
            style={{
              fontSize: 12,
              padding: '5px 12px',
              borderRadius: 7,
              cursor: 'pointer',
              background: 'rgba(239,68,68,0.07)',
              border: '0.5px solid rgba(239,68,68,0.25)',
              color: '#ef4444',
              fontFamily: 'inherit',
              opacity: (loading || step === 'disable-verify') ? 0.5 : 1
            }}
          >
            Disable
          </button>
        ) : step === 'idle' ? (
          <button
            onClick={handleEnroll}
            disabled={loading}
            style={{
              fontSize: 12,
              padding: '5px 12px',
              borderRadius: 7,
              cursor: 'pointer',
              background: 'rgba(34,197,94,0.07)',
              border: '0.5px solid rgba(34,197,94,0.25)',
              color: '#22c55e',
              fontFamily: 'inherit',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? 'Loading…' : 'Enable 2FA'}
          </button>
        ) : null}
      </div>

      {(msg || error) && (
        <div
          style={{
            padding: '7px 12px',
            borderRadius: 7,
            fontSize: 12.5,
            marginBottom: 12,
            background:
              msg?.type === 'ok'
                ? 'rgba(34,197,94,0.08)'
                : 'rgba(239,68,68,0.08)',
            border: `0.5px solid ${
              msg?.type === 'ok'
                ? 'rgba(34,197,94,0.3)'
                : 'rgba(239,68,68,0.3)'
            }`,
            color: msg?.type === 'ok' ? '#22c55e' : '#ef4444'
          }}
        >
          {msg?.text ?? error}
        </div>
      )}

      {/* Disable 2FA — TOTP verification */}
      {step === 'disable-verify' && (
        <div
          style={{
            padding: '16px',
            borderRadius: 10,
            background: 'rgba(239,68,68,0.04)',
            border: '0.5px solid rgba(239,68,68,0.2)',
            marginTop: 8
          }}
        >
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginBottom: 12 }}>
            Enter your current authenticator code to confirm disabling 2FA.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="lp-input"
              maxLength={6}
              placeholder="000000"
              value={disableCode}
              autoFocus
              onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
              style={{ fontFamily: 'monospace', letterSpacing: '0.15em', flex: 1 }}
            />
            <button
              onClick={handleDisableConfirm}
              disabled={loading || disableCode.length < 6}
              style={{
                fontSize: 12,
                padding: '0 14px',
                borderRadius: 7,
                cursor: 'pointer',
                background: 'rgba(239,68,68,0.12)',
                border: '0.5px solid rgba(239,68,68,0.4)',
                color: '#ef4444',
                fontFamily: 'inherit',
                opacity: (loading || disableCode.length < 6) ? 0.5 : 1
              }}
            >
              {loading ? '…' : 'Confirm Disable'}
            </button>
          </div>
          <button
            onClick={() => { setStep('idle'); setDisableCode(''); clearError(); setMsg(null) }}
            style={{
              marginTop: 8,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--lp-text-muted)',
              fontFamily: 'inherit'
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* QR Code setup */}
      {step === 'enroll' && (
        <div
          style={{
            padding: '16px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid var(--lp-border)'
          }}
        >
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
            1. Open <strong style={{ color: 'var(--lp-text)' }}>Google Authenticator</strong> or <strong style={{ color: 'var(--lp-text)' }}>Authy</strong><br />
            2. Tap + → Scan QR code<br />
            3. Enter the 6-digit code below to confirm
          </div>

          {/* QR Code */}
          {qrCode && (
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <img
                src={qrCode}
                alt="2FA QR Code"
                style={{
                  width: 160,
                  height: 160,
                  imageRendering: 'pixelated',
                  background: '#fff',
                  padding: 8,
                  borderRadius: 8
                }}
              />
            </div>
          )}

          {/* Manual secret */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginBottom: 4 }}>
              Or enter this key manually:
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                letterSpacing: '0.1em',
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--lp-text-muted)',
                userSelect: 'text',
                wordBreak: 'break-all'
              }}
            >
              {secret}
            </div>
          </div>

          {/* Verification code input */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
              Enter the 6-digit code to confirm
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="lp-input"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                style={{ fontFamily: 'monospace', letterSpacing: '0.15em', flex: 1 }}
              />
              <button
                onClick={handleConfirm}
                disabled={loading || code.length < 6}
                className="lp-btn lp-btn-primary"
                style={{ padding: '0 16px' }}
              >
                {loading ? '…' : 'Verify'}
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              clearError()
              setMsg(null)
              resetEnrollmentState()
            }}
            style={{
              marginTop: 10,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--lp-text-muted)',
              fontFamily: 'inherit'
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}