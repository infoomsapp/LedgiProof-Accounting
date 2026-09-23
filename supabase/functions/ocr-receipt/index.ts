// PATH: supabase/functions/ocr-receipt/index.ts
//
// OCR extraction for receipts and invoices.
// Uses Claude Vision to extract merchant, amount, date, and category
// from uploaded images (JPEG/PNG/WebP) and PDFs.
//
// Flow:
//   1. Verify JWT + org membership
//   2. Look up document → get storage_path + mime_type
//   3. Download file from Storage using service role
//   4. Base64-encode and send to Claude Vision
//   5. Parse structured JSON response
//   6. Write OCR results to documents + transaction_documents tables
//   7. Return extracted data to caller
//
// Deploy: supabase functions deploy ocr-receipt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const MODEL             = 'claude-sonnet-4-6'
const MAX_PDF_BYTES     = 30 * 1024 * 1024   // 30 MB — Claude's PDF limit

// ── Helpers ──────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192
  let result = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(result)
}

function normalizeMediaType(mime: string): string {
  // Map storage MIME → what Claude Vision accepts
  if (mime === 'image/heic' || mime === 'image/heif') return 'image/jpeg'
  return mime
}

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

function isPdfMime(mime: string): boolean {
  return mime === 'application/pdf'
}

// ── Claude extraction ─────────────────────────────────────────────────────────

interface OcrExtracted {
  merchant_name:   string | null
  total_amount:    number | null
  tax_amount:      number | null
  date:            string | null          // YYYY-MM-DD
  category:        string | null
  currency:        string
  line_items:      Array<{ description: string; amount: number }>
  confidence:      number                 // 0–100
  receipt_number:  string | null
  payment_method:  string | null
  raw_text:        string | null          // full OCR text for search
}

const EXTRACTION_PROMPT = `You are a receipt/invoice OCR extractor for an accounting system.
Extract data from this document and return ONLY a valid JSON object. No markdown, no explanation.

Required JSON structure:
{
  "merchant_name": "string or null",
  "total_amount": number_or_null,
  "tax_amount": number_or_null,
  "date": "YYYY-MM-DD or null",
  "category": "one of: food_drink / travel / transportation / general_merchandise / professional_services / utilities / insurance / medical / entertainment / subscription / bank_fees / rent / payroll / other — or null",
  "currency": "ISO code, default USD",
  "line_items": [{"description": "string", "amount": number}],
  "confidence": number_0_to_100,
  "receipt_number": "string or null",
  "payment_method": "cash or card or check or ach or other or null",
  "raw_text": "all visible text on the document concatenated, preserving newlines"
}

Rules:
- total_amount is the final total (including tax), as a decimal number (e.g. 12.50)
- If the document is unclear or not a receipt/invoice, return confidence ≤ 20
- Always return valid JSON even if extraction fails (use null for unknown fields)
- Do not add any text outside the JSON object`

async function callClaudeVision(
  base64Data: string,
  mediaType:  string
): Promise<OcrExtracted> {
  const contentBlock = isPdfMime(mediaType)
    ? {
        type:   'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64Data }
      }
    : {
        type:   'image',
        source: { type: 'base64', media_type: normalizeMediaType(mediaType), data: base64Data }
      }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json'
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      messages: [
        {
          role:    'user',
          content: [
            contentBlock,
            { type: 'text', text: EXTRACTION_PROMPT }
          ]
        }
      ]
    })
  })

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown')
    throw new Error(`Claude API error ${response.status}: ${err}`)
  }

  const msg = await response.json()
  const text = msg?.content?.[0]?.text ?? ''

  // Claude might wrap in markdown code fences — strip them
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    return JSON.parse(jsonStr) as OcrExtracted
  } catch {
    // Partial extraction failure — return a low-confidence stub
    console.error('[ocr-receipt] JSON parse failed:', jsonStr)
    return {
      merchant_name:  null,
      total_amount:   null,
      tax_amount:     null,
      date:           null,
      category:       null,
      currency:       'USD',
      line_items:     [],
      confidence:     5,
      receipt_number: null,
      payment_method: null,
      raw_text:       text
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' }
    })

  try {
    if (!ANTHROPIC_API_KEY) {
      return j({ error: 'ANTHROPIC_API_KEY is not configured' }, 500)
    }

    // 1. Auth
    const auth = req.headers.get('Authorization')
    if (!auth) return j({ error: 'Missing Authorization header' }, 401)

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } }
    )
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) return j({ error: 'Unauthorized' }, 401)

    // 2. Parse body
    const { document_id, org_id } = await req.json() as {
      document_id: string
      org_id:      string
    }
    if (!document_id || !org_id) {
      return j({ error: 'document_id and org_id are required' }, 400)
    }

    // 3. Verify org membership
    const { data: mem } = await supabaseUser
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .eq('is_active', true)
      .maybeSingle()
    if (!mem) return j({ error: 'Not a member of this organization' }, 403)

    // 4. Fetch document metadata
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('documents')
      .select('id, storage_path, storage_bucket, mime_type, size_bytes, org_id')
      .eq('id', document_id)
      .eq('org_id', org_id)
      .maybeSingle()

    if (docErr || !doc) {
      return j({ error: 'Document not found or access denied' }, 404)
    }

    const mime = (doc.mime_type ?? 'image/jpeg') as string
    if (!isImageMime(mime) && !isPdfMime(mime)) {
      return j({ error: `Unsupported file type: ${mime}` }, 422)
    }

    // PDFs over 30 MB exceed Claude's document limit
    if (isPdfMime(mime) && (doc.size_bytes ?? 0) > MAX_PDF_BYTES) {
      return j({
        error: `PDF is too large for OCR (${Math.round((doc.size_bytes ?? 0) / 1024 / 1024)} MB). Max 30 MB.`
      }, 422)
    }

    // 5. Download file from Storage
    const bucket = (doc.storage_bucket ?? 'transaction-documents') as string
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(bucket)
      .download(doc.storage_path as string)

    if (dlErr || !blob) {
      return j({ error: safeMessage(dlErr, 'Storage download failed') }, 500)
    }

    // 6. Base64-encode
    const arrayBuf = await blob.arrayBuffer()
    const base64   = uint8ToBase64(new Uint8Array(arrayBuf))

    // 7. Call Claude Vision
    const extracted = await callClaudeVision(base64, mime)

    // 8. Write OCR results to DB
    const now = new Date().toISOString()

    // Update documents table
    await supabaseAdmin
      .from('documents')
      .update({
        ocr_completed_at: now,
        ocr_text:         extracted.raw_text ?? null
      })
      .eq('id', document_id)

    // Update any linked transaction_documents rows
    const { data: txDocs } = await supabaseAdmin
      .from('transaction_documents')
      .select('id')
      .eq('document_id', document_id)
      .eq('org_id', org_id)

    if (txDocs && txDocs.length > 0) {
      const ids = txDocs.map((r: { id: string }) => r.id)
      await supabaseAdmin
        .from('transaction_documents')
        .update({
          ocr_merchant:   extracted.merchant_name ?? null,
          ocr_amount:     extracted.total_amount  ?? null,
          ocr_date:       extracted.date          ?? null,
          ocr_confidence: extracted.confidence,
          ocr_data:       {
            tax_amount:     extracted.tax_amount,
            category:       extracted.category,
            currency:       extracted.currency,
            line_items:     extracted.line_items,
            receipt_number: extracted.receipt_number,
            payment_method: extracted.payment_method,
            model:          MODEL,
            extracted_at:   now
          }
        })
        .in('id', ids)
    }

    return j({
      document_id,
      merchant_name:   extracted.merchant_name,
      total_amount:    extracted.total_amount,
      tax_amount:      extracted.tax_amount,
      date:            extracted.date,
      category:        extracted.category,
      currency:        extracted.currency,
      line_items:      extracted.line_items,
      confidence:      extracted.confidence,
      receipt_number:  extracted.receipt_number,
      payment_method:  extracted.payment_method
    }, 200)

  } catch (err: unknown) {
    console.error('[ocr-receipt]', err)
    return j({ error: safeMessage(err, 'Failed to read the receipt') }, 500)
  }
})
