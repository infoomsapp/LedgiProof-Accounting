// PATH: src/pages/import/ImportBankTransactions.tsx
// 4-step wizard: Upload → Map columns (CSV only) → Review + duplicates → Confirm.
//
// Imports bank statement lines (CSV / OFX-QFX) as transactions. Both formats
// converge on NormalizedBankRow[] → a canonical CSV → the UNCHANGED backend
// (uploadImport → processBankImport → parseCSV → createTransaction), so every
// imported line flows through the full Brain/semaphore/audit engine exactly
// like any other transaction. No raw inserts, no bypass.
//
// Client scope: reads ?clientId from the URL (firm-client mode). When present,
// generated transactions inherit that client_id; absent → self mode (null).
//
// Constitution: no hex literals (uses .lp-btn / var(--*)), no 'any' in logic.

import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { db } from '../../lib/supabase'
import FileDropZone from '../../components/import/FileDropZone'
import ImportStepIndicator from '../../components/import/ImportStepIndicator'
import ColumnMapper, { validateMapping, type SchemaField } from '../../components/import/ColumnMapper'
import ImportPreviewTable from '../../components/import/ImportPreviewTable'
import { suggestColumnsForSchema, type ParseResult } from '../../lib/csv-parser'
import {
  parseCSV,
  parseOFX,
  rowsToCanonicalCsv,
  detectBankImportDuplicates,
  type NormalizedBankRow
} from '../../services/bank-import.service'
import { useUploadImport, useProcessImport } from '../../hooks/useBankImports'

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return fallback
}

interface ClientLookup { id: string; display_name: string }

const SCHEMA: SchemaField[] = [
  { field: 'date', label: 'Date', required: true,
    synonyms: ['date', 'transactiondate', 'txdate', 'posted', 'posteddate', 'valuedate'],
    hint: 'e.g. 2026-01-15 or 01/15/2026' },
  { field: 'amount', label: 'Amount', required: true,
    synonyms: ['amount', 'value', 'debit', 'credit'],
    hint: 'Positive = deposit/credit, negative = withdrawal/debit' },
  { field: 'reference', label: 'Reference', required: false,
    synonyms: ['reference', 'ref', 'checknumber', 'check', 'fitid', 'id'] },
  { field: 'description', label: 'Description', required: false,
    synonyms: ['description', 'memo', 'narrative', 'name', 'payee', 'details'] },
  { field: 'currency', label: 'Currency', required: false,
    synonyms: ['currency', 'ccy'], hint: 'Defaults to USD if not mapped' }
]

const STEPS = [
  { label: 'Upload' },
  { label: 'Map columns' },
  { label: 'Review + duplicates' },
  { label: 'Confirm' }
]

// Build a canonical CSV (date,amount,reference,description,currency) from the
// user's column mapping, then re-parse it with the backend's own parseCSV so
// dates/amounts are normalized identically to how they will be processed.
function normalizeFromMapping(sheet: ParseResult, mapping: Record<string, string | null>): NormalizedBankRow[] {
  const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const get = (row: Record<string, string>, f: string) =>
    mapping[f] ? (row[mapping[f]!] ?? '').trim() : ''
  const header = 'date,amount,reference,description,currency'
  const lines = sheet.rows.map(r =>
    [get(r, 'date'), get(r, 'amount'), esc(get(r, 'reference')), esc(get(r, 'description')), get(r, 'currency') || 'USD'].join(',')
  )
  return parseCSV([header, ...lines].join('\n'))
}

export default function ImportBankTransactions() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { membership } = useAuthStore()
  const orgId  = membership?.org_id  ?? ''
  const userId = membership?.user_id ?? ''

  const clientId = searchParams.get('clientId')
  const hasClientScope = !!clientId
  const [activeClient, setActiveClient] = useState<ClientLookup | null>(null)

  const [step, setStep]           = useState(0)
  const [accountType, setAccountType] = useState<'depository' | 'credit' | ''>('')  // 🆕 1099 Fase 2
  const [format, setFormat]       = useState<'csv' | 'ofx' | null>(null)
  const [sheet, setSheet]         = useState<ParseResult | null>(null)
  const [sourceLabel, setSource]  = useState('')
  const [mapping, setMapping]     = useState<Record<string, string | null>>({})
  const [ofxRows, setOfxRows]     = useState<NormalizedBankRow[]>([])
  const [dupes, setDupes]         = useState<Set<number>>(new Set())
  const [skipped, setSkipped]     = useState<Set<number>>(new Set())
  const [detecting, setDetecting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [result, setResult]       = useState<{ processed: number; errors: number; failed: string[] } | null>(null)

  const uploadImport  = useUploadImport(orgId)
  const processImport = useProcessImport(orgId)

  useEffect(() => {
    if (!clientId || !orgId) { setActiveClient(null); return }
    let cancelled = false
    db.from('clients').select('id, display_name').eq('id', clientId).eq('org_id', orgId).maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setActiveClient(data as ClientLookup) })
    return () => { cancelled = true }
  }, [clientId, orgId])

  // Normalized rows: from CSV mapping, or straight from OFX.
  const normalizedRows = useMemo<NormalizedBankRow[]>(() => {
    if (format === 'ofx') return ofxRows
    if (format === 'csv' && sheet) return normalizeFromMapping(sheet, mapping)
    return []
  }, [format, ofxRows, sheet, mapping])

  const keptRows = useMemo(
    () => normalizedRows.filter((_, i) => !skipped.has(i)),
    [normalizedRows, skipped]
  )

  // ── Step 0: file handling ──────────────────────────────────────────────
  function handleCsvParsed(s: ParseResult, label: string) {
    setFormat('csv'); setSheet(s); setSource(label); setError(null)
    setMapping(suggestColumnsForSchema(s.headers, SCHEMA))
    setStep(1)
  }

  async function handleOfxFile(file: File) {
    setError(null)
    try {
      const text = await file.text()
      const rows = parseOFX(text)
      if (rows.length === 0) {
        setError('No transactions found in this OFX/QFX file.')
        return
      }
      setFormat('ofx'); setOfxRows(rows); setSource(file.name)
      await runDuplicateDetection(rows)   // OFX needs no column mapping
    } catch (e: unknown) {
      setError(errMessage(e, 'Could not read OFX file'))
    }
  }

  // ── Step 1 → 2: mapping validated, detect duplicates ────────────────────
  function handleNextFromMapping() {
    const err = validateMapping(SCHEMA, mapping)
    if (err) { setError(err); return }
    const rows = normalizeFromMapping(sheet!, mapping)
    if (rows.length === 0) {
      setError('No valid rows to import. Check the Date and Amount column mapping.')
      return
    }
    setError(null)
    runDuplicateDetection(rows)
  }

  async function runDuplicateDetection(rows: NormalizedBankRow[]) {
    setDetecting(true)
    try {
      const found = await detectBankImportDuplicates(orgId, rows, clientId)
      setDupes(found)
      setSkipped(new Set(found))   // default: skip duplicates
      setStep(2)
    } catch (e: unknown) {
      setError(errMessage(e, 'Could not scan for duplicates'))
    } finally {
      setDetecting(false)
    }
  }

  // ── Step 2 → 3: upload + process through the engine ─────────────────────
  async function handleConfirmImport() {
    if (keptRows.length === 0) { setError('Nothing to import — every row is skipped.'); return }
    setImporting(true); setError(null)
    try {
      const rawContent = rowsToCanonicalCsv(keptRows)
      const created = await uploadImport.mutateAsync({
        orgId, userId, source: 'csv',
        filename: sourceLabel || 'bank-import.csv',
        rawContent, rowCount: keptRows.length
      })
      // 🆕 1099 Fase 2 — tag the account instrument so processBankImport derives
      // the payment method (credit → card = excluded from 1099-NEC; bank → ACH).
      if (accountType) {
        await db.from('bank_imports').update({ account_type: accountType }).eq('id', created.id)
      }
      const res = await processImport.mutateAsync({ importId: created.id, clientId })
      setResult(res)
      setStep(3)
    } catch (e: unknown) {
      setError(errMessage(e, 'Import failed'))
    } finally {
      setImporting(false)
    }
  }

  function toggleSkip(i: number) {
    setSkipped(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 980, width: '100%', margin: '0 auto' }}>
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => navigate(hasClientScope ? `/import?clientId=${clientId}` : '/import')}
          className="lp-btn-retry-link"
        >
          ← Back to Import
        </button>
      </div>

      <h1 className="lp-page-title" style={{ margin: 0 }}>🏦 Import Bank Transactions</h1>
      <p className="lp-page-sub" style={{ margin: '4px 0 16px 0' }}>
        {sourceLabel ? `Source: ${sourceLabel}` : 'Upload a bank statement export — CSV or OFX/QFX'}
      </p>

      {hasClientScope ? (
        <div className="lp-banner success" style={{ marginBottom: 20 }}>
          <span>📁 Importing for: <strong>{activeClient?.display_name ?? 'Loading…'}</strong></span>
        </div>
      ) : (
        <div className="lp-banner" style={{ marginBottom: 20 }}>
          <span>Importing into your own workspace. To import for a specific client, open Import from that client first.</span>
        </div>
      )}

      <ImportStepIndicator steps={STEPS} current={step} />

      {error && (
        <div className="lp-banner error" style={{ marginBottom: 16 }}>
          <span>⚠ {error}</span>
        </div>
      )}

      {/* Step 0 — Upload */}
      {step === 0 && (
        <div>
          {/* 🆕 1099 Fase 2 — account instrument tag (drives 1099 reportability) */}
          <div className="lp-card" style={{ padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 4 }}>
              What kind of account is this file from?
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginBottom: 10 }}>
              Payments made by credit card are reported by the processor (1099-K), so they're
              excluded from 1099-NEC. Tagging this correctly keeps the 1099 totals accurate.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { v: 'depository', label: '🏦 Bank account (checking/savings)' },
                { v: 'credit',     label: '💳 Credit card' }
              ] as const).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setAccountType(opt.v)}
                  className={accountType === opt.v ? 'lp-btn lp-btn-primary' : 'lp-btn lp-btn-ghost'}
                  style={{ flex: 1, fontSize: 12 }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <FileDropZone onParsed={handleCsvParsed} onError={setError} />
          <div style={{ textAlign: 'center', margin: '14px 0', fontSize: 12, color: 'var(--lp-text-muted)' }}>
            — or —
          </div>
          <label className="lp-card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: 16, cursor: 'pointer', fontSize: 13
          }}>
            <span style={{ fontSize: 20 }}>🏦</span>
            <span>Upload an <strong>OFX / QFX</strong> file (auto-detected, no column mapping)</span>
            <input
              type="file"
              accept=".ofx,.qfx"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleOfxFile(f); e.target.value = '' }}
            />
          </label>
          <div className="lp-card" style={{ marginTop: 20, fontSize: 12, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--lp-text)' }}>Expected CSV columns:</strong><br />
            · <code>date</code> (required)<br />
            · <code>amount</code> (required) — positive = deposit, negative = withdrawal<br />
            · <code>reference</code>, <code>description</code>, <code>currency</code> (optional)<br />
            <br />
            Column names don&apos;t need to be exact — the next step lets you map them.
          </div>
        </div>
      )}

      {/* Step 1 — Map columns (CSV only) */}
      {step === 1 && format === 'csv' && sheet && (
        <>
          <ColumnMapper
            headers={sheet.headers}
            schema={SCHEMA}
            mapping={mapping}
            onChange={(f, header) => setMapping(prev => ({ ...prev, [f]: header }))}
            {...(sheet.rows[0] ? { sampleRow: sheet.rows[0] } : {})}
          />
          <FooterActions
            onBack={() => { setStep(0); setFormat(null); setSheet(null) }}
            onNext={handleNextFromMapping}
            nextLabel={detecting ? 'Scanning…' : 'Next →'}
            nextDisabled={detecting}
            stepInfo={`${normalizeFromMapping(sheet, mapping).length} valid row(s) detected`}
          />
        </>
      )}

      {/* Step 2 — Review + duplicates */}
      {step === 2 && (
        <>
          {dupes.size > 0 && (
            <div className="lp-banner warning" style={{ marginBottom: 12 }}>
              <span>
                ⚠ {dupes.size} likely duplicate(s) detected (same date + amount + reference as an
                existing transaction, or repeated in this file). They are <strong>skipped</strong> by
                default — untick to import anyway.
              </span>
            </div>
          )}
          <ImportPreviewTable
            columns={['', 'Date', 'Amount', 'Reference', 'Description', 'Currency']}
            rows={normalizedRows.map((r, i) => [
              dupes.has(i) ? (skipped.has(i) ? '⏭ skip' : '⚠ dup') : (skipped.has(i) ? '⏭ skip' : '✓'),
              r.date,
              r.amount.toFixed(2),
              r.reference ?? '',
              r.description ?? '',
              r.currency
            ])}
            maxVisible={12}
          />
          {/* Compact skip toggles for the flagged duplicates */}
          {dupes.size > 0 && (
            <div style={{ marginTop: 12, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>Duplicate rows:</div>
              {[...dupes].map(i => {
                const r = normalizedRows[i]!
                return (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', color: 'var(--lp-text-muted)' }}>
                    <input type="checkbox" checked={skipped.has(i)} onChange={() => toggleSkip(i)} />
                    <span>Skip row {i + 1}: {r.date} · {r.amount.toFixed(2)} {r.currency} · {r.description ?? r.reference ?? ''}</span>
                  </label>
                )
              })}
            </div>
          )}
          <FooterActions
            onBack={() => (format === 'ofx' ? (setStep(0), setFormat(null)) : setStep(1))}
            onNext={handleConfirmImport}
            nextLabel={importing ? 'Importing…' : `Import ${keptRows.length} transaction(s)`}
            nextDisabled={importing || keptRows.length === 0}
            stepInfo={`${keptRows.length} to import · ${skipped.size} skipped`}
            isFinal
          />
        </>
      )}

      {/* Step 3 — Result */}
      {step === 3 && result && (
        <div className="lp-banner success" style={{ flexDirection: 'column', alignItems: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>
            Import complete{activeClient ? ` for ${activeClient.display_name}` : ''}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: 13, marginBottom: 18, color: 'var(--lp-text)' }}>
            <Stat label="Imported" value={result.processed} color="var(--sem-green)" />
            <Stat label="Errors" value={result.errors} color={result.errors > 0 ? 'var(--sem-red)' : 'var(--lp-text-muted)'} />
            <Stat label="Skipped" value={skipped.size} color="var(--lp-text-muted)" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginBottom: 16 }}>
            Imported transactions were classified by the semaphore engine — review any amber/red items in Transactions.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button onClick={() => navigate(hasClientScope ? `/clients/${clientId}/transactions` : '/transactions')} className="lp-btn lp-btn-primary lp-btn-sm">
              View Transactions →
            </button>
            <button onClick={() => navigate(hasClientScope ? `/import?clientId=${clientId}` : '/import')} className="lp-btn lp-btn-ghost lp-btn-sm">
              Back to Import
            </button>
          </div>
          {result.failed.length > 0 && (
            <details style={{ marginTop: 16, textAlign: 'left', width: '100%' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--sem-red)' }}>
                View {result.failed.length} error(s)
              </summary>
              <pre style={{ marginTop: 8, padding: 10, background: 'var(--lp-surface-2)', fontSize: 11, color: 'var(--lp-text-muted)', maxHeight: 200, overflow: 'auto', borderRadius: 6 }}>
                {result.failed.join('\n')}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function FooterActions({ onBack, onNext, nextLabel, nextDisabled, stepInfo, isFinal }: {
  onBack: () => void; onNext: () => void; nextLabel: string
  nextDisabled: boolean; stepInfo?: string; isFinal?: boolean
}) {
  return (
    <div style={{
      marginTop: 20, padding: '14px 0', borderTop: '0.5px solid var(--lp-border)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <button onClick={onBack} className="lp-btn lp-btn-ghost lp-btn-sm">← Back</button>
      {stepInfo && <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>{stepInfo}</div>}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="lp-btn lp-btn-primary lp-btn-sm"
        style={isFinal && !nextDisabled ? { background: 'var(--sem-green)' } : undefined}
      >
        {nextLabel}
      </button>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
    </div>
  )
}
