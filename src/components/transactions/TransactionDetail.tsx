// src/components/transactions/TransactionDetail.tsx

import { useState, useEffect } from 'react'
//
// CSS-TODO (file-level): remaining are unique alphas. #334155 (slate-700, 4 occurrences) needs --lp-text-stronger var. rgba(255,255,255,0.02) and rgba(71,85,105,0.06) are dark-mode generic overlays. Direct mappings migrated.
//
import type { Transaction }      from '../../types/database.types'
import SemaphoreBadge            from '../semaphore/SemaphoreBadge'
import { useTransactionHistory } from '../../hooks/useTransactions'
import { useAuditTrail }         from '../../hooks/useAuditEvents'
import ChatPanel                 from '../chat/chatpanel'
import OpenReviewDialog          from '../chat/OpenReviewDialog'
import AccountAssignment         from './AccountAssignment'
import VendorAssignmentSection   from '../vendors/VendorAssignmentSection'
import UploadReceiptDialog       from '../upload/UploadReceiptDialog'
import { getCGCBadgeConfig }     from '../../services/cgc.service'
import { openOrGetTransactionConversation, sendTransactionMessage } from '../../services/chat-tx.service'
import { db }                    from '../../lib/supabase'
import { formatCurrency }        from '../../lib/currency'

interface TransactionDetailProps {
  transaction: Transaction
  orgId:       string
  onClose:     () => void
}

type Tab = 'details' | 'history' | 'audit' | 'journal' | 'governance'

function fmt(n: number, currency: string) {
  return formatCurrency(n, currency)
}

export default function TransactionDetail({ transaction: tx, orgId, onClose }: TransactionDetailProps) {
  const [tab, setTab] = useState<Tab>('details')

  // 🆕 P3: upload-doc state for this transaction
  const [uploadOpen,  setUploadOpen]  = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Formal review (deadline-tracked, audit-grade inquiry) on this transaction.
  // Complements the free chat below: opens a transaction_reviews row + first
  // question with a 72h expiry, via open_review_with_message.
  const [reviewOpen, setReviewOpen] = useState(false)

  const { data: history }   = useTransactionHistory(tx.transaction_group_id)
  const { data: auditTrail } = useAuditTrail(tx.transaction_group_id, orgId)

  const canChat = tx.semaphore === 'amber' || tx.semaphore === 'red'

  // 🆕 P3: after the document is uploaded, open/get the conversation for this
  // transaction and post a 'document' message so it shows in the chat thread.
  async function handleUploaded(documentId: string) {
    setUploadOpen(false)
    setUploadError(null)
    try {
      const conversationId = await openOrGetTransactionConversation(tx.id)
      await sendTransactionMessage({
        conversationId,
        body:           '📎 Document attached',
        documentId,
        messageKind:    'out'
      })
    } catch (e: any) {
      setUploadError(e?.message ?? 'Document uploaded, but could not post to chat.')
    }
  }

  return (
    <div style={{
      position:    'fixed',
      top: 0, right: 0, bottom: 0,
      width:       520,
      background:  'var(--lp-surface)',
      borderLeft:  '0.5px solid var(--lp-border)',
      display:     'flex',
      flexDirection: 'column',
      zIndex:      100,
      boxShadow:   '-8px 0 32px rgba(0,0,0,0.4)'
    }}>

      {/* Header */}
      <div style={{
        padding:      '16px 20px',
        borderBottom: '0.5px solid var(--lp-border)',
        display:      'flex',
        alignItems:   'center',
        gap:          12
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <SemaphoreBadge status={tx.semaphore} />
            <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
              v{tx.version}
            </span>
            {tx.locked_at && (
              <span style={{ fontSize: 11, color: 'var(--sem-green)' }}>● Locked</span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--lp-text)' }}>
            {fmt(tx.amount, tx.currency)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 2 }}>
            {tx.transaction_date} · {tx.source}
          </div>
        </div>

        {/* 🆕 P3: 📎 Attach document — always visible, scoped to this transaction */}
        <button
          onClick={() => { setUploadError(null); setUploadOpen(true) }}
          title="Attach a document to this transaction"
          style={{
            background:   'var(--lp-accent)',
            border:       '0.5px solid var(--lp-accent)',
            color:        '#fff',
            borderRadius: 8,
            padding:      '0 12px',
            height:       30,
            display:      'flex',
            alignItems:   'center',
            gap:          6,
            cursor:       'pointer',
            fontSize:     12,
            fontWeight:   600,
            fontFamily:   'inherit',
            whiteSpace:   'nowrap'
          }}
        >
          📎 Attach
        </button>

        <button
          onClick={onClose}
          style={{
            background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)',
            color: 'var(--lp-text-muted)', borderRadius: 8, width: 30, height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 14
          }}
        >✕</button>
      </div>

      {/* 🆕 P3: inline error if posting the doc to chat failed */}
      {uploadError && (
        <div style={{
          padding:      '8px 16px',
          background:   'var(--sem-red-bg)',
          color:        'var(--sem-red)',
          fontSize:     12,
          borderBottom: '0.5px solid var(--lp-border)'
        }}>
          ⚠ {uploadError}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '0.5px solid var(--lp-border)',
        padding: '0 20px'
      }}>
        {(['details', 'history', 'audit', 'journal', 'governance'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:    '10px 14px',
            fontSize:   12.5,
            fontWeight: tab === t ? 500 : 400,
            color:      tab === t ? 'var(--lp-text)' : 'var(--lp-text-muted)',
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            borderBottom: tab === t ? '2px solid var(--lp-accent)' : '2px solid transparent',
            textTransform: 'capitalize'
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

        {/* Details tab */}
        {tab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Group ID',    tx.transaction_group_id.slice(0, 16) + '…'],
              ['Reference',   tx.reference ?? '—'],
              ['Description', tx.description ?? '—'],
              ['Amount',      fmt(tx.amount, tx.currency)],
              ['Currency',    tx.currency],
              ['Source',      tx.source],
              ['Date',        tx.transaction_date],
              ['Semaphore',   tx.semaphore],
              ['Status reason', tx.status_reason ?? '—'],
              ['Version',     `v${tx.version}`],
              ['Created at',  new Date(tx.created_at).toLocaleString()],
              ['Locked at',   tx.locked_at ? new Date(tx.locked_at).toLocaleString() : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '9px 0', borderBottom: '0.5px solid var(--lp-border)',
                gap: 12
              }}>
                <span style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', flexShrink: 0 }}>{k}</span>
                <span style={{
                  fontSize: 12.5, color: 'var(--lp-text)', textAlign: 'right',
                  fontFamily: k?.includes('ID') || k === 'Reference' ? 'monospace' : undefined,
                  wordBreak: 'break-all'
                }}>{v}</span>
              </div>
            ))}

            {/* Hashes */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Hash chain
              </div>
              {[
                ['Raw hash',   tx.raw_hash],
                ['Final hash', tx.final_hash ?? '—']
              ].map(([k, v]) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginBottom: 3 }}>{k}</div>
                  <div style={{
                    fontSize: 10.5, fontFamily: 'monospace', color: 'var(--lp-text-muted)',
                    wordBreak: 'break-all', background: 'rgba(255,255,255,0.03)',
                    padding: '6px 8px', borderRadius: 6, border: '0.5px solid var(--lp-border)'
                  }}>
                    {v}
                  </div>
                </div>
              ))}
            </div>

            {/* Payee (1099 vendor) — assign + learn merchant→vendor */}
            <VendorAssignmentSection
              transaction={tx}
              orgId={orgId}
              onAssigned={() => window.dispatchEvent(new CustomEvent('lp:tx-updated', { detail: tx.id }))}
            />
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(history ?? []).map(h => (
              <div key={h.id} style={{
                padding: '10px 12px', borderRadius: 8,
                background: h.is_current ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)',
                border: `0.5px solid ${h.is_current ? 'rgba(59,130,246,0.25)' : 'var(--lp-border)'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--lp-text-muted)' }}>
                    v{h.version}
                  </span>
                  <SemaphoreBadge status={h.semaphore} size="sm" />
                  {h.is_current && (
                    <span style={{ fontSize: 10, color: 'var(--lp-accent)' }}>current</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--lp-text)' }}>{fmt(h.amount, h.currency)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                  {new Date(h.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Audit tab */}
        {tab === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(auditTrail ?? []).length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', padding: '16px 0' }}>
                No audit events yet.
              </div>
            )}
            {(auditTrail ?? []).map((evt, i) => {
              const isCGC    = evt.event_type === 'cgc_override'
              const cgcMeta  = isCGC ? (evt.metadata as any) : null
              const cgcBadge = isCGC
                ? getCGCBadgeConfig(cgcMeta?.cgc_mode, cgcMeta?.approved)
                : null

              return (
                <div key={evt.id} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: isCGC
                    ? 'rgba(167,139,250,0.05)'
                    : 'rgba(255,255,255,0.02)',
                  border: isCGC
                    ? '0.5px solid rgba(167,139,250,0.25)'
                    : '0.5px solid var(--lp-border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--lp-text-muted)', fontFamily: 'monospace' }}>
                      {String(i + 1).padStart(3, '0')}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 100,
                      background: isCGC ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.05)',
                      color: isCGC ? 'var(--lp-violet)' : 'var(--lp-text-muted)',
                      border: isCGC ? '0.5px solid rgba(167,139,250,0.3)' : '0.5px solid var(--lp-border)',
                      textTransform: 'uppercase', letterSpacing: '0.04em'
                    }}>
                      {evt.event_type}
                    </span>
                    {/* CGC badge */}
                    {cgcBadge && (
                      <span style={{
                        fontSize: 10.5, padding: '2px 7px', borderRadius: 100,
                        color: cgcBadge.color, background: cgcBadge.bg,
                        border: `0.5px solid ${cgcBadge.border}`, fontWeight: 600
                      }}>
                        {cgcBadge.icon} {cgcBadge.label}
                      </span>
                    )}
                  </div>

                  {/* CGC proof details */}
                  {cgcMeta && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginBottom: 3 }}>
                        {cgcMeta.explanation}
                      </div>
                      {cgcMeta.policy_violations?.length > 0 && (
                        <div style={{ fontSize: 11.5, color: 'var(--sem-amber)' }}>
                          ⚠ {cgcMeta.policy_violations[0]}
                        </div>
                      )}
                      <div style={{ fontSize: 10.5, color: '#334155', marginTop: 2 }}>
                        Confidence: {((cgcMeta.confidence ?? 0) * 100).toFixed(0)}% ·
                        Mode: {cgcMeta.cgc_mode} ·
                        v{cgcMeta.cgc_version}
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
                    {new Date(evt.created_at).toLocaleString()}
                  </div>
                  <div style={{
                    fontSize: 10.5, fontFamily: 'monospace', color: '#334155',
                    marginTop: 4, wordBreak: 'break-all'
                  }}>
                    {evt.entry_hash}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Journal tab */}
        {tab === 'journal' && (
          <AccountAssignment
            transaction={tx}
            orgId={orgId}
            onPosted={() => {
              // refresh parent list so semaphore turns blue
              window.dispatchEvent(new CustomEvent('lp:tx-updated', { detail: tx.id }))
            }}
          />
        )}

        {/* Governance tab — CGC validation + human decisions chain */}
        {tab === 'governance' && (
          <GovernanceTab transactionId={tx.id} orgId={orgId} />
        )}
      </div>

      {/* Chat panel — only for amber and red */}
      {canChat && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0' }}>
            <button
              type="button"
              className="lp-btn lp-btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => setReviewOpen(true)}
            >
              Solicitar aclaración formal
            </button>
          </div>
          <ChatPanel
            transaction={tx}
            orgId={orgId}
          />
        </>
      )}

      {/* Formal review dialog — opens a deadline-tracked, audited inquiry that
          sits on top of the same conversation as the chat above. assignedTo is
          intentionally omitted: it expects the client's user_id, which the RPC
          resolves server-side; tx.client_id is the client record id, not a user. */}
      <OpenReviewDialog
        open={reviewOpen}
        transactionId={tx.id}
        orgId={orgId}
        onClose={() => setReviewOpen(false)}
        onCreated={() => setReviewOpen(false)}
      />

      {/* 🆕 P3: Upload dialog scoped to THIS transaction */}
      <UploadReceiptDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        orgId={orgId}
        clientId={(tx as any).client_id ?? undefined}
        transactionId={tx.id}
        onUploaded={handleUploaded}
      />
    </div>
  )
}

// ── Governance Tab ───────────────────────────────────────────────────────────
// Shows CGC Core validation result + Human-in-Loop decisions chain
// for this specific transaction.

interface CgcValidation {
  id:                  string
  proof_hash:          string | null
  validation_result:   string
  policies_checked:    number
  violations:          Array<{ policy: string; severity: string; message: string }>
  cgc_confidence:      number | null
  cgc_recommendation:  string | null
  cgc_engine_version:  string | null
  latency_ms:          number | null
  created_at:          string
}

interface Decision {
  id:             string
  decision_type:  string
  actor_role:     string
  reason:         string | null
  proof_hash:     string | null
  previous_hash:  string | null
  before_state:   Record<string, unknown>
  after_state:    Record<string, unknown>
  created_at:     string
  profiles?:      { display_name: string | null; lp_user_code: string | null }
}

function GovernanceTab({ transactionId, orgId }: { transactionId: string; orgId: string }) {
  const [cgc,       setCgc]       = useState<CgcValidation | null>(null)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      db.from('cgc_validations').select('*')
        .eq('transaction_id', transactionId).maybeSingle(),
      db.from('decisions')
        .select('*, profiles(display_name, lp_user_code)')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })
    ]).then(([c, d]) => {
      setCgc((c.data ?? null) as CgcValidation | null)
      setDecisions((d.data ?? []) as Decision[])
      setLoading(false)
    })
  }, [transactionId, orgId])

  if (loading) {
    return <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>Loading governance data…</div>
  }

  const resultColor: Record<string, { color: string; bg: string; icon: string }> = {
    approved:         { color: 'var(--sem-green)', bg: 'rgba(34,197,94,0.08)',  icon: '✓' },
    review_required:  { color: 'var(--sem-amber)', bg: 'rgba(245,158,11,0.08)', icon: '⚠' },
    rejected:         { color: 'var(--sem-red)', bg: 'var(--sem-red-bg)',  icon: '✗' },
    error:            { color: 'var(--lp-text-muted)', bg: 'rgba(148,163,184,0.08)',icon: '?' }
  }

  const decisionColor: Record<string, string> = {
    approve:   'var(--sem-green)',
    override:  'var(--sem-amber)',
    reject:    'var(--sem-red)',
    escalate:  'var(--lp-violet)',
    lock:      'var(--lp-accent)',
    reconcile: 'var(--lp-accent)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── CGC Validation Card ───────────────────────────────────────── */}
      {cgc ? (
        <div style={{
          padding: '14px 16px', borderRadius: 10,
          background: resultColor[cgc.validation_result]?.bg ?? 'rgba(71,85,105,0.06)',
          border: `0.5px solid ${resultColor[cgc.validation_result]?.color ?? 'var(--lp-text-muted)'}40`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 15, fontWeight: 700,
                color: resultColor[cgc.validation_result]?.color ?? 'var(--lp-text-muted)'
              }}>
                {resultColor[cgc.validation_result]?.icon} CGC {cgc.validation_result.replace('_', ' ')}
              </span>
            </div>
            {cgc.cgc_confidence != null && (
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: resultColor[cgc.validation_result]?.color ?? 'var(--lp-text-muted)',
                fontFamily: 'monospace'
              }}>
                {Math.round(cgc.cgc_confidence * 100)}% conf
              </span>
            )}
          </div>

          {cgc.cgc_recommendation && (
            <div style={{ fontSize: 12.5, color: 'var(--lp-border-2)', marginBottom: 10, lineHeight: 1.6 }}>
              {cgc.cgc_recommendation}
            </div>
          )}

          {/* Violations */}
          {cgc.violations?.length > 0 && (
            <div style={{ marginTop: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 6 }}>
                Policy violations ({cgc.violations.length})
              </div>
              {cgc.violations.map((v, i) => (
                <div key={i} style={{
                  fontSize: 12, padding: '6px 10px', marginBottom: 4, borderRadius: 6,
                  background: 'rgba(0,0,0,0.15)',
                  borderLeft: `2px solid ${v.severity === 'critical' || v.severity === 'error'
                    ? 'var(--sem-red)' : v.severity === 'warning' ? 'var(--sem-amber)' : 'var(--lp-accent)'}`
                }}>
                  <div style={{ color: 'var(--lp-text)', fontWeight: 500, marginBottom: 2 }}>
                    {v.policy}
                  </div>
                  <div style={{ color: 'var(--lp-text-muted)', fontSize: 11.5, lineHeight: 1.5 }}>
                    {v.message}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Proof hash */}
          {cgc.proof_hash && (
            <div style={{
              padding: '6px 10px', borderRadius: 6,
              background: 'rgba(0,0,0,0.2)',
              fontFamily: 'monospace', fontSize: 10, color: 'var(--lp-text-muted)',
              wordBreak: 'break-all', lineHeight: 1.5
            }}>
              <div style={{ fontSize: 9, color: '#334155', marginBottom: 2,
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Proof-of-Decision Hash
              </div>
              {cgc.proof_hash}
            </div>
          )}

          {/* Engine metadata */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10,
            fontSize: 11, color: 'var(--lp-text-muted)' }}>
            {cgc.cgc_engine_version && <span>Engine: {cgc.cgc_engine_version}</span>}
            {cgc.latency_ms != null && <span>Latency: {cgc.latency_ms}ms</span>}
            <span>Policies: {cgc.policies_checked}</span>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '14px 16px', borderRadius: 10,
          background: 'rgba(71,85,105,0.06)',
          border: '0.5px dashed var(--lp-border)',
          textAlign: 'center', fontSize: 12.5, color: 'var(--lp-text-muted)'
        }}>
          No CGC validation recorded for this transaction yet.
        </div>
      )}

      {/* ── Human-in-Loop Decisions Chain ─────────────────────────────── */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 8 }}>
          Human-in-Loop Decisions ({decisions.length})
        </div>

        {decisions.length === 0 ? (
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '0.5px dashed var(--lp-border)',
            fontSize: 12, color: 'var(--lp-text-muted)', textAlign: 'center'
          }}>
            No human decisions recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {decisions.map(d => (
              <div key={d.id} style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                border: '0.5px solid var(--lp-border)',
                borderLeft: `3px solid ${decisionColor[d.decision_type] ?? 'var(--lp-text-muted)'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100,
                    color: decisionColor[d.decision_type] ?? 'var(--lp-text-muted)',
                    background: `${decisionColor[d.decision_type] ?? 'var(--lp-text-muted)'}18`,
                    border: `0.5px solid ${decisionColor[d.decision_type] ?? 'var(--lp-text-muted)'}40`,
                    textTransform: 'uppercase', letterSpacing: '0.04em'
                  }}>
                    {d.decision_type}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--lp-text-muted)' }}>
                    {new Date(d.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: 'var(--lp-border-2)', marginBottom: 4 }}>
                  {d.profiles?.display_name ?? 'Unknown'}
                  {d.profiles?.lp_user_code && (
                    <span style={{ fontFamily: 'monospace', fontSize: 10,
                      color: 'var(--lp-text-muted)', marginLeft: 6 }}>
                      {d.profiles.lp_user_code}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginLeft: 6 }}>
                    · as {d.actor_role}
                  </span>
                </div>

                {d.reason && (
                  <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)',
                    fontStyle: 'italic', marginBottom: 4 }}>
                    "{d.reason}"
                  </div>
                )}

                {d.proof_hash && (
                  <div style={{ fontFamily: 'monospace', fontSize: 9.5,
                    color: '#334155', wordBreak: 'break-all', marginTop: 3 }}>
                    {d.proof_hash.slice(0, 32)}…
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Trust chain indicator ──────────────────────────────────────── */}
      {decisions.length > 0 && (
        <div style={{
          padding: '8px 12px', borderRadius: 7,
          background: 'rgba(34,197,94,0.05)',
          border: '0.5px solid rgba(34,197,94,0.2)',
          fontSize: 11.5, color: 'var(--sem-green)',
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          🔗 This transaction is part of an immutable decision chain ({decisions.length} link{decisions.length !== 1 ? 's' : ''})
        </div>
      )}
    </div>
  )
}