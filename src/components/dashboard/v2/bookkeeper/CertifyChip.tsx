// PATH: src/components/dashboard/v2/bookkeeper/CertifyChip.tsx
//
// Lightweight certify access for the Bookkeeper dashboard — NOT the full
// Certification Queue (that's the Accountant dashboard's dedicated section,
// src/components/dashboard/v2/accountant/CertificationQueue.tsx). This is
// intentionally small: a header chip showing how many green transactions are
// ready to certify, expanding to a short one-by-one list. `resolve-transaction`
// allows certify for firm owner/admin regardless of firm type, so a
// bookkeeping firm without a separate accountant reviewing still needs a way
// to close transactions out — just not a whole dashboard section built
// around it, since the bookkeeper's real work is the day's operational queue.

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getCertificationQueue,
  certifyTransaction,
  type CertificationQueueItem
} from '../../../../services/transactions.service'
import { formatCurrency } from '../../../../lib/currency'

const VISIBLE_CAP = 5

export default function CertifyChip({ orgId, onCertified }: { orgId: string; onCertified?: () => void }) {
  const { t } = useTranslation()
  const [items,   setItems]   = useState<CertificationQueueItem[]>([])
  const [open,    setOpen]    = useState(false)
  const [busyId,  setBusyId]  = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orgId) return
    try {
      const data = await getCertificationQueue(orgId)
      setItems(data)
    } catch {
      // Silent on the badge count — this is a lightweight convenience chip,
      // not the primary certification surface. A real failure to load will
      // surface when the user opens the panel (below).
    }
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function certify(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await certifyTransaction(id)
      await load()
      onCertified?.()
    } catch (e: any) {
      setError(e?.message ?? t('dashboard.certificationFailed'))
    } finally {
      setBusyId(null)
    }
  }

  if (items.length === 0) return null

  const visible = items.slice(0, VISIBLE_CAP)
  const overflow = items.length - visible.length

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="lp-btn-outline"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        title={t('dashboard.certifyChipTitle')}
      >
        🔏 {t('dashboard.certify')}
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: 'var(--sem-blue)',
          padding: '1px 7px', borderRadius: 100,
          background: 'var(--sem-blue-bg-strong)'
        }}>
          {items.length}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          zIndex: 30, width: 320,
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border-2)',
          borderRadius: 10,
          boxShadow: 'var(--lp-shadow-lg)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '9px 12px', fontSize: 10.5, color: 'var(--lp-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
            borderBottom: '0.5px solid var(--lp-border)'
          }}>
            {t('dashboard.readyToCertify')}
          </div>

          {error && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--sem-red)' }}>{error}</div>
          )}

          {visible.map(tx => (
            <div key={tx.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderBottom: '0.5px solid var(--lp-border)'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, color: 'var(--lp-text)', fontWeight: 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {tx.description || tx.merchant_name || t('dashboard.untitledTransaction')}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)' }}>
                  {tx.clients?.display_name ?? t('dashboard.unassigned')} · {formatCurrency(tx.amount, tx.currency)}
                </div>
              </div>
              <button
                className="lp-btn lp-btn-primary"
                disabled={busyId === tx.id}
                onClick={() => certify(tx.id)}
                style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
              >
                {busyId === tx.id ? '…' : t('dashboard.certify')}
              </button>
            </div>
          ))}

          {overflow > 0 && (
            <div style={{
              padding: '8px 12px', fontSize: 11, color: 'var(--lp-text-muted)',
              textAlign: 'center', fontStyle: 'italic'
            }}>
              {t('dashboard.moreWaiting', { count: overflow })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
