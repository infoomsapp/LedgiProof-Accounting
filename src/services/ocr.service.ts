// PATH: src/services/ocr.service.ts
// Client-side caller for the ocr-receipt edge function, plus link_receipt()
// for confirming which bank transaction a scanned receipt belongs to.

import { supabase, db } from '../lib/supabase'
import { dbError } from '../lib/errors'

export interface ReceiptMatchTx {
  id:               string
  description:      string | null
  amount:           number
  transaction_date: string
  score?:           number
}

/** What match_receipt() decided right after OCR. */
export type ReceiptMatch =
  | { status: 'matched';   transaction: ReceiptMatchTx }
  | { status: 'suggested'; candidates:  ReceiptMatchTx[] }
  | { status: 'unmatched' }
  | { status: 'no_amount' }

export interface OcrResult {
  document_id:    string
  /** null when matching failed server-side; the OCR fields are still valid. */
  match:          ReceiptMatch | null
  merchant_name:  string | null
  total_amount:   number | null
  tax_amount:     number | null
  date:           string | null          // YYYY-MM-DD
  category:       string | null
  currency:       string
  line_items:     Array<{ description: string; amount: number }>
  confidence:     number                 // 0–100
  receipt_number: string | null
  payment_method: string | null
}

export type OcrStatus = 'idle' | 'extracting' | 'done' | 'error'

export async function extractReceiptOcr(
  documentId: string,
  orgId:      string
): Promise<OcrResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await supabase.functions.invoke('ocr-receipt', {
    body: { document_id: documentId, org_id: orgId }
  })

  if (res.error) throw dbError(res.error, 'Failed to read the receipt')
  if (res.data?.error) throw new Error(res.data.error)

  return res.data as OcrResult
}

/** The user picked the bank transaction a suggested receipt belongs to. */
export async function linkReceipt(documentId: string, transactionId: string): Promise<void> {
  const { error } = await db.rpc('link_receipt', {
    p_document_id:    documentId,
    p_transaction_id: transactionId
  })
  if (error) throw dbError(error, "Couldn't link the receipt")
}

// ── Receipts still waiting for their bank line ──────────────────────────────

export interface PendingReceipt {
  id:             string
  filename:       string
  created_at:     string
  match_status:   'suggested' | 'unmatched' | 'no_amount'
  ocr_merchant:   string | null
  ocr_amount:     number | null
  ocr_date:       string | null          // YYYY-MM-DD
  ocr_currency:   string | null
  ocr_confidence: number | null
  candidates:     ReceiptMatchTx[]
}

export async function getPendingReceipts(orgId: string, clientId: string | null): Promise<PendingReceipt[]> {
  const { data, error } = await db.rpc('get_pending_receipts', {
    p_org_id: orgId,
    ...(clientId ? { p_client_id: clientId } : {})
  })
  if (error) throw dbError(error, 'Could not load the receipts waiting for a match')
  return ((data as unknown as { items?: PendingReceipt[] })?.items) ?? []
}

/**
 * The user corrected what OCR read: store it and look for the bank line
 * again (match_receipt is the same function the edge function runs).
 */
export async function correctReceipt(
  documentId: string,
  fields: { merchant: string | null; amount: number | null; date: string | null; currency: string }
): Promise<ReceiptMatch> {
  const { data, error } = await db.rpc('match_receipt', {
    p_document_id: documentId,
    p_merchant:    fields.merchant ?? '',
    p_amount:      fields.amount as number,
    p_date:        fields.date as string,
    p_currency:    fields.currency,
    p_confidence:  100
  })
  if (error) throw dbError(error, "Couldn't save the receipt")
  return data as unknown as ReceiptMatch
}

/** Paid in cash / from an account that isn't imported: the receipt becomes the expense. */
export async function createExpenseFromReceipt(documentId: string): Promise<ReceiptMatchTx> {
  const { data, error } = await db.rpc('create_expense_from_receipt', { p_document_id: documentId })
  if (error) throw dbError(error, "Couldn't record the expense")
  return (data as unknown as { transaction: ReceiptMatchTx }).transaction
}

/** The receipt doesn't need a transaction (personal, duplicate, already recorded). */
export async function dismissReceipt(documentId: string): Promise<void> {
  const { error } = await db.rpc('dismiss_receipt', { p_document_id: documentId })
  if (error) throw dbError(error, "Couldn't dismiss the receipt")
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 85) return 'High'
  if (confidence >= 60) return 'Medium'
  return 'Low'
}

export function confidenceColor(confidence: number): string {
  if (confidence >= 85) return 'var(--sem-green)'
  if (confidence >= 60) return 'var(--sem-amber)'
  return 'var(--sem-red)'
}
