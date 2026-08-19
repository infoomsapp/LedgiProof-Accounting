// PATH: src/components/chat/OpenReviewDialog.tsx
//
// Modal that opens a FORMAL REVIEW on a transaction.
// Flow:
//   1. Bookkeeper picks a question type (personal_vs_business, missing_receipt, ...)
//   2. A suggested message body is pre-filled from REVIEW_QUESTION_TYPES
//   3. Bookkeeper can edit the body, pick expiry hours (default 72h)
//   4. Submit → openReviewWithMessage RPC → creates review + sends 1st message
//
// Differences vs a regular chat message:
//   - Creates a row in transaction_reviews with a deadline
//   - Marks the conversation as "in_review"
//   - Audit-trail-grade record of the inquiry
//   - 72h auto-expiry if no client response

import { useState, useEffect } from 'react'
import Modal              from '../ui/modal'
import Button             from '../ui/Button'
import SemaphoreSpinner   from '../ui/SemaphoreSpinner'
import { openReviewWithMessage } from '../../services/chat-tx.service'
import {
  REVIEW_QUESTION_TYPES,
  REVIEW_EXPIRY_OPTIONS,
  DEFAULT_REVIEW_EXPIRY_HOURS,
  type ReviewQuestionType
} from '../../types/reviews'

interface Props {
  open:            boolean
  transactionId:   string
  orgId:           string
  /** Optional: client's user_id to explicitly assign the review */
  assignedTo?:     string
  onClose:         () => void
  /** Called after the review is created successfully */
  onCreated?:      (result: { review_id: string }) => void
}

export default function OpenReviewDialog({
  open,
  transactionId,
  orgId,
  assignedTo,
  onClose,
  onCreated
}: Props) {

  const [questionType, setQuestionType] = useState<ReviewQuestionType>('personal_vs_business')
  const [body,         setBody]         = useState('')
  const [expiryHours,  setExpiryHours]  = useState<number>(DEFAULT_REVIEW_EXPIRY_HOURS)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // When question type changes, refresh suggested body (unless user already edited)
  const [bodyTouched, setBodyTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    // Reset state every time the modal opens
    setQuestionType('personal_vs_business')
    setBody(REVIEW_QUESTION_TYPES[0]?.defaultBody ?? '')
    setExpiryHours(DEFAULT_REVIEW_EXPIRY_HOURS)
    setBodyTouched(false)
    setError(null)
    setSubmitting(false)
  }, [open])

  useEffect(() => {
    if (bodyTouched) return    // don't overwrite user edits
    const cfg = REVIEW_QUESTION_TYPES.find(q => q.key === questionType)
    if (cfg) setBody(cfg.defaultBody)
  }, [questionType, bodyTouched])

  async function handleSubmit() {
    setError(null)
    const trimmed = body.trim()
    if (trimmed.length === 0) {
      setError('Please enter a question for the client.')
      return
    }
    setSubmitting(true)
    try {
      const result = await openReviewWithMessage({
        transactionId,
        orgId,
        question:      trimmed,
        questionType,
        ...(assignedTo !== undefined ? { assignedTo } : {}),
        expiresHours:  expiryHours
      })
      onCreated?.(result)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Could not open the review.')
    } finally {
      setSubmitting(false)
    }
  }

  const currentCfg = REVIEW_QUESTION_TYPES.find(q => q.key === questionType)

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Open formal review"
      subtitle="Ask the client a categorized question with a response deadline."
      width={560}
      footer={
        <>
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={submitting || body.trim().length === 0}
          >
            {submitting
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <SemaphoreSpinner size="sm" inline />
                  Opening review…
                </span>
              : <>Send review →</>
            }
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ── Question type picker ─────────────────────────────────────── */}
        <div>
          <div style={labelStyle}>Question type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {REVIEW_QUESTION_TYPES.map(cfg => {
              const active = cfg.key === questionType
              return (
                <button
                  key={cfg.key}
                  type="button"
                  onClick={() => setQuestionType(cfg.key)}
                  disabled={submitting}
                  style={{
                    display:      'flex',
                    alignItems:   'flex-start',
                    gap:          10,
                    padding:      '9px 12px',
                    borderRadius: 8,
                    background:   active
                                    ? 'rgba(59,130,246,0.10)'
                                    : 'rgba(255,255,255,0.02)',
                    border:       active
                                    ? '0.5px solid rgba(59,130,246,0.40)'
                                    : '0.5px solid var(--lp-border)',
                    cursor:       submitting ? 'not-allowed' : 'pointer',
                    fontFamily:   'inherit',
                    textAlign:    'left',
                    transition:   'all 0.12s'
                  }}
                >
                  <span style={{ fontSize: 18, marginTop: 1 }}>{cfg.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500,
                      color: active ? '#bfdbfe' : 'var(--lp-text)',
                      marginBottom: 2
                    }}>
                      {cfg.label}
                    </div>
                    <div style={{
                      fontSize: 11.5,
                      color: 'var(--lp-text-muted)',
                      lineHeight: 1.4
                    }}>
                      {cfg.description}
                    </div>
                  </div>
                  {active && (
                    <span style={{
                      color: '#3b82f6', fontSize: 14, marginTop: 2
                    }}>
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Body textarea ────────────────────────────────────────────── */}
        <div>
          <div style={labelStyle}>
            Message to the client
            {bodyTouched && (
              <span style={{
                marginLeft: 8, fontSize: 10.5, color: 'var(--lp-text-muted)',
                fontWeight: 400, fontStyle: 'italic'
              }}>
                (edited)
              </span>
            )}
          </div>
          <textarea
            value={body}
            onChange={e => {
              setBody(e.target.value)
              if (!bodyTouched) setBodyTouched(true)
            }}
            disabled={submitting}
            rows={5}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid var(--lp-border)',
              color: 'var(--lp-text)',
              fontSize: 12.5,
              fontFamily: 'inherit',
              lineHeight: 1.55,
              resize: 'vertical',
              outline: 'none',
              transition: 'border-color 0.15s',
              opacity: submitting ? 0.5 : 1
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.45)' }}
            onBlur={e =>  { e.currentTarget.style.borderColor = 'var(--lp-border)' }}
          />
          <div style={{
            marginTop: 4, fontSize: 10.5,
            color: 'var(--lp-text-muted)',
            display: 'flex', justifyContent: 'space-between'
          }}>
            <span>{currentCfg && `Suggested template: ${currentCfg.label}`}</span>
            <span>{body.length} chars</span>
          </div>
        </div>

        {/* ── Expiry selector ─────────────────────────────────────────── */}
        <div>
          <div style={labelStyle}>Response deadline</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {REVIEW_EXPIRY_OPTIONS.map(opt => {
              const active = opt.hours === expiryHours
              return (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => setExpiryHours(opt.hours)}
                  disabled={submitting}
                  style={{
                    fontSize: 11.5,
                    padding: '5px 12px',
                    borderRadius: 100,
                    border: active
                      ? '0.5px solid rgba(245,158,11,0.40)'
                      : '0.5px solid var(--lp-border)',
                    background: active
                      ? 'rgba(245,158,11,0.10)'
                      : 'transparent',
                    color: active ? '#f59e0b' : 'var(--lp-text-muted)',
                    fontWeight: active ? 500 : 400,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.12s'
                  }}
                >
                  ⏰ {opt.label}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--lp-text-muted)' }}>
            If the client doesn't respond by then, the review automatically expires
            and you can escalate.
          </div>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && (
          <div style={{
            padding: '8px 12px',
            background: 'rgba(239,68,68,0.08)',
            border: '0.5px solid rgba(239,68,68,0.30)',
            borderRadius: 7,
            color: '#ef4444', fontSize: 12
          }}>
            ⚠ {error}
          </div>
        )}

      </div>
    </Modal>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--lp-text-muted)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 8
}
