// PATH: src/pages/import/ImportChartOfAccounts.tsx
// 4-step wizard: Upload → Map → Resolve → Confirm.
//
// 🆕 B3.7 — Client-scoping forzado:
//   Reads ?clientId from the URL. When present, duplicate detection and the
//   final import are scoped to that client (per-client CoA). When absent,
//   the wizard runs in legacy mode (firm-level accounts) and shows a warning.
//
// Constitution compliance (this file):
//   · No hex literals — buttons use .lp-btn / .lp-btn-primary / .lp-btn-ghost.
//   · No 'any' — catches use 'unknown' with narrowing via errMessage().
//   · Colors via CSS variables only.

import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { db } from '../../lib/supabase'
import FileDropZone from '../../components/import/FileDropZone'
import ImportStepIndicator from '../../components/import/ImportStepIndicator'
import ColumnMapper, { validateMapping, type SchemaField } from '../../components/import/ColumnMapper'
import DuplicateResolver, { type DuplicateRow } from '../../components/import/DuplicateResolver'
import ImportPreviewTable from '../../components/import/ImportPreviewTable'
import { suggestColumnsForSchema, type ParseResult } from '../../lib/csv-parser'
import {
  detectAccountDuplicates,
  importChartOfAccounts,
  type DuplicateAccount,
  type ImportSummary,
  type Resolution
} from '../../services/import.service'

// ── Helper: narrow unknown errors to a message (Constitution: no 'any') ─────
function errMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return fallback
}

interface ClientLookup {
  id:           string
  display_name: string
}

const SCHEMA: SchemaField[] = [
  { field: 'code', label: 'Account code', required: true,
    synonyms: ['code', 'accountcode', 'number', 'accountnumber', 'acct'],
    hint: 'Unique identifier (e.g. "1010", "ACC-100")' },
  { field: 'name', label: 'Account name', required: true,
    synonyms: ['name', 'accountname', 'description', 'title', 'account'] },
  { field: 'account_type', label: 'Account type', required: true,
    synonyms: ['type', 'accounttype', 'category', 'class'],
    hint: 'One of: asset, liability, equity, income, expense' },
  { field: 'description', label: 'Description', required: false,
    synonyms: ['description', 'notes', 'memo', 'longdescription'] }
]

const VALID_TYPES = ['asset', 'liability', 'equity', 'income', 'expense']

const STEPS = [
  { label: 'Upload' },
  { label: 'Map columns' },
  { label: 'Resolve duplicates' },
  { label: 'Confirm' }
]

export default function ImportChartOfAccounts() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { membership } = useAuthStore()
  const orgId = membership?.org_id ?? ''

  // 🆕 B3.7 — Client scope from URL
  const clientId = searchParams.get('clientId')
  const hasClientScope = !!clientId

  const [activeClient, setActiveClient] = useState<ClientLookup | null>(null)

  const [step, setStep] = useState(0)
  const [sheet, setSheet] = useState<ParseResult | null>(null)
  const [sourceLabel, setSourceLabel] = useState('')
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [duplicates, setDuplicates] = useState<DuplicateAccount[]>([])
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({})
  const [detecting, setDetecting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportSummary | null>(null)

  // Load the active client's name for the header
  useEffect(() => {
    if (!clientId || !orgId) { setActiveClient(null); return }
    let cancelled = false
    db.from('clients')
      .select('id, display_name')
      .eq('id', clientId)
      .eq('org_id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data) setActiveClient(data as ClientLookup)
      })
    return () => { cancelled = true }
  }, [clientId, orgId])

  const transformedRows = useMemo(() => {
    if (!sheet) return []
    return sheet.rows
      .map(r => ({
        code:         mapping.code         ? (r[mapping.code]         ?? '').trim() : '',
        name:         mapping.name         ? (r[mapping.name]         ?? '').trim() : '',
        account_type: mapping.account_type ? (r[mapping.account_type] ?? '').trim().toLowerCase() : '',
        description:  mapping.description  ? (r[mapping.description]  ?? '').trim() : null
      }))
      .filter(r => r.code || r.name)
  }, [sheet, mapping])

  const rowErrors = useMemo(() => {
    const errs = new Map<number, string>()
    transformedRows.forEach((r, i) => {
      if (!r.code) errs.set(i, 'Missing code')
      else if (!r.name) errs.set(i, 'Missing name')
      else if (!VALID_TYPES.includes(r.account_type)) {
        errs.set(i, `Invalid type "${r.account_type}"`)
      }
    })
    return errs
  }, [transformedRows])

  const validRows = useMemo(
    () => transformedRows.filter((_, i) => !rowErrors.has(i)),
    [transformedRows, rowErrors]
  )

  function handleParsed(s: ParseResult, label: string) {
    setSheet(s)
    setSourceLabel(label)
    setError(null)
    setMapping(suggestColumnsForSchema(s.headers, SCHEMA))
    setStep(1)
  }

  function handleNextFromMapping() {
    const err = validateMapping(SCHEMA, mapping)
    if (err) { setError(err); return }
    if (validRows.length === 0) {
      setError('No valid rows to import. Check column mapping or your file.')
      return
    }
    setError(null)
    runDuplicateDetection()
  }

  async function runDuplicateDetection() {
    setDetecting(true)
    try {
      const codes = validRows.map(r => r.code)
      // 🆕 B3.7 — scope duplicate detection to the active client
      const dups = await detectAccountDuplicates(orgId, codes, clientId)
      setDuplicates(dups)
      const initRes: Record<string, Resolution> = {}
      dups.forEach(d => { initRes[d.code] = 'skip' })
      setResolutions(initRes)
      setStep(2)
    } catch (e: unknown) {
      setError(errMessage(e, 'Could not detect duplicates'))
    } finally {
      setDetecting(false)
    }
  }

  async function handleConfirmImport() {
    setImporting(true)
    try {
      // 🆕 B3.7 — scope import to the active client (legacy mode if null)
      const summary = await importChartOfAccounts(orgId, validRows, resolutions, clientId)
      setResult(summary)
      setStep(3)
    } catch (e: unknown) {
      setError(errMessage(e, 'Import failed'))
    } finally {
      setImporting(false)
    }
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

      <h1 className="lp-page-title" style={{ margin: 0 }}>📋 Import Chart of Accounts</h1>
      <p className="lp-page-sub" style={{ margin: '4px 0 16px 0' }}>
        {sourceLabel ? `Source: ${sourceLabel}` : 'Upload a CSV/Excel file or paste from clipboard'}
      </p>

      {/* 🆕 B3.7 — Scope indicator */}
      {hasClientScope ? (
        <div className="lp-banner success" style={{ marginBottom: 20 }}>
          <span>📁 Importing for: <strong>{activeClient?.display_name ?? 'Loading…'}</strong></span>
        </div>
      ) : (
        <div className="lp-banner warning" style={{ marginBottom: 20 }}>
          <span>
            ⚠ Importing as <strong>firm-level (legacy)</strong> accounts. To scope to a
            specific client, return to Import and select a client first.
          </span>
        </div>
      )}

      <ImportStepIndicator steps={STEPS} current={step} />

      {error && (
        <div className="lp-banner error" style={{ marginBottom: 16 }}>
          <span>⚠ {error}</span>
        </div>
      )}

      {step === 0 && (
        <div>
          <FileDropZone onParsed={handleParsed} onError={setError} />
          <div className="lp-card" style={{ marginTop: 20, fontSize: 12, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--lp-text)' }}>Expected columns:</strong><br />
            · <code>code</code> (required) — unique account code<br />
            · <code>name</code> (required) — account display name<br />
            · <code>account_type</code> (required) — asset, liability, equity, income, expense<br />
            · <code>description</code> (optional)<br />
            <br />
            <strong>Don&apos;t worry about exact names</strong> — next step lets you map columns.
          </div>
        </div>
      )}

      {step === 1 && sheet && (
        <>
          <ColumnMapper
            headers={sheet.headers}
            schema={SCHEMA}
            mapping={mapping}
            onChange={(f, header) => setMapping(prev => ({ ...prev, [f]: header }))}
            {...(sheet.rows[0] ? { sampleRow: sheet.rows[0] } : {})}
          />
          {rowErrors.size > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--sem-amber)', marginBottom: 8 }}>
                ⚠ {rowErrors.size} row(s) excluded due to validation errors:
              </div>
              <ImportPreviewTable
                columns={['Code', 'Name', 'Type', 'Description']}
                rows={transformedRows.map(r => [r.code, r.name, r.account_type, r.description ?? ''])}
                errors={rowErrors}
                maxVisible={5}
              />
            </div>
          )}
          <FooterActions
            onBack={() => setStep(0)} onNext={handleNextFromMapping}
            nextLabel={detecting ? 'Detecting…' : 'Next →'}
            nextDisabled={detecting}
            stepInfo={`${validRows.length} valid row(s) ready`}
          />
        </>
      )}

      {step === 2 && (
        <>
          <DuplicateResolver
            duplicates={duplicates.map<DuplicateRow>(d => ({
              key: d.code,
              newName: transformedRows.find(r => r.code === d.code)?.name ?? d.code,
              existingName: d.existing_name,
              existingHint: `Type: ${d.existing_type}`
            }))}
            resolutions={resolutions}
            onChange={(key, r) => setResolutions(prev => ({ ...prev, [key]: r }))}
            onApplyAll={r => {
              const next: Record<string, Resolution> = {}
              duplicates.forEach(d => { next[d.code] = r })
              setResolutions(next)
            }}
          />
          <FooterActions
            onBack={() => setStep(1)} onNext={handleConfirmImport}
            nextLabel={importing ? 'Importing…' : 'Import accounts'}
            nextDisabled={importing}
            stepInfo={`${validRows.length - duplicates.length} new + ${duplicates.length} duplicates`}
            isFinal
          />
        </>
      )}

      {step === 3 && result && (
        <div className="lp-banner success" style={{
          flexDirection: 'column', alignItems: 'center', padding: 24, textAlign: 'center'
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>
            Import complete{activeClient ? ` for ${activeClient.display_name}` : ''}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 24,
            fontSize: 13, marginBottom: 18, color: 'var(--lp-text)'
          }}>
            <Stat label="Inserted" value={result.inserted} color="var(--sem-green)" />
            <Stat label="Updated" value={result.updated} color="var(--lp-accent)" />
            <Stat label="Skipped" value={result.skipped} color="var(--lp-text-muted)" />
            <Stat label="Errors" value={result.errors.length}
              color={result.errors.length > 0 ? 'var(--sem-red)' : 'var(--lp-text-muted)'} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button
              onClick={() => navigate('/chart-of-accounts')}
              className="lp-btn lp-btn-primary lp-btn-sm"
            >
              View Chart of Accounts →
            </button>
            <button
              onClick={() => navigate(hasClientScope ? `/import?clientId=${clientId}` : '/import')}
              className="lp-btn lp-btn-ghost lp-btn-sm"
            >
              Back to Import
            </button>
          </div>
          {result.errors.length > 0 && (
            <details style={{ marginTop: 16, textAlign: 'left', width: '100%' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--sem-red)' }}>
                View {result.errors.length} error(s)
              </summary>
              <pre style={{
                marginTop: 8, padding: 10,
                background: 'var(--lp-surface-2)', fontSize: 11,
                color: 'var(--lp-text-muted)',
                maxHeight: 200, overflow: 'auto', borderRadius: 6
              }}>
                {result.errors.map((e, i) =>
                  `${i + 1}. ${e.error}\n   Row: ${JSON.stringify(e.row)}`
                ).join('\n\n')}
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
      marginTop: 20, padding: '14px 0',
      borderTop: '0.5px solid var(--lp-border)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <button onClick={onBack} className="lp-btn lp-btn-ghost lp-btn-sm">
        ← Back
      </button>
      {stepInfo && (
        <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>{stepInfo}</div>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className={`lp-btn lp-btn-sm ${isFinal ? 'lp-btn-primary' : 'lp-btn-primary'}`}
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
      <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
    </div>
  )
}
