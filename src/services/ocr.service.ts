// PATH: src/services/ocr.service.ts
// Client-side caller for the ocr-receipt edge function.

import { supabase } from '../lib/supabase'

export interface OcrResult {
  document_id:    string
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

  if (res.error) throw new Error(res.error.message)
  if (res.data?.error) throw new Error(res.data.error)

  return res.data as OcrResult
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
