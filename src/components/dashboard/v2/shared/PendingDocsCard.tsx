// PATH: src/components/dashboard/v2/PendingDocsCard.tsx
//
// P3 — Pending Documents card.
//
// AL's pedido #5 (literal):
//   "no veo la opción para el dashboard del bookkeeper para subir un
//    documento para un cliente x por una transacción"
//
// This widget surfaces transactions that NEED a document attached (amber or
// red semaphore, without a document already linked) and gives the bookkeeper
// a one-click 📎 Upload action per row, scoped to (client_id, transaction_id).
//
// Single Responsibility:
//   · Render a compact list of transactions awaiting documentation
//   · Provide per-row upload CTA wired to UploadReceiptDialog
//   · NO data fetching here — receives items as props from the dashboard hook
//
// Constitution-compliant:
//   · Zero hardcoded colors — all via --lp-*, --sem-*, --chat-* tokens
//   · No backend computation in the UI — items are pre-computed by the parent
//   · Theme-aware (works in dark and light mode)

import { useState } from 'react'
import UploadReceiptDialog from '../../../upload/UploadReceiptDialog'
import {
  openOrGetTransactionConversation,
  sendTransactionMessage
} from '../../../../services/chat-tx.service'
import { formatCurrency } from '../../../../lib/currency'

// ── Public types ────────────────────────────────────────────────────────────

export interface PendingDocItem {
  transaction_id:    string
  transaction_date:  string
  merchant:          string | null
  description:       string | null
  amount:            number
  currency:          string
  semaphore:         'amber' | 'red'
  client_id:         string | null
  client_name:       string | null
}

interface Props {
  orgId:        string
  items:        PendingDocItem[]
  /** Max rows to show; default 5 */
  maxItems?:    number
  /** Called after an upload+chat post completes so the parent can refresh */
  onUploaded?: (transactionId: string) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export default function PendingDocsCard({
  orgId, items, maxItems = 5, onUploaded
}: Props) {
  const [activeTx,    setActiveTx]    = useState<PendingDocItem | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  const visible = items.slice(0, maxItems)

  async function handleUploaded(documentId: string) {
    if (!activeTx) return
    const txId    = activeTx.transaction_id
    setActiveTx(null)
    setError(null)
    try {
      const conversationId = await openOrGetTransactionConversation(txId)
      await sendTransactionMessage({
        conversationId,
        body:           '📎 Document attached',
        documentId,
        messageKind:    'out'
      })
      onUploaded?.(txId)
    } catch (e: any) {
      setError(e?.message ?? 'Document uploaded, but could not post to chat.')
    }
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '20px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.4 }}>📄</div>
        <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
          No transactions awaiting documents
        </div>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div style={{
          margin:       '8px 10px',
          padding:      '7px 10px',
          background:   'var(--sem-red-bg)',
          color:        'var(--sem-red)',
          fontSize:     11,
          borderRadius: 6,
          border:       '0.5px solid var(--sem-red)'
        }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visible.map((it, i) => (
          <PendingDocRow
            key={it.transaction_id}
            item={it}
            isLast={i === visible.length - 1}
            onAttachClick={() => { setError(null); setActiveTx(it) }}
          />
        ))}
      </div>

      {/* Summary footer */}
      {items.length > maxItems && (
        <div style={{
          padding:    '8px 12px',
          borderTop:  '0.5px solid var(--lp-border)',
          fontSize:   11,
          color:      'var(--lp-text-muted)',
          textAlign:  'center',
          background: 'var(--lp-surface-2)'
        }}>
          + {items.length - maxItems} more awaiting documents
        </div>
      )}

      {/* Upload modal */}
      <UploadReceiptDialog
        open={activeTx !== null}
        onClose={() => setActiveTx(null)}
        orgId={orgId}
        onUploaded={handleUploaded}
        {...(activeTx?.client_id != null ? { clientId: activeTx.client_id } : {})}
        {...(activeTx?.transaction_id != null ? { transactionId: activeTx.transaction_id } : {})}
      />
    </>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────────

function PendingDocRow({
  item, isLast, onAttachClick
}: {
  item:          PendingDocItem
  isLast:        boolean
  onAttachClick: () => void
}) {
  const semColor = item.semaphore === 'red' ? 'var(--sem-red)' : 'var(--sem-amber)'

  const amount = formatCurrency(item.amount, item.currency)

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            10,
      padding:        '9px 12px',
      borderBottom:   isLast ? 'none' : '0.5px solid var(--chat-row-divider)',
      transition:     'background 0.12s'
    }}>
      {/* Semaphore dot */}
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: semColor, flexShrink: 0
      }} />

      {/* Tx info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:      12.5,
          fontWeight:    500,
          color:         'var(--lp-text)',
          whiteSpace:    'nowrap',
          overflow:      'hidden',
          textOverflow:  'ellipsis'
        }}>
          {item.merchant ?? item.description ?? 'Transaction'}
        </div>
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        6,
          fontSize:   10.5,
          color:      'var(--lp-text-muted)',
          marginTop:  2
        }}>
          <span style={{ fontFamily: 'monospace' }}>{amount}</span>
          {item.client_name && (
            <>
              <span>·</span>
              <span style={{
                whiteSpace:   'nowrap',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                maxWidth:     120
              }}>
                {item.client_name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Attach button */}
      <button
        onClick={onAttachClick}
        title="Attach a document to this transaction"
        style={{
          background:   'var(--chat-bubble-mine-bg)',
          border:       '0.5px solid var(--chat-bubble-mine-border)',
          color:        'var(--lp-accent)',
          borderRadius: 6,
          padding:      '5px 9px',
          fontSize:     10.5,
          fontWeight:   600,
          fontFamily:   'inherit',
          cursor:       'pointer',
          whiteSpace:   'nowrap',
          flexShrink:   0
        }}
      >
        📎 Attach
      </button>
    </div>
  )
}
