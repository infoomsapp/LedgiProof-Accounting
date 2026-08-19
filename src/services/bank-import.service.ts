// ── src/services/bank-import.service.ts ──────────────────────────────────────
// Reads a bank_import row (raw CSV/OFX content) and converts each line
// into a transaction through the full pipeline:
//   normalize → Brain → hash → insert transaction → audit event

import { db } from '../lib/supabase'
import { createTransaction } from './transactions.service'
import type { BankImport, PaymentMethodType } from '../types/database.types'

// ── Normalized representation of a single bank statement line ────────────────

export interface NormalizedBankRow {
  date:        string     // ISO date
  amount:      number     // positive = credit, negative = debit
  reference:   string | null
  description: string | null
  currency:    string
}

// ── Process a bank_import record through the full pipeline ───────────────────

// Overloads: legacy positional + new options form.
// Legacy: processBankImport(importId, orgId)
// New:    processBankImport(importId, orgId, { clientId })
export async function processBankImport(
  importId: string,
  orgId:    string,
  options?: { clientId?: string | null }
): Promise<{ processed: number; errors: number; failed: string[] }> {
  // 🆕 Sprint 4 Fix C — capture optional client scope. When the bookkeeper
  // initiates this import from /clients/:clientId/imports, all generated
  // transactions inherit that client_id. Self-mode (solo/pyme) passes null.
  const clientId = options?.clientId ?? null

  // 1. Load the import record
  const { data: imp, error } = await db
    .from('bank_imports')
    .select('*')
    .eq('id', importId)
    .eq('org_id', orgId)
    .single()

  if (error || !imp) throw new Error(`[BankImport] Import not found: ${error?.message}`)
  if (!imp.raw_content)   throw new Error('[BankImport] No raw_content to process')

  // 🆕 1099 Fase 2 — Derive the payment instrument from the account type the
  // user tagged on this import. Credit card → 'card' (excluded from 1099-NEC,
  // reported on 1099-K by the processor); bank/depository → 'ach' (reportable).
  // Unknown until tagged → 'unknown' (flagged for review by the accumulator).
  const paymentMethod: PaymentMethodType =
    (imp.account_type ?? '').toLowerCase() === 'credit'     ? 'card'
    : (imp.account_type ?? '').toLowerCase() === 'depository' ? 'ach'
    : 'unknown'

  // 2. Mark as processing
  await db.from('bank_imports').update({ status: 'processing' }).eq('id', importId)

  let processed = 0
  const failed: string[] = []
  const errors: Array<{ row: number; message: string; raw_data: string }> = []

  // 3. Parse based on source type
  const rows = imp.source === 'ofx'
    ? parseOFX(imp.raw_content)
    : parseCSV(imp.raw_content)

  // 4. Insert each row as a transaction
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    try {
      await createTransaction({
        orgId,
        clientId,                                    // 🆕 Sprint 4 Fix C
        bankImportId: importId,
        source:          imp.source === 'ofx' ? 'ofx' : 'csv',
        amount:          row.amount,
        currency:        row.currency,
        reference:       row.reference,
        description:     row.description,
        transactionDate: row.date,
        paymentMethod,                               // 🆕 1099 Fase 2
        metadata:        { import_row: i + 1, import_id: importId }
      })
      processed++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      failed.push(`Row ${i + 1}: ${msg}`)
      errors.push({ row: i + 1, message: msg, raw_data: JSON.stringify(row) })
    }
  }

  // 5. Update import status
  await db.from('bank_imports').update({
    status:          errors.length === rows.length ? 'failed' : 'done',
    processed_count: processed,
    error_count:     errors.length,
    errors:          errors.length > 0 ? (errors as any) : null,
    processed_at:    new Date().toISOString()
  }).eq('id', importId)

  return { processed, errors: errors.length, failed }
}

// ── CSV parser (simple — header + data rows) ─────────────────────────────────
// Expected columns: date, amount, reference, description, currency
// Column order is auto-detected from header row.

export function parseCSV(content: string): NormalizedBankRow[] {
  const lines  = content.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []

  const header = lines[0]!.toLowerCase().split(',').map(h => h.replace(/"/g, '').trim())
  const rows: NormalizedBankRow[] = []

  const col = (row: string[], name: string): string => {
    const idx = header.indexOf(name)
    return idx >= 0 ? (row[idx] ?? '').replace(/"/g, '').trim() : ''
  }

  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i]!)
    const dateStr   = col(parts, 'date') || col(parts, 'transaction_date') || col(parts, 'tx_date')
    const amountStr = col(parts, 'amount') || col(parts, 'debit') || col(parts, 'credit')
    const ref       = col(parts, 'reference') || col(parts, 'ref') || col(parts, 'check_number') || null
    const desc      = col(parts, 'description') || col(parts, 'memo') || col(parts, 'narrative') || null
    const currency  = col(parts, 'currency') || 'USD'

    const amount = parseFloat(amountStr.replace(/[,$]/g, ''))
    if (!dateStr || isNaN(amount)) continue

    rows.push({
      date:        normalizeDate(dateStr),
      amount,
      reference:   ref || null,
      description: desc || null,
      currency:    currency.toUpperCase()
    })
  }

  return rows
}

// ── OFX parser (simplified — extracts STMTTRN blocks) ────────────────────────

export function parseOFX(content: string): NormalizedBankRow[] {
  const rows: NormalizedBankRow[] = []
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []

  for (const block of blocks) {
    const get = (tag: string) =>
      block.match(new RegExp(`<${tag}>([^<]+)`, 'i'))?.[1]?.trim() ?? ''

    const dateStr = get('DTPOSTED')
    const amount  = parseFloat(get('TRNAMT'))
    const ref     = get('FITID')   || null
    const desc    = get('MEMO')    || get('NAME') || null

    if (!dateStr || isNaN(amount)) continue

    rows.push({
      date:        normalizeOFXDate(dateStr),
      amount,
      reference:   ref,
      description: desc,
      currency:    'USD'
    })
  }

  return rows
}

// ── Duplicate detection for a pending import ─────────────────────────────────
// Flags incoming rows that match an EXISTING current transaction (same
// amount + reference + date, per org/client) OR an earlier row in the same
// batch. Returns the set of row indices considered duplicates. Read-only —
// the UI decides whether to skip or import them anyway.

function dupeKey(amount: number, reference: string | null, date: string): string {
  return `${Math.round(amount * 100)}|${(reference ?? '').trim().toLowerCase()}|${date}`
}

export async function detectBankImportDuplicates(
  orgId: string,
  rows:  NormalizedBankRow[],
  clientId?: string | null
): Promise<Set<number>> {
  if (rows.length === 0) return new Set()

  // Bound the scan to the batch's own date range.
  const dates = rows.map(r => r.date).filter(Boolean).sort()
  const from  = dates[0]
  const to    = dates[dates.length - 1]

  let q = db.from('transactions')
    .select('amount, reference, transaction_date')
    .eq('org_id', orgId)
    .eq('is_current', true)
  if (clientId) q = q.eq('client_id', clientId)
  if (from) q = q.gte('transaction_date', from)
  if (to)   q = q.lte('transaction_date', to)

  const { data, error } = await q
  if (error) throw new Error(`[BankImport] Duplicate scan failed: ${error.message}`)

  const existing = new Set(
    (data ?? []).map(r => dupeKey(Number(r.amount), r.reference, r.transaction_date))
  )

  const dupes       = new Set<number>()
  const seenInBatch = new Set<string>()
  rows.forEach((r, i) => {
    const k = dupeKey(r.amount, r.reference, r.date)
    if (existing.has(k) || seenInBatch.has(k)) dupes.add(i)
    seenInBatch.add(k)
  })
  return dupes
}

// ── Serialize normalized rows back to the canonical CSV parseCSV() expects ───
// (header: date,amount,reference,description,currency). Lets the wizard funnel
// BOTH csv-mapped and OFX-parsed rows through the same, unchanged backend
// (processBankImport → parseCSV → createTransaction → semaphore engine).

export function rowsToCanonicalCsv(rows: NormalizedBankRow[]): string {
  const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const header = 'date,amount,reference,description,currency'
  const lines = rows.map(r =>
    [r.date, String(r.amount), esc(r.reference ?? ''), esc(r.description ?? ''), r.currency].join(',')
  )
  return [header, ...lines].join('\n')
}

// ── Get all imports for an org ────────────────────────────────────────────────

export async function getImports(orgId: string): Promise<BankImport[]> {
  const { data, error } = await db
    .from('bank_imports')
    .select('*')
    .eq('org_id', orgId)
    .order('imported_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`[BankImport] Fetch failed: ${error.message}`)
  return data ?? []
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"')       { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else                  { current += ch }
  }
  result.push(current)
  return result
}

function normalizeDate(d: string): string {
  // Accept MM/DD/YYYY, DD-MM-YYYY, YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const parts = d.split(/[\/\-]/)
  if (!parts[0] || !parts[1] || !parts[2]) return d
  if (parts[0].length === 4) return `${parts[0]}-${parts[1]!.padStart(2,'0')}-${parts[2]!.padStart(2,'0')}`
  if (parseInt(parts[0]) > 12) {
    return `${parts[2]}-${parts[1]!.padStart(2,'0')}-${parts[0]!.padStart(2,'0')}`  // DD/MM/YYYY
  }
  return `${parts[2]}-${parts[0]!.padStart(2,'0')}-${parts[1]!.padStart(2,'0')}`  // MM/DD/YYYY
}

function normalizeOFXDate(d: string): string {
  // OFX format: 20240615120000 or 20240615
  const clean = d.slice(0, 8)
  return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`
}