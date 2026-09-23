// PATH: src/components/transactions/AccountAssignment.tsx
// Embedded in TransactionDetail for amber/red/green transactions.
// Lets the bookkeeper:
//   1. Pick a debit account (expense/asset) and a credit account (income/liability)
//   2. Optionally override the amount
//   3. Post a balanced journal entry
//   4. Transaction semaphore → blue after posting
//
// The brain assigns the semaphore; the bookkeeper assigns the accounts.

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth.store'
import { postJournalEntries } from '../../services/journal.service'
import { approveTransaction } from '../../services/transactions.service'
import type { Transaction, Account, LpRole } from '../../types/database.types'

interface AccountAssignmentProps {
  transaction: Transaction
  orgId: string
  onPosted?: () => void
}

type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

const TYPE_COLOR: Record<AccountType, string> = {
  asset: '#60a5fa',
  liability: '#f472b6',
  equity: '#a78bfa',
  income: '#34d399',
  expense: '#fb923c'
}

const POST_ALLOWED_ROLES: LpRole[] = ['owner', 'admin', 'accountant', 'approver']

export default function AccountAssignment({
  transaction: tx,
  orgId,
  onPosted
}: AccountAssignmentProps) {
  const { profile, user, membership } = useAuthStore()

  const actorId = user?.id ?? profile?.id ?? ''
  const workspaceRole: LpRole = membership?.role ?? 'readonly'
  const canPost = POST_ALLOWED_ROLES.includes(workspaceRole)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [debitId, setDebitId] = useState('')
  const [creditId, setCreditId] = useState('')
  const [memo, setMemo] = useState('')
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<any[]>([])

  // Load accounts + check if entries already posted
  useEffect(() => {
    if (!orgId) return

    Promise.all([
      db.from('accounts')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('code'),
      db.from('journal_entries')
        .select(`
          id, entry_type, amount, accounts(code, name, type)
        `)
        .eq('transaction_id', tx.id)
        .eq('is_reversed', false)
    ]).then(([accs, entries]) => {
      setAccounts((accs.data ?? []) as Account[])
      const e = (entries.data ?? []) as any[]
      setExisting(e)
      if (e.length > 0) setPosted(true)
    })
  }, [orgId, tx.id])

  // Smart default: detect transaction direction
  // Positive amount = income/credit  → debit Checking, credit Revenue
  // Negative amount = expense/debit  → debit Expense, credit Checking
  useEffect(() => {
    if (accounts.length === 0 || existing.length > 0) return

    const checking = accounts.find(a =>
      a.code === '1020' || a.name.toLowerCase().includes('checking')
    )

    if (tx.amount > 0) {
      const revenue = accounts.find(a => a.type === 'income')
      if (checking) setDebitId(checking.id)
      if (revenue) setCreditId(revenue.id)
    } else {
      const expense = accounts.find(a => a.type === 'expense' && a.level === 2)
      if (expense) setDebitId(expense.id)
      if (checking) setCreditId(checking.id)
    }
  }, [accounts, tx.amount, existing.length])

  async function handlePost() {
    if (!canPost) {
      setError('Your workspace role does not allow posting journal entries')
      return
    }

    if (!actorId) {
      setError('Authenticated user ID not available')
      return
    }

    if (!debitId || !creditId) {
      setError('Select both debit and credit accounts')
      return
    }

    if (debitId === creditId) {
      setError('Debit and credit accounts must be different')
      return
    }

    setPosting(true)
    setError(null)

    const amount = Math.abs(tx.amount)

    // 🐛 Real bug fixed (audit 2026-09-22): this used to post to "today's"
    // period (new Date()) instead of the transaction's own period, unlike
    // the canonical bulk-posting flow in journal.service.ts's
    // postTransactionToLedger(), which deliberately uses the transaction's
    // OWN date "so they land in the P&L period they actually occurred in".
    // Posting an old transaction here would silently misstate whichever
    // month it was actually reviewed in instead of the month it happened.
    const [year, month] = tx.transaction_date.split('-').map(Number) as [number, number]

    try {
      // 1. Post the balanced double-entry through the journal ENGINE.
      //    postJournalEntries() runs validateBalance() (>= 2 lines,
      //    debit === credit) before any INSERT — the raw insert this
      //    replaced skipped that guard entirely.
      await postJournalEntries(
        tx.id,
        [
          { accountId: debitId,  entryType: 'debit',  amount, currency: tx.currency, memo: memo || tx.description },
          { accountId: creditId, entryType: 'credit', amount, currency: tx.currency, memo: memo || tx.description }
        ],
        year,
        month,
        tx.currency
      )

      // 2. Verify → BLUE through the canonical approval path. Unlike the
      //    raw UPDATE this replaced, approveTransaction() writes the
      //    hash-chained audit_events entry (governance Audit Trail rule).
      //    Option B: verified, NOT locked — locking/immutability happens
      //    later at reconciliation / period close, not here.
      await approveTransaction({
        transactionId: tx.id,
        orgId,
        approverId: actorId,
        ...(memo ? { note: memo } : {})
      })

      setPosted(true)
      setPosting(false)
      onPosted?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post journal entry')
      setPosting(false)
    }
  }

  // ── Render posted state ────────────────────────────────────────────────
  if (posted && existing.length > 0) {
    return (
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 9,
          background: 'rgba(34,197,94,0.06)',
          border: '0.5px solid rgba(34,197,94,0.25)',
          marginTop: 14
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>
          ✓ Journal entry posted
        </div>
        {existing.map((e: any) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: 'var(--lp-text-muted)',
              padding: '3px 0'
            }}
          >
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background:
                    e.entry_type === 'debit'
                      ? 'rgba(96,165,250,0.12)'
                      : 'rgba(52,211,153,0.12)',
                  color: e.entry_type === 'debit' ? '#60a5fa' : '#34d399',
                  textTransform: 'uppercase'
                }}
              >
                {e.entry_type}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {e.accounts?.code}
              </span>
              {e.accounts?.name}
            </span>
            <span style={{ fontFamily: 'monospace' }}>
              ${Number(e.amount).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  function AccountSelect({
    label,
    value,
    onChange,
    excludeId
  }: {
    label: string
    value: string
    onChange: (v: string) => void
    excludeId?: string
  }) {
    const grouped = (['asset', 'liability', 'equity', 'income', 'expense'] as AccountType[])
      .map(type => ({
        type,
        accs: accounts.filter(a => a.type === type && a.id !== excludeId)
      }))
      .filter(g => g.accs.length > 0)

    return (
      <div>
        <label
          style={{
            fontSize: 11.5,
            color: 'var(--lp-text-muted)',
            display: 'block',
            marginBottom: 5
          }}
        >
          {label}
        </label>
        <select
          className="lp-input"
          style={{
            fontSize: 12.5,
            opacity: canPost ? 1 : 0.65,
            cursor: canPost ? 'pointer' : 'not-allowed'
          }}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={!canPost}
        >
          <option value="">Select account…</option>
          {grouped.map(({ type, accs }) => (
            <optgroup key={type} label={`── ${type.charAt(0).toUpperCase() + type.slice(1)}`}>
              {accs
                .sort((a, b) => a.code.localeCompare(b.code))
                .map(a => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>

        {value &&
          (() => {
            const acc = accounts.find(a => a.id === value)
            if (!acc) return null
            const color = TYPE_COLOR[acc.type as AccountType]

            return (
              <div style={{ marginTop: 5, fontSize: 11, color, display: 'flex', gap: 5 }}>
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 100,
                    background: `${color}12`,
                    border: `0.5px solid ${color}30`
                  }}
                >
                  {acc.type}
                </span>
                <span style={{ color: 'var(--lp-text-muted)' }}>
                  normal: {acc.normal_balance}
                </span>
              </div>
            )
          })()}
      </div>
    )
  }

  const amount = Math.abs(tx.amount)

  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--lp-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 10
        }}
      >
        Post journal entry
      </div>

      <div
        style={{
          fontSize: 11.5,
          color: canPost ? '#93c5fd' : '#fbbf24',
          marginBottom: 10
        }}
      >
        Workspace role: <strong style={{ textTransform: 'capitalize' }}>{workspaceRole}</strong>
      </div>

      {!canPost && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 7,
            marginBottom: 10,
            fontSize: 12,
            background: 'rgba(251,191,36,0.08)',
            border: '0.5px solid rgba(251,191,36,0.28)',
            color: '#fbbf24'
          }}
        >
          Your role can review this transaction, but cannot post journal entries or mark it Blue.
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '7px 10px',
            borderRadius: 7,
            marginBottom: 10,
            fontSize: 12,
            background: 'rgba(239,68,68,0.08)',
            border: '0.5px solid rgba(239,68,68,0.3)',
            color: '#ef4444'
          }}
        >
          {error}
        </div>
      )}

      {/* Amount preview */}
      <div
        style={{
          padding: '8px 12px',
          borderRadius: 7,
          marginBottom: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid var(--lp-border)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12.5
        }}
      >
        <span style={{ color: 'var(--lp-text-muted)' }}>Amount</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--lp-text)' }}>
          {tx.currency} {amount.toFixed(2)}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <AccountSelect
          label="Debit account (money goes out of / expense)"
          value={debitId}
          onChange={setDebitId}
          excludeId={creditId}
        />

        <AccountSelect
          label="Credit account (money comes from / income)"
          value={creditId}
          onChange={setCreditId}
          excludeId={debitId}
        />

        <div>
          <label
            style={{
              fontSize: 11.5,
              color: 'var(--lp-text-muted)',
              display: 'block',
              marginBottom: 5
            }}
          >
            Memo (optional)
          </label>
          <input
            className="lp-input"
            style={{
              fontSize: 12.5,
              opacity: canPost ? 1 : 0.65,
              cursor: canPost ? 'text' : 'not-allowed'
            }}
            placeholder={tx.description ?? 'Journal entry memo'}
            value={memo}
            onChange={e => setMemo(e.target.value)}
            disabled={!canPost}
          />
        </div>
      </div>

      {/* Double-entry preview */}
      {debitId && creditId && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 7,
            background: 'rgba(59,130,246,0.05)',
            border: '0.5px solid rgba(59,130,246,0.15)',
            fontSize: 12
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#60a5fa' }}>
              DR {accounts.find(a => a.id === debitId)?.name}
            </span>
            <span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>
              {amount.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 16 }}>
            <span style={{ color: '#34d399' }}>
              CR {accounts.find(a => a.id === creditId)?.name}
            </span>
            <span style={{ fontFamily: 'monospace', color: '#34d399' }}>
              {amount.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <button
        onClick={handlePost}
        disabled={posting || !debitId || !creditId || !canPost}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '9px 0',
          borderRadius: 8,
          border: 'none',
          cursor: posting || !debitId || !creditId || !canPost ? 'not-allowed' : 'pointer',
          background:
            posting || !debitId || !creditId || !canPost
              ? 'rgba(255,255,255,0.05)'
              : '#3b82f6',
          color:
            posting || !debitId || !creditId || !canPost
              ? '#334155'
              : '#fff',
          fontSize: 13,
          fontWeight: 500,
          fontFamily: 'inherit',
          opacity: posting ? 0.6 : 1,
          transition: 'all 0.15s'
        }}
      >
        {posting ? 'Posting…' : '✓ Post entry → mark Blue'}
      </button>
    </div>
  )
}