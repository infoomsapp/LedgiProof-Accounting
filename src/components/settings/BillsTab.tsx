// PATH: src/components/settings/BillsTab.tsx
// Bills (accounts payable) — Bookkeeper/Accountant plan feature.
// Each bill posts itself to the ledger (Dr expense / Cr Accounts Payable);
// "Mark paid" records a payment made outside the app, which the bank
// withdrawal later clears in "For review". Does not move money (see
// bill.service.ts).

import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import FeatureGate from './FeatureGate'
import {
  listBills, createBill, markBillPaid, markBillUnpaid, deleteBill, syncOverdueBills, billUrgency,
  billPaymentState, type VendorBill, type BillUrgency
} from '../../services/bill.service'
import { listVendors, type Vendor } from '../../services/vendor.service'
import { getAccounts } from '../../services/accounts.service'
import type { Account } from '../../types/database.types'

interface Props {
  onMessage: (m: { type: 'ok' | 'err'; text: string }) => void
}

const URGENCY_CONFIG: Record<BillUrgency, { label: string; color: string }> = {
  overdue:  { label: 'Overdue',   color: 'var(--sem-red)' },
  due_soon: { label: 'Due soon',  color: 'var(--sem-amber)' },
  upcoming: { label: 'Upcoming',  color: 'var(--lp-text-muted)' },
  paid:     { label: 'Paid',      color: 'var(--sem-green)' },
}

export default function BillsTab({ onMessage }: Props) {
  return (
    <FeatureGate
      featureKey="bill_tracking"
      title="Bill tracking & reminders"
      description="Track what you owe vendors, when it's due, and mark bills paid once you send the payment yourself. Available on the Bookkeeper and Accountant plans."
    >
      <BillsTabContent onMessage={onMessage} />
    </FeatureGate>
  )
}

function BillsTabContent({ onMessage }: Props) {
  const { membership } = useAuthStore()
  const orgId = membership?.org_id ?? ''

  const [bills,   setBills]   = useState<VendorBill[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!orgId) return
    load()
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      await syncOverdueBills(orgId)
      const [b, v, a] = await Promise.all([listBills(orgId), listVendors(orgId), getAccounts(orgId)])
      setBills(b)
      setVendors(v)
      // Workspace-own leaf accounts: where a bill's cost can go (expense, or
      // an asset such as prepaid / equipment) -- the same scope the server checks.
      const own     = a.filter(x => x.client_id == null && x.is_active !== false)
      const parents = new Set(own.map(x => x.parent_id).filter(Boolean))
      setAccounts(own.filter(x => !parents.has(x.id) && (x.type === 'expense' || x.type === 'asset')))
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not load bills' })
    } finally {
      setLoading(false)
    }
  }

  async function handlePaid(bill: VendorBill) {
    try {
      await markBillPaid(bill.id)
      onMessage({ type: 'ok', text: 'Bill marked as paid. Its bank withdrawal will be matched in For review.' })
      load()
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not update the bill' })
    }
  }

  async function handleUnpaid(bill: VendorBill) {
    try {
      await markBillUnpaid(bill)
      onMessage({ type: 'ok', text: 'Payment removed; the bill is open again.' })
      load()
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not update the bill' })
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteBill(id)
      load()
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not delete the bill' })
    }
  }

  const vendorName = (id: string) => vendors.find(v => v.id === id)?.legal_name ?? 'Unknown vendor'
  const pending = bills.filter(b => b.status !== 'paid')
  const paid    = bills.filter(b => b.status === 'paid')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="lp-page-title" style={{ fontSize: 16 }}>Vendor bills</div>
          <div className="lp-page-sub">Track what's owed and when it's due.</div>
        </div>
        <button className="lp-btn lp-btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : 'Add bill'}
        </button>
      </div>

      {showForm && (
        <NewBillForm
          orgId={orgId}
          vendors={vendors}
          accounts={accounts}
          onCreated={() => { setShowForm(false); load() }}
          onError={text => onMessage({ type: 'err', text })}
        />
      )}

      {loading ? (
        <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>
      ) : bills.length === 0 ? (
        <div className="lp-card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--lp-text-muted)', fontSize: 13 }}>
          No bills tracked yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...pending, ...paid].map(bill => {
            const urgency = billUrgency(bill)
            const cfg = URGENCY_CONFIG[urgency]
            const state = billPaymentState(bill)
            return (
              <div key={bill.id} className="lp-card" style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--lp-text)' }}>
                    {vendorName(bill.vendor_id)}
                    {bill.bill_number && <span style={{ color: 'var(--lp-text-muted)', fontWeight: 400 }}> · {bill.bill_number}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                    Due {new Date(bill.due_date + 'T12:00:00').toLocaleDateString()}
                    {state === 'in_transit' && ' · paid, waiting for the bank withdrawal'}
                    {state === 'settled' && ' · paid and matched to the bank'}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', fontFamily: 'monospace' }}>
                  ${bill.amount.toFixed(2)}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 100,
                  color: cfg.color, background: `${cfg.color}15`, border: `0.5px solid ${cfg.color}40`
                }}>
                  {cfg.label}
                </span>
                {state === 'open' && (
                  <button className="lp-btn lp-btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                    onClick={() => handlePaid(bill)}>
                    Mark paid
                  </button>
                )}
                {state === 'in_transit' && (
                  <button className="lp-btn lp-btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                    onClick={() => handleUnpaid(bill)}>
                    Mark unpaid
                  </button>
                )}
                {state === 'open' && (
                  <button
                    onClick={() => handleDelete(bill.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--lp-text-muted)', fontSize: 12, padding: 4 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NewBillForm({
  orgId, vendors, accounts, onCreated, onError
}: { orgId: string; vendors: Vendor[]; accounts: Account[]; onCreated: () => void; onError: (t: string) => void }) {
  const [vendorId, setVendorId]   = useState('')
  const [billNumber, setBillNumber] = useState('')
  const [amount, setAmount]       = useState('')
  const [dueDate, setDueDate]     = useState('')
  const [billDate, setBillDate]   = useState(new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState('')
  const [saving, setSaving]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!vendorId || !amount || !dueDate) return
    setSaving(true)
    try {
      await createBill({
        org_id: orgId,
        vendor_id: vendorId,
        bill_number: billNumber || null,
        amount: Number(amount),
        due_date: dueDate,
        bill_date: billDate,
        // Empty = the vendor's default expense account, else Uncategorized (server-side).
        expense_account_id: accountId || null
      })
      onCreated()
    } catch (e: any) {
      onError(e?.message ?? 'Could not create the bill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="lp-card" style={{ marginBottom: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignItems: 'end' }}>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Vendor</label>
        <select className="lp-input" value={vendorId} onChange={e => setVendorId(e.target.value)} required>
          <option value="">Select vendor…</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.legal_name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Bill # (optional)</label>
        <input className="lp-input" value={billNumber} onChange={e => setBillNumber(e.target.value)} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Amount</label>
        <input className="lp-input" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Bill date</label>
        <input className="lp-input" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} required />
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Category</label>
        <select className="lp-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">Vendor default / Uncategorized</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: 12, color: 'var(--lp-text-muted)', display: 'block', marginBottom: 4 }}>Due date</label>
        <input className="lp-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
      </div>
      <button className="lp-btn lp-btn-primary" type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Add bill'}
      </button>
    </form>
  )
}
