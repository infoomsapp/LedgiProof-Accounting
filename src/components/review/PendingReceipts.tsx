// PATH: src/components/review/PendingReceipts.tsx
//
// "Receipts waiting for a match" -- shown above the review inbox. Every
// scanned receipt that match_receipt() couldn't link on its own stays here
// until it's resolved:
//   · "This one"        -> link_receipt() to a likely bank transaction
//   · "Fix"             -> correct what OCR read; match_receipt() runs again
//   · cash expense      -> create_expense_from_receipt(): the receipt becomes
//                          the transaction, which then appears in the inbox
//   · dismiss           -> dismiss_receipt(): doesn't need a transaction
// Fixing and linking are open to anyone who may act for the workspace;
// recording and dismissing are for staff who write the books (canWrite).

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getPendingReceipts, linkReceipt, correctReceipt, createExpenseFromReceipt, dismissReceipt,
  type PendingReceipt, type ReceiptMatchTx
} from '../../services/ocr.service'
import { formatCurrency } from '../../lib/currency'

interface Props {
  orgId:            string
  clientId:         string | null
  canWrite:         boolean
  /** A receipt became a transaction: the review queue should reload. */
  onExpenseCreated: () => void
}

interface Draft {
  merchant: string
  amount:   string
  date:     string
  currency: string
}

export default function PendingReceipts({ orgId, clientId, canWrite, onExpenseCreated }: Props) {
  const { t } = useTranslation()
  const [items,    setItems]    = useState<PendingReceipt[]>([])
  const [editing,  setEditing]  = useState<string | null>(null)
  const [draft,    setDraft]    = useState<Draft>({ merchant: '', amount: '', date: '', currency: 'USD' })
  const [busy,     setBusy]     = useState<string | null>(null)
  const [notices,  setNotices]  = useState<Record<string, string>>({})
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      setItems(await getPendingReceipts(orgId, clientId))
    } catch {
      // The inbox itself still works; this panel just stays hidden.
      setItems([])
    }
  }, [orgId, clientId])

  useEffect(() => { void load() }, [load])

  const setError  = (id: string, msg: string | null) =>
    setErrors(prev => { const n = { ...prev }; if (msg) n[id] = msg; else delete n[id]; return n })
  const resolved  = (id: string) => setItems(prev => prev.filter(r => r.id !== id))
  const flash     = (msg: string) => setNotices(prev => ({ ...prev, _: msg }))

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id)
    setError(id, null)
    try {
      await fn()
    } catch (e) {
      setError(id, e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function startEdit(r: PendingReceipt) {
    setEditing(r.id)
    setDraft({
      merchant: r.ocr_merchant ?? '',
      amount:   r.ocr_amount != null ? String(r.ocr_amount) : '',
      date:     r.ocr_date ?? '',
      currency: (r.ocr_currency ?? 'USD').toUpperCase(),
    })
  }

  const link = (r: PendingReceipt, tx: ReceiptMatchTx) => run(r.id, async () => {
    await linkReceipt(r.id, tx.id)
    resolved(r.id)
    flash(t('pendingReceipts.linkedTo', { description: tx.description ?? '—' }))
  })

  const save = (r: PendingReceipt) => run(r.id, async () => {
    const amount = Number(draft.amount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(t('pendingReceipts.amountInvalid'))
    const match = await correctReceipt(r.id, {
      merchant: draft.merchant.trim() || null,
      amount,
      date:     draft.date || null,
      currency: (draft.currency.trim() || 'USD').toUpperCase().slice(0, 3),
    })
    setEditing(null)
    if (match.status === 'matched') {
      resolved(r.id)
      flash(t('pendingReceipts.linkedTo', { description: match.transaction.description ?? '—' }))
    } else {
      await load()
      if (match.status === 'unmatched') setNotices(prev => ({ ...prev, [r.id]: t('pendingReceipts.stillWaiting') }))
    }
  })

  // A cash expense adds a transaction: a card purchase that will arrive with
  // the statement must not be recorded twice.
  const cash = (r: PendingReceipt) => window.confirm(t('pendingReceipts.cashConfirm', {
    merchant: r.ocr_merchant ?? r.filename
  })) && run(r.id, async () => {
    await createExpenseFromReceipt(r.id)
    resolved(r.id)
    flash(t('pendingReceipts.expenseMade'))
    onExpenseCreated()
  })

  const dismiss = (r: PendingReceipt) => run(r.id, async () => {
    await dismissReceipt(r.id)
    resolved(r.id)
    flash(t('pendingReceipts.dismissed'))
  })

  if (items.length === 0 && !notices._) return null

  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--lp-text)' }}>📎 {t('pendingReceipts.title')}</h2>
        {items.length > 0 && (
          <span style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>{t('pendingReceipts.count', { count: items.length })}</span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', margin: '0 0 10px', maxWidth: 680, lineHeight: 1.5 }}>
        {t('pendingReceipts.subtitle')}
      </p>

      {notices._ && (
        <div role="status" style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
          background: 'var(--sem-blue-bg)', border: '0.5px solid var(--sem-blue-border)', color: 'var(--sem-blue)'
        }}>✓ {notices._}</div>
      )}

      {items.length > 0 && (
        <div style={{ background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', borderRadius: 14, overflow: 'hidden' }}>
          {items.map((r, i) => {
            const isBusy = busy === r.id
            const cur    = (r.ocr_currency ?? 'USD').toUpperCase()
            return (
              <div key={r.id} style={{
                padding: '12px 16px', borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)',
                opacity: isBusy ? 0.55 : 1, transition: 'opacity 0.15s'
              }}>
                {/* What was read */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--lp-text)' }}>
                      {r.ocr_merchant ?? r.filename}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                      {r.ocr_date ?? t('pendingReceipts.noReading')}
                      {r.match_status === 'no_amount' && (
                        <span style={{ color: 'var(--sem-amber)', marginLeft: 8 }}>{t('receiptMatch.noAmount')}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--lp-text)' }}>
                    {r.ocr_amount != null ? formatCurrency(Number(r.ocr_amount), cur) : '—'}
                  </div>
                  {editing !== r.id && (
                    <button type="button" className="lp-btn lp-btn-ghost" disabled={isBusy} onClick={() => startEdit(r)}>
                      {t('pendingReceipts.edit')}
                    </button>
                  )}
                </div>

                {/* Fix what OCR read */}
                {editing === r.id && (
                  <form
                    onSubmit={e => { e.preventDefault(); void save(r) }}
                    style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}
                  >
                    <label style={labelStyle}>
                      {t('pendingReceipts.merchant')}
                      <input className="lp-input" value={draft.merchant}
                        onChange={e => setDraft(d => ({ ...d, merchant: e.target.value }))} style={{ width: 200 }} />
                    </label>
                    <label style={labelStyle}>
                      {t('pendingReceipts.amount')}
                      <input className="lp-input" inputMode="decimal" value={draft.amount} required
                        onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} style={{ width: 110 }} />
                    </label>
                    <label style={labelStyle}>
                      {t('pendingReceipts.date')}
                      <input className="lp-input" type="date" value={draft.date}
                        onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} style={{ width: 150 }} />
                    </label>
                    <label style={labelStyle}>
                      {t('pendingReceipts.currency')}
                      <input className="lp-input" value={draft.currency} maxLength={3}
                        onChange={e => setDraft(d => ({ ...d, currency: e.target.value }))} style={{ width: 70 }} />
                    </label>
                    <button type="submit" className="lp-btn lp-btn-primary" disabled={isBusy}>
                      {isBusy ? t('pendingReceipts.saving') : t('pendingReceipts.save')}
                    </button>
                    <button type="button" className="lp-btn lp-btn-ghost" disabled={isBusy} onClick={() => setEditing(null)}>
                      {t('pendingReceipts.cancel')}
                    </button>
                  </form>
                )}

                {/* Likely bank transactions */}
                {r.candidates.length > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--sem-amber-bg)', border: '0.5px solid var(--sem-amber-border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 4 }}>
                      {t('receiptMatch.suggested')}
                    </div>
                    {r.candidates.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--lp-text-muted)', padding: '3px 0' }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.description ?? '—'} · {c.transaction_date}
                        </span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Math.abs(Number(c.amount)), cur)}</span>
                        <button type="button" className="lp-btn lp-btn-ghost" disabled={isBusy} onClick={() => { void link(r, c) }}>
                          {t('receiptMatch.thisOne')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* No bank line will come */}
                {canWrite && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                    <button type="button" className="lp-btn lp-btn-ghost"
                      disabled={isBusy || r.ocr_amount == null} onClick={() => { void cash(r) }}>
                      {t('pendingReceipts.cashExpense')}
                    </button>
                    <button type="button" className="lp-btn lp-btn-ghost" disabled={isBusy} onClick={() => { void dismiss(r) }}>
                      {t('pendingReceipts.dismiss')}
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--lp-text-muted)' }}>{t('pendingReceipts.cashHint')}</span>
                  </div>
                )}

                {notices[r.id] && <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 6 }}>{notices[r.id]}</div>}
                {errors[r.id]  && <div role="alert" style={{ fontSize: 11.5, color: 'var(--sem-red)', marginTop: 6 }}>{errors[r.id]}</div>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

const labelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--lp-text-muted)'
}
