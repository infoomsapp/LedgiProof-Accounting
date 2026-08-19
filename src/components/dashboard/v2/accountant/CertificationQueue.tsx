// PATH: src/components/dashboard/v2/accountant/CertificationQueue.tsx
//
// The Accountant dashboard's real differentiator: a firm-wide list of green
// transactions (auto-cleared by Brain, or already confirmed by the client)
// waiting for a professional to CERTIFY them — the formal close step the
// semaphore lifecycle documents in brain.service.ts but that never had a
// screen. Certifying calls the `resolve-transaction` Edge Function
// (resolution:'certify'), which was already deployed and already enforced
// org-membership + role checks server-side — this is its first caller.
//
// Self-contained: fetches its own data (there is no dashboard RPC for this
// yet) and exposes onCertified so the parent can refresh KPIs/semaphore
// counts after a certify action changes them.

import { useEffect, useState, useCallback } from 'react'
import {
  getCertificationQueue,
  certifyTransaction,
  type CertificationQueueItem
} from '../../../../services/transactions.service'
import { formatDate } from '../../../../lib/dates'
import { formatCurrency } from '../../../../lib/currency'

interface Props {
  orgId: string
  onCertified?: () => void
}

export default function CertificationQueue({ orgId, onCertified }: Props) {
  const [items,    setItems]    = useState<CertificationQueueItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy,     setBusy]     = useState(false)
  const [busyError, setBusyError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getCertificationQueue(orgId)
      setItems(data)
      setSelected(prev => new Set([...prev].filter(id => data.some(d => d.id === id))))
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the certification queue')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { load() }, [load])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.id)))
  }

  async function certifySelected() {
    if (selected.size === 0) return
    setBusy(true)
    setBusyError(null)
    const ids = [...selected]
    const results = await Promise.allSettled(ids.map(id => certifyTransaction(id)))
    const failed = results.filter(r => r.status === 'rejected').length
    setBusy(false)
    if (failed > 0) {
      setBusyError(
        failed === ids.length
          ? `Certification failed for all ${failed} selected transactions.`
          : `Certified ${ids.length - failed} of ${ids.length} — ${failed} failed. Retry the remaining ones below.`
      )
    }
    await load()
    onCertified?.()
  }

  if (loading) {
    return (
      <div style={{ padding: '28px 14px', fontSize: 12.5, color: 'var(--lp-text-muted)', textAlign: 'center' }}>
        Loading certification queue…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        padding: '16px 14px', fontSize: 12.5, color: 'var(--sem-red)',
        background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)',
        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10
      }}>
        <span>{error}</span>
        <button className="lp-btn-outline" onClick={load}>Retry</button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={{
        padding: '28px 14px', fontSize: 12.5, color: 'var(--lp-text-muted)',
        textAlign: 'center', fontStyle: 'italic'
      }}>
        ✓ Nothing waiting for certification — the team is caught up.
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginBottom: 8
      }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 7,
          fontSize: 11.5, color: 'var(--lp-text-muted)', cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === items.length}
            ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < items.length }}
            onChange={toggleAll}
          />
          {selected.size > 0 ? `${selected.size} selected` : `Select all · ${items.length} waiting`}
        </label>

        <button
          className="lp-btn lp-btn-primary"
          disabled={selected.size === 0 || busy}
          onClick={certifySelected}
          style={{ opacity: selected.size === 0 || busy ? 0.5 : 1 }}
        >
          {busy ? 'Certifying…' : `Certify ${selected.size > 0 ? `(${selected.size})` : ''}`}
        </button>
      </div>

      {busyError && (
        <div style={{
          padding: '8px 12px', marginBottom: 8, fontSize: 11.5, color: 'var(--sem-red)',
          background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red-border)',
          borderRadius: 7
        }}>
          {busyError}
        </div>
      )}

      {/* Rows */}
      <div style={{
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        borderRadius: 10,
        overflow: 'hidden'
      }}>
        {items.map((tx, i) => (
          <label
            key={tx.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', cursor: 'pointer',
              borderBottom: i < items.length - 1 ? '0.5px solid var(--lp-border)' : 'none',
              background: selected.has(tx.id) ? 'var(--sem-blue-bg)' : 'transparent'
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(tx.id)}
              onChange={() => toggle(tx.id)}
            />

            <span style={{
              fontSize: 10.5, fontWeight: 600, color: 'var(--sem-green)',
              padding: '2px 7px', borderRadius: 100,
              background: 'var(--sem-green-bg)',
              border: '0.5px solid var(--sem-green-border)',
              flexShrink: 0
            }}>
              green
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, color: 'var(--lp-text)', fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {tx.description || tx.merchant_name || 'Untitled transaction'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--lp-text-muted)' }}>
                {tx.clients?.display_name ?? 'Unassigned'} · {formatDate(tx.transaction_date)}
              </div>
            </div>

            <div style={{
              fontSize: 13, fontWeight: 600, color: 'var(--lp-text)',
              fontVariantNumeric: 'tabular-nums', flexShrink: 0
            }}>
              {formatCurrency(tx.amount, tx.currency)}
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
