// PATH: src/pages/EstimateEdit.tsx
//
// CSS-TODO (file-level): remaining are unique alphas + #1a1f2e (dark print background) + box-shadows rgba(0,0,0,0.6). Direct mappings migrated.
//
//
// REFACTOR v32 (CSS Sprint Mensaje 2):
//   · Top bar buttons → .lp-btn variants (back, print, send, convert, delete)
//   · Send/Convert gradients eliminados → .lp-btn-primary directo
//   · Inputs (title, scope, dates, textareas) → .lp-input / textarea.lp-input
//   · Section titles → .lp-section-label
//   · Error banner → .lp-banner.error
//   · Locked badge → .est-badge pattern adaptado (kept inline porque "locked"
//     no es status — es flag derivado)
//   · Add line button → .lp-btn.lp-btn-ghost (small)
//   · Eliminados helpers: inputStyle, primaryBtn, ghostBtn, addBtn, sectionTitle
//   · ConfirmDialog: usa var(--lp-*) consistente
//
// Layout 100% preservado: top bar + 2-pane grid (form + print preview).
// Logic 100% preservada.

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useEstimateBundle,
  useDeleteEstimate,
  useConvertEstimateToInvoice
} from '../hooks/useEstimates'
import { useEstimateDraft } from '../hooks/useEstimateDraft'
import { useScope } from '../hooks/useScope'
import { db } from '../lib/supabase'

import LineItemRow, { LineItemHeader } from '../components/estimates/LineItemRow'
import EstimateStatusBadge             from '../components/estimates/EstimateStatusBadge'
import EstimatePrint                    from '../components/estimates/EstimatePrint'
import SendEstimateDialog               from '../components/estimates/SendEstimateDialog'
import EstimateActivityPanel            from '../components/estimates/EstimateActivityPanel'
import SemaphoreSpinner                 from '../components/ui/SemaphoreSpinner'
import Icon                             from '../components/ui/Icon'
import { type Estimate } from '../types/estimate'
import { formatCurrency } from '../lib/currency'

export default function EstimateEdit() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  // 🆕 Client Switcher Sprint 3 Paso 2 — scope-aware navigation.
  // Back-links and conversion targets respect firm-client URL prefix.
  const scope    = useScope()
  const backToList   = scope.clientId
    ? `/clients/${scope.clientId}/estimates`
    : '/estimates'
  const invoicesPath = scope.clientId
    ? `/clients/${scope.clientId}/invoices`
    : '/invoices'

  const bundle   = useEstimateBundle(id)
  const estimate = bundle.data?.estimate
  const items    = bundle.data?.items ?? []

  // ── Load org + client info for the preview ─────────────────────────────
  const [orgInfo,    setOrgInfo]    = useState<{ name: string; business_type?: string | null; principal_business?: string | null; business_code?: string | null } | null>(null)
  const [clientInfo, setClientInfo] = useState<{ name: string; email: string | null } | null>(null)

  useEffect(() => {
    if (!estimate) return
    let cancelled = false

    Promise.all([
      db.from('organizations')
        .select('name, business_type, principal_business, business_code')
        .eq('id', estimate.org_id)
        .maybeSingle<{ name: string; business_type: string | null; principal_business: string | null; business_code: string | null }>(),
      db.from('clients')
        .select('name, email')
        .eq('id', estimate.client_id)
        .maybeSingle<{ name: string; email: string | null }>()
    ]).then(([orgRes, clientRes]) => {
      if (cancelled) return
      if (orgRes.error)    console.error('[EstimateEdit] Could not load org info:', orgRes.error)
      if (clientRes.error) console.error('[EstimateEdit] Could not load client info:', clientRes.error)
      if (orgRes.data)     setOrgInfo(orgRes.data)
      if (clientRes.data)  setClientInfo(clientRes.data)
    })

    return () => { cancelled = true }
  }, [estimate?.org_id, estimate?.client_id])

  // ── Draft state for items ───────────────────────────────────────────────
  const draft = useEstimateDraft(id ?? '', items)

  // ── Header-level inline state ───────────────────────────────────────────
  const [titleDraft,   setTitleDraft]   = useState('')
  const [scopeDraft,   setScopeDraft]   = useState('')
  const [notesDraft,   setNotesDraft]   = useState('')
  const [termsDraft,   setTermsDraft]   = useState('')
  const [validUntil,   setValidUntil]   = useState<string>('')
  const [headerSaving, setHeaderSaving] = useState(false)

  useEffect(() => {
    if (!estimate) return
    setTitleDraft(estimate.title ?? '')
    setScopeDraft(estimate.scope_description ?? '')
    setNotesDraft(estimate.notes ?? '')
    setTermsDraft(estimate.terms ?? '')
    setValidUntil(estimate.valid_until ?? '')
  }, [estimate?.id])

  async function flushHeader() {
    if (!estimate) return
    setHeaderSaving(true)
    try {
      await draft.patchEstimate({
        ...(titleDraft.trim() ? { title: titleDraft.trim() } : {}),
        ...(scopeDraft.trim() ? { scope_description: scopeDraft.trim() } : {}),
        ...(notesDraft.trim() ? { notes: notesDraft.trim() } : {}),
        ...(termsDraft.trim() ? { terms: termsDraft.trim() } : {}),
        valid_until: validUntil || null
      })
    } finally {
      setHeaderSaving(false)
    }
  }

  const deleteMut  = useDeleteEstimate(estimate?.org_id ?? '')
  const convertMut = useConvertEstimateToInvoice(estimate?.org_id ?? '')

  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [confirmConvert, setConfirmConvert] = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const readonly = estimate
    ? ['accepted', 'converted', 'cancelled', 'expired'].includes(estimate.status)
    : false
  const isDraft = estimate?.status === 'draft'

  async function handleDelete() {
    if (!estimate) return
    setError(null)
    try {
      await deleteMut.mutateAsync(estimate.id)
      navigate(backToList)
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete')
      setConfirmDelete(false)
    }
  }

  async function handleConvert() {
    if (!estimate) return
    setError(null)
    try {
      await draft.flush()
      const result = await convertMut.mutateAsync(estimate.id)
      navigate(`${invoicesPath}?highlight=${result.invoice_id}`)
    } catch (e: any) {
      setError(e?.message ?? 'Could not convert to invoice')
      setConfirmConvert(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  // ── Loading / error ─────────────────────────────────────────────────────
  if (bundle.isLoading) {
    return (
      <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
        <SemaphoreSpinner size="md" inline />
      </div>
    )
  }

  if (bundle.isError || !estimate) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚠</div>
        <div style={{ fontSize: 14, color: 'var(--sem-red)', marginBottom: 12 }}>
          Could not load this estimate.
        </div>
        <button
          onClick={() => navigate(backToList)}
          className="lp-btn lp-btn-ghost"
        >
          ← Back to list
        </button>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="lp-no-print" style={{
        padding: '14px 24px',
        borderBottom: '0.5px solid var(--lp-border)',
        background: 'var(--lp-surface)',
        display: 'flex', alignItems: 'center', gap: 12,
        flexWrap: 'wrap'
      }}>
        <button
          onClick={() => navigate(backToList)}
          className="lp-btn lp-btn-ghost lp-btn-sm"
        >
          ← Back
        </button>

        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--lp-text)',
          fontFamily: 'monospace',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          {estimate.estimate_number}
        </div>

        <EstimateStatusBadge status={estimate.status} />

        {readonly && (
          <span style={{
            fontSize: 10, color: 'var(--sem-amber)',
            background: 'var(--sem-amber-bg)',
            border: '0.5px solid var(--sem-amber-border)',
            padding: '2px 8px', borderRadius: 100,
            fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em'
          }}>
            <Icon name="lock" size={9} /> Locked
          </span>
        )}

        {draft.isSaving && (
          <span style={{
            fontSize: 11, color: 'var(--lp-accent)',
            display: 'flex', alignItems: 'center', gap: 5
          }}>
            <SemaphoreSpinner size="sm" inline /> Saving…
          </span>
        )}

        {headerSaving && (
          <span style={{ fontSize: 11, color: 'var(--lp-accent)' }}>
            Saving header…
          </span>
        )}

        {draft.hasError && (
          <span
            className="lp-banner error"
            style={{ fontSize: 11, padding: '3px 8px' }}
            title={draft.error ?? ''}
          >
            ⚠ Save error
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <button
          onClick={handlePrint}
          className="lp-btn lp-btn-ghost"
          title="Print / save as PDF"
        >
          <Icon name="print" size={13} /> Print
        </button>

        {!readonly && (
          <button
            onClick={() => setSendDialogOpen(true)}
            className="lp-btn lp-btn-primary"
          >
            <Icon name="send" size={13} /> Send
          </button>
        )}

        {estimate.status === 'accepted' && !estimate.converted_to_invoice_id && (
          <button
            onClick={() => setConfirmConvert(true)}
            className="lp-btn lp-btn-convert"
          >
            ↗ Convert to Invoice
          </button>
        )}

        {estimate.status === 'converted' && estimate.converted_to_invoice_id && (
          <button
            onClick={() => navigate(`${invoicesPath}?highlight=${estimate.converted_to_invoice_id}`)}
            className="lp-btn lp-btn-convert"
            style={{ background: 'transparent' }}
          >
            ↗ View Invoice
          </button>
        )}

        {isDraft && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="lp-btn lp-btn-danger"
            title="Delete this draft"
          >
            <Icon name="trash" size={13} /> Delete
          </button>
        )}
      </div>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="lp-no-print lp-banner error" style={{
          padding: '9px 24px',
          borderRadius: 0,
          justifyContent: 'space-between'
        }}>
          <span>⚠ {error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none', border: 'none',
              color: 'inherit', cursor: 'pointer'
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <EstimateActivityPanel estimateId={estimate.id} status={estimate.status} />

      {/* ── Two-pane content ──────────────────────────────────────────── */}
      <div
        className="lp-edit-grid"
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          overflow: 'hidden'
        }}
      >

        {/* ─── LEFT: form ──────────────────────────────────────────── */}
        <div className="lp-no-print" style={{
          overflowY: 'auto',
          padding: '20px 24px',
          borderRight: '0.5px solid var(--lp-border)'
        }}>

          {/* Details */}
          <div style={{ marginBottom: 22 }}>
            <div className="lp-section-label" style={{ fontSize: 11, letterSpacing: '0.07em' }}>
              Details
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field label="Title">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={flushHeader}
                  disabled={readonly}
                  placeholder="e.g. Electrical Service – Main Panel Upgrade"
                  className="lp-input"
                />
              </Field>

              <Field label="Scope of work">
                <textarea
                  value={scopeDraft}
                  onChange={e => setScopeDraft(e.target.value)}
                  onBlur={flushHeader}
                  disabled={readonly}
                  placeholder="Short summary of what's included…"
                  rows={3}
                  className="lp-input"
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Issue date">
                  <input
                    type="date"
                    value={estimate.issue_date}
                    disabled
                    className="lp-input"
                    style={{ opacity: 0.6 }}
                  />
                </Field>
                <Field label="Valid until">
                  <input
                    type="date"
                    value={validUntil ?? ''}
                    onChange={e => setValidUntil(e.target.value)}
                    onBlur={flushHeader}
                    disabled={readonly}
                    className="lp-input"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 22 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 10
            }}>
              <div className="lp-section-label" style={{ fontSize: 11, letterSpacing: '0.07em', margin: 0 }}>
                Items
              </div>
              {!readonly && (
                <button
                  onClick={() => draft.addItem({ description: '' })}
                  className="lp-btn lp-btn-ghost lp-btn-sm"
                  style={{
                    background: 'rgba(59,130,246,0.08)',
                    color: 'var(--lp-accent)',
                    border: '0.5px solid var(--sem-blue-border)'
                  }}
                >
                  + Add line
                </button>
              )}
            </div>

            <div style={{
              border: '0.5px solid var(--lp-border)',
              borderRadius: 8,
              overflow: 'hidden'
            }}>
              <LineItemHeader />
              {draft.items.length === 0 ? (
                <div style={{
                  padding: '24px 16px', textAlign: 'center',
                  color: 'var(--lp-text-muted)', fontSize: 12
                }}>
                  No items yet. Click "+ Add line" to start.
                </div>
              ) : (
                draft.items.map((it, idx) => (
                  <LineItemRow
                    key={it.localId}
                    item={it}
                    index={idx}
                    currency={estimate.currency}
                    onChange={patch => draft.updateItem(it.localId, patch)}
                    onRemove={() => draft.removeItem(it.localId)}
                    readonly={readonly}
                  />
                ))
              )}
            </div>

            {/* Totals */}
            <div style={{
              marginTop: 12, padding: 12,
              background: 'rgba(255,255,255,0.02)',
              border: '0.5px solid var(--lp-border)',
              borderRadius: 8,
              display: 'flex', flexDirection: 'column', gap: 4,
              fontSize: 12
            }}>
              <Total label="Subtotal" value={formatCurrency(draft.totals.subtotal, estimate.currency)} />
              {draft.totals.discount_total > 0 && (
                <Total
                  label="Discount"
                  value={`−${formatCurrency(draft.totals.discount_total, estimate.currency)}`}
                  accent="var(--lp-violet)"
                />
              )}
              {draft.totals.tax_total > 0 && (
                <Total label="Tax" value={formatCurrency(draft.totals.tax_total, estimate.currency)} />
              )}
              <div style={{
                borderTop: '0.5px solid var(--lp-border)',
                paddingTop: 6, marginTop: 2
              }}>
                <Total
                  label="Total"
                  value={`${formatCurrency(draft.totals.total, estimate.currency)} ${estimate.currency}`}
                  size="lg"
                  accent="var(--sem-green)"
                />
              </div>
            </div>
          </div>

          {/* Notes + Terms */}
          <div style={{ marginBottom: 22 }}>
            <div className="lp-section-label" style={{ fontSize: 11, letterSpacing: '0.07em' }}>
              Notes &amp; Terms
            </div>

            <Field label="Notes (visible to client)">
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                onBlur={flushHeader}
                disabled={readonly}
                placeholder="e.g. Thank you for your business…"
                rows={2}
                className="lp-input"
              />
            </Field>

            <div style={{ marginTop: 10 }}>
              <Field label="Terms & Conditions">
                <textarea
                  value={termsDraft}
                  onChange={e => setTermsDraft(e.target.value)}
                  onBlur={flushHeader}
                  disabled={readonly}
                  placeholder="Payment terms, warranties, etc."
                  rows={5}
                  className="lp-input"
                  style={{ fontSize: 11.5 }}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: preview ──────────────────────────────────────── */}
        <div className="lp-preview-pane" style={{
          overflowY: 'auto',
          background: '#1a1f2e',
          padding: 24
        }}>
          {orgInfo && clientInfo ? (
            <EstimatePrint
              estimate={previewEstimate(estimate, draft.totals, titleDraft, scopeDraft, notesDraft, termsDraft, validUntil)}
              items={draft.items.map(d => ({
                id:            d.id ?? d.localId,
                estimate_id:   estimate.id,
                org_id:        estimate.org_id,
                sort_order:    d.sort_order,
                item_type:     d.item_type,
                description:   d.description,
                quantity:      d.quantity,
                unit_price:    d.unit_price,
                discount_pct:  d.discount_pct,
                tax_rate:      d.tax_rate,
                line_subtotal: d.line_subtotal,
                line_discount: d.line_discount,
                line_tax:      d.line_tax,
                line_total:    d.line_total,
                created_at:    new Date().toISOString()
              }))}
              org={orgInfo}
              client={clientInfo}
            />
          ) : (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <SemaphoreSpinner size="md" inline />
            </div>
          )}
        </div>
      </div>

      {/* Print-only style */}
      <style>{`
        @media print {
          .lp-edit-grid { grid-template-columns: 1fr !important; }
          .lp-preview-pane { background: white !important; padding: 0 !important; overflow: visible !important; }
        }
      `}</style>

      {/* Dialogs */}
      <SendEstimateDialog
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
        estimate={estimate}
        {...(clientInfo?.email ? { defaultEmail: clientInfo.email } : {})}
        onSent={() => setSendDialogOpen(false)}
      />

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this draft?"
          message="This estimate has not been sent. Deleting it is permanent."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          loading={deleteMut.isPending}
        />
      )}

      {confirmConvert && (
        <ConfirmDialog
          title="Convert to invoice?"
          message={`This will create a new invoice with the same line items and totals (${formatCurrency(estimate.total, estimate.currency)}). The estimate will be marked as converted.`}
          confirmLabel="Convert"
          variant="primary"
          onConfirm={handleConvert}
          onCancel={() => setConfirmConvert(false)}
          loading={convertMut.isPending}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function previewEstimate(
  e: Estimate,
  totals: { subtotal: number; discount_total: number; tax_total: number; total: number },
  title: string,
  scope: string,
  notes: string,
  terms: string,
  validUntil: string
): Estimate {
  return {
    ...e,
    title:             title || e.title,
    scope_description: scope || e.scope_description,
    notes:             notes || e.notes,
    terms:             terms || e.terms,
    valid_until:       validUntil || e.valid_until,
    subtotal:          totals.subtotal,
    discount_total:    totals.discount_total,
    tax_total:         totals.tax_total,
    total:             totals.total
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="lp-section-label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Total({ label, value, accent, size = 'sm' }: {
  label: string; value: string; accent?: string; size?: 'sm' | 'lg'
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <span style={{
        color: size === 'lg' ? 'var(--lp-text)' : 'var(--lp-text-muted)',
        fontSize: size === 'lg' ? 13 : 11.5,
        fontWeight: size === 'lg' ? 600 : 500
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'monospace',
        color: accent ?? 'var(--lp-text)',
        fontSize: size === 'lg' ? 16 : 12.5,
        fontWeight: size === 'lg' ? 700 : 500
      }}>
        {value}
      </span>
    </div>
  )
}

function ConfirmDialog({
  title, message, confirmLabel, variant, onConfirm, onCancel, loading
}: {
  title:        string
  message:      string
  confirmLabel: string
  variant:      'danger' | 'primary'
  onConfirm:    () => void
  onCancel:     () => void
  loading:      boolean
}) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100
    }}>
      <div onClick={e => e.stopPropagation()} className="lp-card" style={{
        maxWidth: 420, width: 'calc(100% - 32px)', padding: 24
      }}>
        <h3 style={{
          margin: 0, marginBottom: 8,
          fontSize: 15, fontWeight: 600, color: 'var(--lp-text)'
        }}>
          {title}
        </h3>
        <p style={{
          margin: 0, marginBottom: 20,
          fontSize: 12.5, color: 'var(--lp-text-muted)', lineHeight: 1.5
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            className="lp-btn lp-btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`lp-btn ${variant === 'danger' ? 'lp-btn-danger' : 'lp-btn-convert'}`}
          >
            {loading && <SemaphoreSpinner size="sm" inline />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
