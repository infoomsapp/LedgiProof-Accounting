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
