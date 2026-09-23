// PATH: src/components/pyme/ReceiptRequestsCard.tsx
// Shows pending receipt requests from the bookkeeper.
// Each row: what merchant/amount/date is needed + Upload action.

import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { PymeReceiptRequest } from '../../services/pyme-dashboard.service'
import { formatDateShort } from '../../lib/dates'

interface Props {
  requests: PymeReceiptRequest[]
  /** Called when user clicks "Upload" for a specific request. If not provided, falls back to navigate. */
  onUploadRequest?: (request: PymeReceiptRequest) => void
}

const fmt = (n: number | null) => {
  if (n == null) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 2
  }).format(n)
}

export default function ReceiptRequestsCard({ requests, onUploadRequest }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (requests.length === 0) return null

  return (
    <div style={{
      background: 'var(--lp-surface)',
      border: '0.5px solid var(--lp-border)',
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16
    }}>
      <div style={{
        padding: '12px 18px',
        borderBottom: '0.5px solid var(--lp-border)',
        fontSize: 11, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span>{t('pyme.receiptsRequestedTitle')}</span>
        <span style={{
          fontSize: 11, color: '#3b82f6', textTransform: 'none',
          letterSpacing: 0, fontWeight: 500
        }}>
          {t('pyme.pendingCount', { count: requests.length })}
        </span>
      </div>

      <div>
        {requests.slice(0, 5).map((req, i) => (
          <div
            key={req.id}
            style={{
              padding: '12px 18px',
              borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.03)' : 'none',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 12, alignItems: 'center'
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, color: 'var(--lp-text)', fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {req.merchant_hint ?? t('pyme.receiptRequested')}
                {req.amount_hint != null && (
                  <span style={{
                    fontFamily: 'monospace', fontSize: 12,
                    color: 'var(--lp-text-muted)', marginLeft: 8
                  }}>
                    {fmt(req.amount_hint)}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                {req.date_hint && (
                  <span>{formatDateShort(req.date_hint)}</span>
                )}
                {req.request_note && (
                  <span style={{ display: 'block', marginTop: 4, color: 'var(--lp-text-muted)' }}>
                    "{req.request_note}"
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                if (onUploadRequest) {
                  onUploadRequest(req)
                } else {
                  navigate(
                    req.transaction_id
                      ? `/transactions?id=${req.transaction_id}&upload=receipt&request=${req.id}`
                      : `/receipts?request=${req.id}`
                  )
                }
              }}
              style={{
                padding: '6px 12px', borderRadius: 7,
                background: 'rgba(59,130,246,0.12)',
                border: '0.5px solid rgba(59,130,246,0.35)',
                color: '#60a5fa',
                fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap'
              }}
            >
              {t('pyme.uploadArrow')}
            </button>
          </div>
        ))}

        {requests.length > 5 && (
          <button
            onClick={() => navigate('/receipts?filter=requested')}
            style={{
              width: '100%', padding: '9px 18px',
              background: 'rgba(255,255,255,0.02)',
              border: 'none', borderTop: '0.5px solid var(--lp-border)',
              fontSize: 11.5, color: '#3b82f6',
              cursor: 'pointer', fontFamily: 'inherit',
              textAlign: 'center'
            }}
          >
            {t('pyme.viewMoreRequests', { count: requests.length - 5 })}
          </button>
        )}
      </div>
    </div>
  )
}