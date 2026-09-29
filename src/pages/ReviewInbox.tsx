// PATH: src/pages/ReviewInbox.tsx
//
// "For review" -- the daily loop in one click, QuickBooks/Xero style with
// LedgiProof's semaphore: every uncategorized transaction arrives with a
// suggested category; confirming it posts the balanced entry (the bank side
// is implied), turns it blue -- verified -- and teaches LedgiProof the
// merchant. The second time a merchant lands in the same account, a rule is
// offered; the third time, that merchant is categorized by itself.
//
// Above the list, VerifyQueue shows what LedgiProof already categorized by
// itself (green = ready): verify it (blue) or change it (back here).
//
// Suggestion order (server): rule > learned > vendor default > known
// merchant > income; whatever is still blank goes to the AI edge function.
// Red transactions (a critical rule fired, e.g. a possible duplicate) are
// never included in "confirm all" -- they need a look first.
//
// Works in both scopes: self mode (/review) and a firm's client
// (/clients/:clientId/review), via useScope.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScope } from '../hooks/useScope'
import { getAccounts } from '../services/accounts.service'
import {
  getReviewQueue, postReviewed, setCategorizationRule,
  type ReviewItem, type RulePrompt, type SuggestionSource
} from '../services/review.service'
import { formatCurrency } from '../lib/currency'
import { useAuthStore } from '../store/auth.store'
import PendingReceipts from '../components/review/PendingReceipts'
import VerifyQueue from '../components/review/VerifyQueue'
import BrainWhy from '../components/review/BrainWhy'
import type { Account, LpRole } from '../types/database.types'

// Same roles post_reviewed_transactions() accepts (the journal write policy).
const POST_ROLES: LpRole[] = ['owner', 'admin', 'accountant']

const SEM_COLOR: Record<ReviewItem['semaphore'], string> = {
  blue:  'var(--sem-blue)',
  green: 'var(--sem-green)',
  amber: 'var(--sem-amber)',
  red:   'var(--sem-red)',
}

interface Choice {
  accountId:  string
  source:     SuggestionSource | null
  confidence: number | null
  /** Set when the choice is "this deposit pays invoice X" / "brings in payment Y". */
  invoiceId?: string
  paymentId?: string
  billId?:    string
}

// The suggestion the server made for a row, as a Choice.
function suggestedChoice(it: ReviewItem): Choice | null {
  if (!it.suggested_account_id) return null
  return {
    accountId:  it.suggested_account_id,
    source:     it.suggestion_source,
    confidence: it.suggestion_confidence,
    ...(it.invoice_match ? { invoiceId: it.invoice_match.invoice_id } : {}),
    ...(it.deposit_match ? { paymentId: it.deposit_match.payment_id } : {}),
    ...(it.bill_match ? { billId: it.bill_match.bill_id } : {}),
  }
}

export default function ReviewInbox() {
  const { t }    = useTranslation()
  const navigate = useNavigate()
  const scope    = useScope()
  const orgId    = scope.orgId
  const clientId = scope.clientId
  const membership = useAuthStore(s => s.membership)
  const isSuperAdmin = useAuthStore(s => s.profile?.system_role === 'super_admin')
  const canPost  = isSuperAdmin || POST_ROLES.includes(membership?.role ?? 'readonly')

  const [items,      setItems]       = useState<ReviewItem[]>([])
  const [total,       setTotal]       = useState(0)
  const [hasBank,     setHasBank]     = useState(true)
  const [accounts,    setAccounts]    = useState<Account[]>([])
  const [choices,     setChoices]     = useState<Record<string, Choice>>({})
  const [busy,        setBusy]        = useState<Set<string>>(new Set())
  const [rowErrors,   setRowErrors]   = useState<Record<string, string>>({})
  const [prompts,     setPrompts]     = useState<RulePrompt[]>([])
  const [notice,      setNotice]      = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)

  // Every leaf account of this scope except the bank/cash accounts themselves
  // (the bank side is implied) -- the same set post_reviewed_transactions()
  // accepts. Not only income/expense: an owner's contribution is equity, a
  // loan payment a liability, a laptop an asset.
  const categories = useMemo(() => {
    const scoped  = accounts.filter(a => (a.client_id ?? null) === (clientId ?? null) && a.is_active !== false)
    const parents = new Set(scoped.map(a => a.parent_id).filter(Boolean))
    const isCash  = (a: Account) => a.type === 'asset'
      && (a.cash_flow_category === 'cash' || /(checking|cash|bank)/i.test(a.name))
      && !/(undeposited|in transit)/i.test(a.name)
    return scoped.filter(a => !parents.has(a.id) && !isCash(a))
  }, [accounts, clientId])

  const load = useCallback(async () => {
    if (!scope.isReady || !orgId) return
    setLoading(true)
    setError(null)
    try {
      const [queue, accts] = await Promise.all([
        getReviewQueue(orgId, clientId),
        getAccounts(orgId, clientId ? { clientId } : {})
      ])
      setItems(queue.items)
      setTotal(queue.total)
      setHasBank(!!queue.bank_account)
      setAccounts(accts)
      const initial: Record<string, Choice> = {}
      for (const it of queue.items) {
        const c = suggestedChoice(it)
        if (c) initial[it.id] = c
      }
      // What the Brain can't suggest stays blank: the person chooses (no AI).
      setChoices(initial)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [scope.isReady, orgId, clientId])

  useEffect(() => { void load() }, [load])

  async function confirm(ids: string[]) {
    const payload = ids
      .map(id => ({ id, choice: choices[id] }))
      .filter(x => x.choice?.accountId)
      .map(x => ({
        transaction_id: x.id,
        account_id:     x.choice!.accountId,
        source:         x.choice!.source,
        ...(x.choice!.invoiceId ? { invoice_id: x.choice!.invoiceId } : {}),
        ...(x.choice!.paymentId ? { payment_id: x.choice!.paymentId } : {}),
        ...(x.choice!.billId ? { bill_id: x.choice!.billId } : {}),
      }))
    if (payload.length === 0) return

    setBusy(prev => new Set([...prev, ...payload.map(p => p.transaction_id)]))
    setNotice(null)
    try {
      const res = await postReviewed(orgId, payload)
      const posted = new Set(res.posted)
      setItems(prev => prev.filter(it => !posted.has(it.id)))
      setTotal(prev => Math.max(0, prev - posted.size))
      setRowErrors(prev => {
        const next = { ...prev }
        for (const id of posted) delete next[id]
        for (const f of res.failed) next[f.transaction_id] = f.error
        return next
      })
      if (res.rule_prompts.length > 0) setPrompts(prev => [...prev, ...res.rule_prompts])
      const parts = []
      if (posted.size > 0)     parts.push(t('review.verified', { count: posted.size }))
      if (res.failed.length > 0) parts.push(t('review.failed', { count: res.failed.length }))
      setNotice(parts.join(' · '))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(prev => {
        const next = new Set(prev)
        for (const p of payload) next.delete(p.transaction_id)
        return next
      })
    }
  }

  async function acceptRule(p: RulePrompt) {
    setPrompts(prev => prev.filter(x => x !== p))
    try {
      await setCategorizationRule(orgId, p.client_id, p.merchant_key, p.account_id, true)
      setNotice(t('review.ruleSaved'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // "Confirm all": every row with a category, except red ones (they need a look).
  const bulkIds = items.filter(it => choices[it.id]?.accountId && it.semaphore !== 'red').map(it => it.id)
  const prompt  = prompts[0]

  if (!scope.isReady || loading) {
    return <div style={{ padding: '28px 32px', color: 'var(--lp-text-muted)', fontSize: 13 }}>…</div>
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1, overflowY: 'auto', maxWidth: 1080 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 className="lp-page-title" style={{ margin: 0 }}>
            {t('review.title')}
            {total > 0 && <span className="lp-page-title-count">{t('review.count', { count: total })}</span>}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--lp-text-muted)', margin: '6px 0 0', maxWidth: 620, lineHeight: 1.5 }}>
            {t('review.subtitle')}
          </p>
        </div>
        {canPost && bulkIds.length > 0 && hasBank && (
          <button
            type="button"
            className="lp-btn lp-btn-primary"
            disabled={busy.size > 0}
            onClick={() => { void confirm(bulkIds) }}
          >
            {busy.size > 0 ? t('review.confirming') : t('review.confirmAll', { count: bulkIds.length })}
          </button>
        )}
      </div>

      {error && (
        <div role="alert" style={{
          marginBottom: 14, padding: '10px 12px', borderRadius: 8,
          background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)', fontSize: 12.5, color: 'var(--sem-red)'
        }}>{error}</div>
      )}

      {notice && (
        <div role="status" style={{
          marginBottom: 14, padding: '10px 12px', borderRadius: 8,
          background: 'var(--sem-blue-bg)', border: '0.5px solid var(--sem-blue-border)',
          fontSize: 12.5, color: 'var(--sem-blue)', fontWeight: 500
        }}>✓ {notice}</div>
      )}

      {prompt && (
        <div style={{
          marginBottom: 14, padding: '12px 14px', borderRadius: 10,
          background: 'var(--lp-surface)', border: '0.5px solid var(--sem-blue-border)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        }}>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--lp-text)' }}>
            {t('review.ruleQuestion', { merchant: prompt.merchant_key, account: prompt.account_name })}
          </span>
          <button type="button" className="lp-btn lp-btn-primary" onClick={() => { void acceptRule(prompt) }}>
            {t('review.ruleCreate')}
          </button>
          <button type="button" className="lp-btn lp-btn-ghost" onClick={() => setPrompts(prev => prev.slice(1))}>
            {t('review.ruleDismiss')}
          </button>
        </div>
      )}

      {!hasBank && items.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '14px 16px', borderRadius: 10,
          background: 'var(--sem-amber-bg)', border: '0.5px solid var(--sem-amber-border)'
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>{t('review.noBankTitle')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', margin: '4px 0 10px' }}>{t('review.noBankBody')}</div>
          <button type="button" className="lp-btn lp-btn-ghost" onClick={() => navigate(clientId ? `/clients/${clientId}/accounts` : '/accounts')}>
            {t('review.noBankCta')}
          </button>
        </div>
      )}

      {orgId && (
        <PendingReceipts
          orgId={orgId}
          clientId={clientId ?? null}
          canWrite={canPost}
          onExpenseCreated={() => { void load() }}
        />
      )}

      {orgId && (
        <VerifyQueue
          orgId={orgId}
          clientId={clientId ?? null}
          canWrite={canPost}
          onChanged={() => { void load() }}
          onRulePrompts={p => setPrompts(prev => [...prev, ...p])}
        />
      )}

      {items.length === 0 ? (
        <div style={{
          background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', borderRadius: 14,
          padding: '44px 24px', textAlign: 'center'
        }}>
          <div aria-hidden style={{
            width: 44, height: 44, borderRadius: '50%', margin: '0 auto 14px',
            background: 'var(--sem-blue)', color: '#fff', fontSize: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--lp-text)' }}>{t('review.emptyTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-muted)', margin: '6px auto 16px', maxWidth: 420, lineHeight: 1.5 }}>
            {t('review.emptyBody')}
          </div>
          <button type="button" className="lp-btn lp-btn-ghost"
            onClick={() => navigate(clientId ? `/clients/${clientId}/imports` : '/import/bank-transactions')}>
            {t('review.importCta')}
          </button>
        </div>
      ) : (
        <div style={{ background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', borderRadius: 14, overflow: 'hidden' }}>
          {items.map((it, i) => {
            const choice   = choices[it.id]
            const isBusy   = busy.has(it.id)
            const moneyIn  = Number(it.amount) > 0
            const byType = (type: string) => categories.filter(a => a.type === type)
            const groups = ([
              ...(moneyIn
                ? [[t('review.income'), byType('income')], [t('review.expense'), byType('expense')]]
                : [[t('review.expense'), byType('expense')], [t('review.income'), byType('income')]]),
              [t('review.equity'),    byType('equity')],
              [t('review.liability'), byType('liability')],
              [t('review.asset'),     byType('asset')],
            ]) as [string, Account[]][]
            return (
              <div key={it.id} style={{
                // Wraps instead of squeezing: on a narrow screen the merchant
                // keeps its width and the category + button drop to a new line.
                display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '12px 16px',
                borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)',
                opacity: isBusy ? 0.55 : 1, transition: 'opacity 0.15s'
              }}>
                {/* Transaction */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: '1 1 220px' }}>
                  <span aria-hidden title={it.semaphore} style={{
                    width: 9, height: 9, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                    background: SEM_COLOR[it.semaphore]
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.merchant_name ?? it.description ?? '—'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                      {it.transaction_date}
                      {it.has_receipt && (
                        <span title={t('review.hasReceipt')} aria-label={t('review.hasReceipt')} style={{ marginLeft: 8 }}>📎</span>
                      )}
                      {/* Everything here is amber (not in the books yet); only a real
                          flag -- a rule that fired, or red -- gets words. */}
                      {(it.semaphore === 'red' || it.status_reason) && (
                        <span style={{ color: SEM_COLOR[it.semaphore], marginLeft: 8 }}>
                          {it.status_reason ?? t('review.needsLook')}
                        </span>
                      )}
                    </div>
                    {rowErrors[it.id] && (
                      <div style={{ fontSize: 11.5, color: 'var(--sem-red)', marginTop: 3 }}>{rowErrors[it.id]}</div>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div style={{
                  textAlign: 'right', fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  color: moneyIn ? 'var(--sem-green)' : 'var(--lp-text)', flex: '0 0 110px'
                }}>
                  {formatCurrency(Number(it.amount), it.currency)}
                </div>

                {/* Category */}
                <div style={{ flex: '1 1 220px', maxWidth: 320, minWidth: 0 }}>
                  <select
                    className="lp-input"
                    aria-label={t('review.choose')}
                    value={choice?.invoiceId || choice?.paymentId || choice?.billId ? 'match' : (choice?.accountId ?? '')}
                    disabled={isBusy}
                    onChange={e => {
                      const value = e.target.value
                      const next  = value === 'match'
                        ? suggestedChoice(it)
                        : { accountId: value, source: null, confidence: null }
                      if (next) setChoices(prev => ({ ...prev, [it.id]: next }))
                    }}
                  >
                    <option value="" disabled>{t('review.choose')}</option>
                    {(it.invoice_match || it.deposit_match || it.bill_match) && (
                      <optgroup label={t('review.matches')}>
                        <option value="match">
                          {it.invoice_match
                            ? t('review.matchInvoice', {
                                number: it.invoice_match.invoice_number,
                                client: it.invoice_match.client_name ? ` · ${it.invoice_match.client_name}` : ''
                              })
                            : it.deposit_match
                              ? t('review.matchDeposit', { number: it.deposit_match.invoice_number })
                              : t(it.bill_match!.kind === 'open' ? 'review.matchBill' : 'review.matchBillPayment', {
                                  number: it.bill_match!.bill_number ? ` ${it.bill_match!.bill_number}` : '',
                                  vendor: it.bill_match!.vendor_name
                                })}
                        </option>
                      </optgroup>
                    )}
                    {groups.map(([label, list]) => list.length > 0 && (
                      <optgroup key={label} label={label}>
                        {list.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, marginTop: 4, minHeight: 14, color: 'var(--lp-text-muted)' }}>
                    {choice?.source && (
                      <span style={{ color: choice.source === 'rule' ? 'var(--sem-blue)' : 'var(--lp-text-muted)' }}>
                        {t(`review.sources.${choice.source}`)}
                        {choice.confidence != null && ` · ${choice.confidence}%`}
                      </span>
                    )}
                    {choice?.accountId === it.suggested_account_id && <BrainWhy evidence={it.suggestion_evidence} />}
                  </div>
                </div>

                {/* Confirm */}
                <button
                  type="button"
                  className="lp-btn lp-btn-primary"
                  title={canPost ? undefined : t('review.readOnly')}
                  disabled={!canPost || !choice?.accountId || isBusy || !hasBank}
                  onClick={() => { void confirm([it.id]) }}
                  style={{ justifyContent: 'center', minWidth: 100 }}
                >
                  {isBusy ? '…' : t('review.confirm')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {total > items.length && items.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 10 }}>
          {t('review.showingFirst', { shown: items.length, total })}
        </div>
      )}
    </div>
  )
}
