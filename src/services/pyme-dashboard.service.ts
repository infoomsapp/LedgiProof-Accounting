// PATH: src/services/pyme-dashboard.service.ts
// Wrappers around v26 RPCs for PYME dashboard.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PymeClientInfo {
  id:            string
  display_name:  string
  company_name:  string | null
  currency:      string
}

export interface PymeFirmInfo {
  org_id: string
  name:   string
  slug:   string
}

export interface PymePeriod {
  this_month_start:  string  // ISO date
  this_month_end:    string
  last_month_start:  string
  last_month_end:    string
}

export interface PymeKpiBlock {
  income:     number
  expenses:   number
  net_profit: number
  tx_count:   number
}

export interface PymePending {
  transactions_to_review:     number
  amber_count:                number
  red_count:                  number
  receipts_requested:         number
  unread_workspace_messages:  number
}

export interface PymeReceiptRequest {
  id:              string
  transaction_id:  string | null
  merchant_hint:   string | null
  amount_hint:     number | null
  date_hint:       string | null
  request_note:    string | null
  created_at:      string
}

export interface PymeRecentTx {
  tx_id:              string
  merchant:           string | null
  description:        string | null
  amount:             number
  currency:           string
  semaphore:          'blue' | 'green' | 'amber' | 'red'
  transaction_date:   string
  requires_review:    boolean
  has_message_thread: boolean
}

export interface PymeLatestMessage {
  conversation_id: string
  preview:         string
  sender_role:     'bookkeeper' | 'client' | 'system'
  sender_name:     string
  created_at:      string
  is_unread:       boolean
}

export interface PymeDashboardData {
  generated_at:               string
  client:                     PymeClientInfo
  firm:                       PymeFirmInfo
  period:                     PymePeriod
  kpis_this_month:            PymeKpiBlock
  kpis_last_month:            PymeKpiBlock
  pending:                    PymePending
  receipt_requests:           PymeReceiptRequest[]
  recent_transactions:        PymeRecentTx[]
  latest_workspace_message:   PymeLatestMessage | null
}

// ── RPCs ─────────────────────────────────────────────────────────────────────

export async function getPymeDashboard(clientId: string): Promise<PymeDashboardData> {
  const { data, error } = await db.rpc('get_pyme_dashboard', {
    p_client_id: clientId
  })
  if (error) throw new Error(error.message)
  return data as unknown as PymeDashboardData
}

export async function createReceiptRequest(input: {
  orgId:         string
  clientId:      string
  transactionId?: string
  merchantHint?: string
  amountHint?:   number
  dateHint?:     string
  note?:         string
}): Promise<{ request_id: string; status: string }> {
  const { data, error } = await db.rpc('create_receipt_request', pruneRpcArgs({
    p_org_id:         input.orgId,
    p_client_id:      input.clientId,
    p_transaction_id: input.transactionId ?? undefined,
    p_merchant_hint:  input.merchantHint  ?? undefined,
    p_amount_hint:    input.amountHint    ?? undefined,
    p_date_hint:      input.dateHint      ?? undefined,
    p_request_note:   input.note          ?? undefined
  }))
  if (error) throw new Error(error.message)
  return data as unknown as { request_id: string; status: string }
}

export async function fulfillReceiptRequest(
  requestId:  string,
  documentId: string
): Promise<void> {
  const { error } = await db.rpc('fulfill_receipt_request', {
    p_request_id:  requestId,
    p_document_id: documentId
  })
  if (error) throw new Error(error.message)
}

export async function cancelReceiptRequest(
  requestId: string,
  reason?:   string
): Promise<void> {
  const { error } = await db.rpc('cancel_receipt_request', pruneRpcArgs({
    p_request_id: requestId,
    p_reason:     reason ?? undefined
  }))
  if (error) throw new Error(error.message)
}

// ── Helper: compute vs-last-month percentage ─────────────────────────────────

export function vsLastMonthPct(thisVal: number, lastVal: number): number {
  if (lastVal === 0) {
    return thisVal === 0 ? 0 : 100
  }
  return Math.round(((thisVal - lastVal) / Math.abs(lastVal)) * 100)
}