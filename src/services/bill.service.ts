// PATH: src/services/bill.service.ts
//
// Bills (accounts payable) — Bookkeeper/Accountant plan feature (the server
// refuses it on other plans, LB009).
//
// Every write posts to the ledger by itself (bills_ledger.sql):
//   · a bill            Dr its expense account / Cr Accounts Payable, on bill_date
//   · markBillPaid      Dr AP / Cr Bill Payments in Transit -- the money left
//                       outside the app; the bank withdrawal then shows up in
//                       "For review" as "Withdrawal of the payment for bill X"
//   · a bill paid straight from the bank feed (the review inbox matched the
//     withdrawal to the open bill) posts nothing here: the bank line is
//     Dr AP / Cr Bank. Either way the payment is counted exactly once.
// Nothing here moves money; paying still happens by check/ACH/wire.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'
import type { VendorBill, InsertVendorBill, VendorBillStatus } from '../types/database.types'

export type { VendorBill, VendorBillStatus }

export interface ListBillsOptions {
  clientId?: string | null
  status?:   VendorBillStatus
}

export async function listBills(
  orgId: string,
  opts: ListBillsOptions = {}
): Promise<VendorBill[]> {
  let q = db.from('vendor_bills').select('*').eq('org_id', orgId)
  if (opts.clientId !== undefined) {
    q = opts.clientId === null ? q.is('client_id', null) : q.eq('client_id', opts.clientId)
  }
  if (opts.status) q = q.eq('status', opts.status)
  const { data, error } = await q.order('due_date')
  if (error) throw dbError(error, 'Failed to load bills')
  return data ?? []
}

export async function createBill(
  input: Omit<InsertVendorBill, 'status' | 'paid_at' | 'paid_amount'>
): Promise<VendorBill> {
  const { data, error } = await db.from('vendor_bills').insert(input).select().single()
  if (error) throw dbError(error, 'Failed to create the bill')
  return data
}

/** Paid outside the app, for the full amount (partial payments: LB004). */
export async function markBillPaid(
  id: string,
  paidAt: string = new Date().toISOString()
): Promise<VendorBill> {
  const { data, error } = await db
    .from('vendor_bills')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', id)
    .neq('status', 'paid')
    .select()
    .single()
  if (error) throw dbError(error, 'Failed to mark the bill as paid')
  return data
}

/** Undo "Mark paid" -- refused once a bank withdrawal is matched (LB006). */
export async function markBillUnpaid(bill: VendorBill): Promise<VendorBill> {
  const overdue = bill.due_date < new Date().toISOString().slice(0, 10)
  const { data, error } = await db
    .from('vendor_bills')
    .update({ status: overdue ? 'overdue' : 'pending' })
    .eq('id', bill.id)
    .select()
    .single()
  if (error) throw dbError(error, 'Failed to mark the bill as unpaid')
  return data
}

/** open | paid, waiting for the bank withdrawal | paid and matched to the bank. */
export type BillPaymentState = 'open' | 'in_transit' | 'settled'

export function billPaymentState(bill: VendorBill): BillPaymentState {
  if (bill.status !== 'paid') return 'open'
  return bill.transaction_id || bill.paid_via === 'bank' ? 'settled' : 'in_transit'
}

export async function deleteBill(id: string): Promise<void> {
  const { error } = await db.from('vendor_bills').delete().eq('id', id)
  if (error) throw dbError(error, 'Failed to delete the bill')
}

// ── Reminder status (client-side, not a stored value) ───────────────────────
// "overdue" in the DB column only flips via markBillOverdue below (no cron
// yet); this derives the badge a user actually sees from due_date so a bill
// reads as overdue the moment it's late, without waiting on a background job.

export type BillUrgency = 'overdue' | 'due_soon' | 'upcoming' | 'paid'

export function billUrgency(bill: VendorBill, today: Date = new Date()): BillUrgency {
  if (bill.status === 'paid') return 'paid'
  const due = new Date(bill.due_date)
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 7) return 'due_soon'
  return 'upcoming'
}

/** Flips DB status to 'overdue' for any still-pending bill past its due date. */
export async function syncOverdueBills(orgId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await db
    .from('vendor_bills')
    .update({ status: 'overdue' })
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .lt('due_date', today)
  if (error) throw dbError(error, 'Failed to refresh overdue bills')
}
