// PATH: src/components/dashboard/BooksSnapshotCard.tsx
// "Where do I stand?" — the four numbers QuickBooks and Xero lead with:
// owed to you, you owe, cash, this month's profit. All from the ledger
// (get_books_snapshot), so they match the reports to the cent. Bank lines
// still waiting in For review aren't in them yet; the card says how many.
//
// In a firm client's books (clientId set) there are no invoices or bills
// (those live in the workspace's own books), so only cash and profit show.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '../../lib/currency'
import { getBooksSnapshot, type BooksSnapshot } from '../../services/reports.service'

interface Props {
  orgId:     string
  clientId?: string | null
  /** Where "For review" lives for this scope; omit to hide the link (portal). */
  reviewPath?: string
}

export default function BooksSnapshotCard({ orgId, clientId = null, reviewPath }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [snap, setSnap] = useState<BooksSnapshot | null>(null)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    getBooksSnapshot(orgId, clientId)
      .then(s => { if (alive) setSnap(s) })
      .catch(() => { if (alive) setSnap(null) })
    return () => { alive = false }
  }, [orgId, clientId])

  if (!snap) return null

  const tiles = [
    ...(clientId ? [] : [
      { label: t('snapshot.owedToYou'), value: snap.owed_to_you,
        sub: snap.owed_overdue > 0 ? t('snapshot.overdue', { amount: formatCurrency(snap.owed_overdue) }) : null,
        color: 'var(--sem-green)' },
      { label: t('snapshot.youOwe'), value: snap.you_owe,
        sub: snap.you_owe_overdue > 0 ? t('snapshot.overdue', { amount: formatCurrency(snap.you_owe_overdue) }) : null,
        color: 'var(--sem-red-soft)' },
    ]),
    { label: t('snapshot.cash'), value: snap.cash, sub: null, color: 'var(--lp-text)' },
    { label: t('snapshot.profitThisMonth'), value: snap.month.profit,
      sub: t('snapshot.lastMonth', { amount: formatCurrency(snap.last_month.profit) }),
      color: snap.month.profit >= 0 ? 'var(--sem-green)' : 'var(--sem-red)' },
  ]

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {tiles.map(tile => (
          <div key={tile.label} style={{
            background: 'var(--lp-surface)', border: '0.5px solid var(--lp-border)', borderRadius: 12, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', fontWeight: 500 }}>{tile.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: tile.color, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
              {formatCurrency(tile.value)}
            </div>
            {tile.sub && <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>{tile.sub}</div>}
          </div>
        ))}
      </div>
      {snap.to_review > 0 && (
        <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 8 }}>
          {t('snapshot.toReview', { count: snap.to_review })}
          {reviewPath && (
            <button className="lp-btn lp-btn-ghost" style={{ fontSize: 12, padding: '2px 8px', marginLeft: 8 }}
              onClick={() => navigate(reviewPath)}>
              {t('snapshot.openReview')}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
