// PATH: src/components/transactions/NewTransactionDialog.tsx
//
// Manual transaction entry — the Starter plan's first advertised feature,
// which had real backend support (createTransaction / useCreateTransaction)
// but no UI anywhere actually called it. This is that missing entry point.

import { useState, type FormEvent } from 'react'
import Modal from '../ui/modal'
import { useCreateTransaction } from '../../hooks/useTransactions'

interface Props {
  open:      boolean
  onClose:   () => void
  orgId:     string
  clientId?: string | null
}

type Direction = 'expense' | 'income'

export default function NewTransactionDialog({ open, onClose, orgId, clientId }: Props) {
  const create = useCreateTransaction(orgId)

  const [direction, setDirection]   = useState<Direction>('expense')
  const [amount, setAmount]         = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate]             = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError]           = useState<string | null>(null)

  function reset() {
    setDirection('expense')
    setAmount('')
    setDescription('')
    setDate(new Date().toISOString().slice(0, 10))
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const magnitude = Number(amount)
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      setError('Enter an amount greater than 0.')
      return
    }
    if (!description.trim()) {
      setError('Enter a description.')
      return
    }

    try {
      await create.mutateAsync({
        orgId,
        clientId: clientId ?? null,
        source: 'manual',
        amount: direction === 'expense' ? -magnitude : magnitude,
        description: description.trim(),
        transactionDate: date
      })
      window.dispatchEvent(new Event('lp:tx-updated'))
      reset()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Could not save the transaction.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      title="New transaction"
      subtitle="Log a transaction that didn't come from a bank feed."
      width={420}
      footer={
        <>
          <button className="lp-btn lp-btn-ghost" onClick={() => { reset(); onClose() }} type="button">
            Cancel
          </button>
          <button className="lp-btn lp-btn-primary" onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add transaction'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 6 }}>
            Type
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['expense', 'income'] as Direction[]).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className="lp-btn"
                style={{
                  flex: 1, justifyContent: 'center',
                  background: direction === d
                    ? (d === 'expense' ? 'var(--sem-red-bg)' : 'var(--sem-green-bg)')
                    : 'transparent',
                  border: `0.5px solid ${direction === d
                    ? (d === 'expense' ? 'var(--sem-red)' : 'var(--sem-green)')
                    : 'var(--lp-border)'}`,
                  color: direction === d
                    ? (d === 'expense' ? 'var(--sem-red)' : 'var(--sem-green)')
                    : 'var(--lp-text-muted)'
                }}
              >
                {d === 'expense' ? 'Expense' : 'Income'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 6 }}>
            Amount
          </label>
          <input
            className="lp-input" type="number" min="0.01" step="0.01"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
            required autoFocus
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 6 }}>
            Description
          </label>
          <input
            className="lp-input" placeholder="e.g. Office supplies from Staples"
            value={description} onChange={e => setDescription(e.target.value)} required
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 6 }}>
            Date
          </label>
          <input
            className="lp-input" type="date" value={date} onChange={e => setDate(e.target.value)} required
          />
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 7,
            background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)',
            fontSize: 12.5, color: 'var(--sem-red)'
          }}>
            {error}
          </div>
        )}
      </form>
    </Modal>
  )
}
