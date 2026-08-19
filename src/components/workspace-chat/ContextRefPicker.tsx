// PATH: src/components/workspace-chat/ContextRefPicker.tsx
// Picker for linking a workspace message to a ledger entity:
// transactions, accounts, or period controls for the active client.

import { useState, useEffect, useRef } from 'react'
import { db }                           from '../../lib/supabase'
import type { ContextRef }              from '../../services/workspace-chat.service'
import { formatDateShort }              from '../../lib/dates'
import { formatCurrency }               from '../../lib/currency'

interface Props {
  orgId:    string
  clientId: string
  onSelect: (ref: ContextRef) => void
  onClose:  () => void
}

type Tab = 'transaction' | 'account' | 'period'

interface TxRow    { id: string; description: string | null; merchant_name: string | null; amount: number; transaction_date: string; semaphore: string }
interface AccRow   { id: string; code: string; name: string; type: string }
interface PeriodRow{ client_id: string; period_month: number; period_year: number; status: string }

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function semaphoreIcon(s: string) {
  if (s === 'green')  return '🟢'
  if (s === 'amber')  return '🟡'
  if (s === 'red')    return '🔴'
  return '⚪'
}

function periodKey(r: PeriodRow) { return `${r.period_year}-${r.period_month}` }

export default function ContextRefPicker({ orgId, clientId, onSelect, onClose }: Props) {
  const [tab,         setTab]         = useState<Tab>('transaction')
  const [search,      setSearch]      = useState('')
  const [txRows,      setTxRows]      = useState<TxRow[]>([])
  const [accRows,     setAccRows]     = useState<AccRow[]>([])
  const [periodRows,  setPeriodRows]  = useState<PeriodRow[]>([])
  const [loading,     setLoading]     = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Focus search on mount
  useEffect(() => { searchRef.current?.focus() }, [])

  // Fetch when tab or clientId changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSearch('')

    async function fetchData() {
      try {
        if (tab === 'transaction') {
          const { data } = await db
            .from('transactions')
            .select('id, description, merchant_name, amount, transaction_date, semaphore')
            .eq('org_id', orgId)
            .eq('client_id', clientId)
            .eq('is_current', true)
            .order('transaction_date', { ascending: false })
            .limit(200)
          if (!cancelled) setTxRows((data ?? []) as TxRow[])
        } else if (tab === 'account') {
          const { data } = await db
            .from('accounts')
            .select('id, code, name, type')
            .eq('org_id', orgId)
            .eq('client_id', clientId)
            .eq('is_active', true)
            .order('code')
            .limit(200)
          if (!cancelled) setAccRows((data ?? []) as AccRow[])
        } else {
          const { data } = await db
            .from('period_controls')
            .select('client_id, period_month, period_year, status')
            .eq('org_id', orgId)
            .eq('client_id', clientId)
            .order('period_year', { ascending: false })
            .order('period_month', { ascending: false })
            .limit(60)
          if (!cancelled) setPeriodRows((data ?? []) as PeriodRow[])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [tab, orgId, clientId])

  // Keyboard: Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const q = search.trim().toLowerCase()

  const filteredTx = txRows.filter(r => {
    const label = `${r.merchant_name ?? r.description ?? ''}`.toLowerCase()
    return !q || label.includes(q)
  })

  const filteredAcc = accRows.filter(r =>
    !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
  )

  const filteredPeriods = periodRows.filter(r => {
    const label = `${MONTH_NAMES[r.period_month - 1]} ${r.period_year}`.toLowerCase()
    return !q || label.includes(q) || r.status.toLowerCase().includes(q)
  })

  function pickTx(r: TxRow) {
    const name   = r.merchant_name ?? r.description ?? 'Transaction'
    const amount = formatCurrency(Math.abs(r.amount))
    onSelect({
      type:      'transaction',
      id:        r.id,
      label:     `${name} · ${amount} · ${r.semaphore}`,
      client_id: clientId,
    })
  }

  function pickAcc(r: AccRow) {
    onSelect({
      type:      'account',
      id:        r.id,
      label:     `${r.code} · ${r.name}`,
      client_id: clientId,
    })
  }

  function pickPeriod(r: PeriodRow) {
    onSelect({
      type:      'period',
      id:        periodKey(r),
      label:     `${MONTH_NAMES[r.period_month - 1]} ${r.period_year} · ${r.status}`,
      client_id: clientId,
    })
  }

  const rowStyle: React.CSSProperties = {
    width: '100%', textAlign: 'left', padding: '7px 12px',
    background: 'transparent', border: 'none',
    borderBottom: '0.5px solid var(--lp-border)',
    color: 'var(--lp-text)', fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
  }

  return (
    <div
      style={{
        position: 'absolute', bottom: '100%', left: 0, right: 0,
        marginBottom: 6,
        background: 'var(--lp-surface)',
        border: '0.5px solid var(--lp-border)',
        borderRadius: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
        maxHeight: 320, zIndex: 900,
        overflow: 'hidden',
      }}
    >
      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: '0.5px solid var(--lp-border)',
        flexShrink: 0,
      }}>
        {(['transaction', 'account', 'period'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '7px 4px', border: 'none', fontFamily: 'inherit',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: tab === t ? 'var(--lp-surface-2)' : 'transparent',
              color: tab === t ? 'var(--lp-accent)' : 'var(--lp-text-muted)',
              borderBottom: tab === t ? '2px solid var(--lp-accent)' : '2px solid transparent',
              textTransform: 'capitalize', transition: 'all 0.1s',
            }}
          >
            {t === 'transaction' ? '💳 Transactions' : t === 'account' ? '📚 Accounts' : '🔒 Periods'}
          </button>
        ))}
        <button
          onClick={onClose}
          style={{
            padding: '7px 10px', border: 'none', background: 'transparent',
            color: 'var(--lp-text-muted)', cursor: 'pointer', fontSize: 14,
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '7px 10px', borderBottom: '0.5px solid var(--lp-border)', flexShrink: 0 }}>
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={
            tab === 'transaction' ? 'Search transactions…'
            : tab === 'account'  ? 'Search accounts…'
            : 'Search periods…'
          }
          style={{
            width: '100%', padding: '5px 9px', borderRadius: 6,
            background: 'var(--lp-surface-2)',
            border: '0.5px solid var(--lp-border)',
            color: 'var(--lp-text)', fontSize: 12, fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 11.5, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
            Loading…
          </div>
        ) : tab === 'transaction' ? (
          filteredTx.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 11.5, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
              No transactions found
            </div>
          ) : filteredTx.map(r => (
            <button
              key={r.id}
              onClick={() => pickTx(r)}
              style={rowStyle}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span>{semaphoreIcon(r.semaphore)}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.merchant_name ?? r.description ?? '—'}
              </span>
              <span style={{ color: 'var(--lp-text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(Math.abs(r.amount))}
              </span>
              <span style={{ color: 'var(--lp-text-muted)', fontSize: 10.5, flexShrink: 0 }}>
                {formatDateShort(r.transaction_date, { withYear: false })}
              </span>
            </button>
          ))
        ) : tab === 'account' ? (
          filteredAcc.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 11.5, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
              No accounts found
            </div>
          ) : filteredAcc.map(r => (
            <button
              key={r.id}
              onClick={() => pickAcc(r)}
              style={rowStyle}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--lp-text-muted)', flexShrink: 0, fontSize: 11 }}>
                {r.code}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </span>
              <span style={{ color: 'var(--lp-text-muted)', fontSize: 10.5, flexShrink: 0, textTransform: 'capitalize' }}>
                {r.type}
              </span>
            </button>
          ))
        ) : (
          filteredPeriods.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 11.5, color: 'var(--lp-text-muted)', fontStyle: 'italic' }}>
              No periods found
            </div>
          ) : filteredPeriods.map(r => (
            <button
              key={periodKey(r)}
              onClick={() => pickPeriod(r)}
              style={rowStyle}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--lp-surface-2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ flex: 1 }}>
                {MONTH_NAMES[r.period_month - 1]} {r.period_year}
              </span>
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 100,
                background: r.status === 'closed' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                color: r.status === 'closed' ? 'var(--sem-red)' : 'var(--sem-green)',
                fontWeight: 600, textTransform: 'capitalize',
              }}>
                {r.status}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
