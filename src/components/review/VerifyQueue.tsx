// PATH: src/components/review/VerifyQueue.tsx
//
// "Categorized automatically — check and verify": the green half of the
// semaphore. Everything here is already in the books (LedgiProof posted it by
// itself: a rule, a merchant confirmed three times, an exact match to an
// invoice or bill) and waits for a person:
//   Verify  -> verify_transactions(): blue, and one more confirmation learned.
//   Change  -> uncategorize_transaction(): back to For review, and the
//              merchant goes back to "ask me".
// Shows nothing when there is nothing to verify.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getVerificationQueue, verifyTransactions, uncategorizeTransaction, rowFailure,
  type VerificationItem, type RulePrompt
} from '../../services/review.service'
import { formatCurrency } from '../../lib/currency'

interface Props {
  orgId:     string
  clientId:  string | null
  canWrite:  boolean
  /** A category was removed: the For review list has a new row. */
  onChanged: () => void
  /** Verifying taught a merchant for the second time: offer the rule. */
  onRulePrompts?: (prompts: RulePrompt[]) => void
}

export default function VerifyQueue({ orgId, clientId, canWrite, onChanged, onRulePrompts }: Props) {
  const { t } = useTranslation()
  const [items,  setItems]  = useState<VerificationItem[]>([])
  const [total,  setTotal]  = useState(0)
  const [busy,   setBusy]   = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const q = await getVerificationQueue(orgId, { clientId })
      setItems(q.items)
      setTotal(q.total)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [orgId, clientId])

  useEffect(() => { void load() }, [load])

  async function verify(ids: string[]) {
    if (ids.length === 0) return
    setBusy(prev => new Set([...prev, ...ids]))
    setNotice(null)
    try {
      const res = await verifyTransactions(orgId, ids)
      const done = new Set(res.verified)
      setItems(prev => prev.filter(it => !done.has(it.id)))
      setTotal(prev => Math.max(0, prev - done.size))
      setErrors(prev => {
        const next = { ...prev }
        for (const id of done) delete next[id]
        for (const f of res.failed) next[f.transaction_id] = rowFailure(f).message
        return next
      })
      if (done.size > 0) setNotice(t('review.verifyQueue.verified', { count: done.size }))
      if (res.rule_prompts.length > 0) onRulePrompts?.(res.rule_prompts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(prev => { const next = new Set(prev); for (const id of ids) next.delete(id); return next })
    }
  }

  async function change(id: string) {
    setBusy(prev => new Set([...prev, id]))
    setNotice(null)
    try {
      await uncategorizeTransaction(orgId, id)
      setItems(prev => prev.filter(it => it.id !== id))
      setTotal(prev => Math.max(0, prev - 1))
      setNotice(t('review.verifyQueue.changed'))
      onChanged()
    } catch (e) {
      setErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  if (items.length === 0 && !error && !notice) return null

  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--lp-text)' }}>
          <span aria-hidden style={{
            display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
            background: 'var(--sem-green)', marginRight: 8, verticalAlign: 'middle'
          }} />
          {t('review.verifyQueue.title')}
        </h2>
        {total > 0 && (
          <span style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>{t('review.verifyQueue.count', { count: total })}</span>
        )}
        {canWrite && items.length > 1 && (
          <button type="button" className="lp-btn lp-btn-ghost" style={{ marginLeft: 'auto' }}
            disabled={busy.size > 0}
            onClick={() => { void verify(items.map(it => it.id)) }}>
            {t('review.verifyQueue.verifyAll', { count: items.length })}
          </button>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', margin: '0 0 10px', maxWidth: 680, lineHeight: 1.5 }}>
        {t('review.verifyQueue.subtitle')}
      </p>

      {error && (
        <div role="alert" style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
          background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)', color: 'var(--sem-red)'
        }}>{error}</div>
      )}
      {notice && (
        <div role="status" style={{
          marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
          background: 'var(--sem-blue-bg)', border: '0.5px solid var(--sem-blue-border)', color: 'var(--sem-blue)'
        }}>✓ {notice}</div>
      )}

      {items.length > 0 && (
        <div style={{ background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', borderRadius: 14, overflow: 'hidden' }}>
          {items.map((it, i) => {
            const isBusy  = busy.has(it.id)
            const moneyIn = Number(it.amount) > 0
            const flagged = it.semaphore === 'amber' || it.semaphore === 'red'
            return (
              <div key={it.id} style={{
                display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '12px 16px',
                borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)',
                opacity: isBusy ? 0.55 : 1, transition: 'opacity 0.15s'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: '1 1 200px' }}>
                  <span aria-hidden title={it.semaphore} style={{
                    width: 9, height: 9, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                    background: flagged ? 'var(--sem-amber)' : 'var(--sem-green)'
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.merchant_name ?? it.description ?? '—'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                      {it.transaction_date}
                      {it.client_name && <span style={{ marginLeft: 8 }}>· {it.client_name}</span>}
                      {flagged && (
                        <span style={{ color: 'var(--sem-amber)', marginLeft: 8 }}>
                          {it.status_reason ?? t('review.verifyQueue.flagged')}
                        </span>
                      )}
                    </div>
                    {errors[it.id] && (
                      <div style={{ fontSize: 11.5, color: 'var(--sem-red)', marginTop: 3 }}>{errors[it.id]}</div>
                    )}
                  </div>
                </div>

                <div style={{
                  textAlign: 'right', fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  color: moneyIn ? 'var(--sem-green)' : 'var(--lp-text)', flex: '0 0 100px'
                }}>
                  {formatCurrency(Number(it.amount), it.currency)}
                </div>

                <div style={{ minWidth: 0, flex: '1 1 180px', maxWidth: 280 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.matched_to
                      ? t('review.verifyQueue.settles', { document: it.matched_to })
                      : it.category_account_name
                        ? `${it.category_account_code ?? ''} · ${it.category_account_name}`
                        : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                    {it.auto ? t('review.verifyQueue.auto') : ''}
                    {it.source && ` · ${t(`review.sources.${it.source}`)}`}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  {canWrite && !it.matched_to && (
                    <button type="button" className="lp-btn lp-btn-ghost" disabled={isBusy}
                      onClick={() => { void change(it.id) }}>
                      {t('review.verifyQueue.change')}
                    </button>
                  )}
                  <button type="button" className="lp-btn lp-btn-primary" disabled={!canWrite || isBusy}
                    title={canWrite ? undefined : t('review.readOnly')}
                    onClick={() => { void verify([it.id]) }} style={{ justifyContent: 'center', minWidth: 90 }}>
                    {isBusy ? '…' : t('review.verifyQueue.verify')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
