// PATH: src/pages/import/ImportCustomers.tsx

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import FileDropZone from '../../components/import/FileDropZone'
import ImportStepIndicator from '../../components/import/ImportStepIndicator'
import ColumnMapper, { validateMapping, type SchemaField } from '../../components/import/ColumnMapper'
import DuplicateResolver, { type DuplicateRow } from '../../components/import/DuplicateResolver'
import ImportPreviewTable from '../../components/import/ImportPreviewTable'
import { suggestColumnsForSchema, type ParseResult } from '../../lib/csv-parser'
import {
  detectClientDuplicates,
  importClients,
  type DuplicateClient,
  type ImportSummary,
  type Resolution
} from '../../services/import.service'

// ── Helper: narrow unknown errors to a message (Constitution: no 'any') ─────
function errMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return fallback
}

const SCHEMA: SchemaField[] = [
  { field: 'display_name', label: 'Client name', required: true,
    synonyms: ['name', 'displayname', 'clientname', 'customer', 'customername', 'company'] },
  { field: 'company_name', label: 'Legal company name', required: false,
    synonyms: ['companyname', 'legalname', 'businessname'] },
  { field: 'email', label: 'Email', required: false,
    synonyms: ['email', 'mail', 'emailaddress', 'contactemail'] },
  { field: 'phone', label: 'Phone', required: false,
    synonyms: ['phone', 'phonenumber', 'tel', 'telephone', 'mobile'] },
  { field: 'tax_id', label: 'Tax ID / EIN', required: false,
    synonyms: ['taxid', 'ein', 'taxnumber', 'rfc', 'vat'] },
  { field: 'address_line1', label: 'Street address', required: false,
    synonyms: ['address', 'addressline1', 'street', 'streetaddress'] },
  { field: 'city', label: 'City', required: false,
    synonyms: ['city', 'town', 'locality'] },
  { field: 'state', label: 'State', required: false,
    synonyms: ['state', 'province', 'region'] },
  { field: 'postal_code', label: 'ZIP / Postal code', required: false,
    synonyms: ['zip', 'zipcode', 'postal', 'postalcode'] },
  { field: 'default_currency', label: 'Currency', required: false,
    synonyms: ['currency', 'defaultcurrency'],
    hint: 'Defaults to USD if empty' },
  { field: 'payment_terms', label: 'Payment terms (days)', required: false,
    synonyms: ['terms', 'paymentterms', 'netterms'],
    hint: 'Defaults to 30 if empty' }
]

const STEPS = [
  { label: 'Upload' },
  { label: 'Map columns' },
  { label: 'Resolve duplicates' },
  { label: 'Confirm' }
]

export default function ImportCustomers() {
  const navigate = useNavigate()
  const { membership } = useAuthStore()
  const orgId = membership?.org_id ?? ''

  const [step, setStep] = useState(0)
  const [sheet, setSheet] = useState<ParseResult | null>(null)
  const [sourceLabel, setSourceLabel] = useState('')
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [duplicates, setDuplicates] = useState<DuplicateClient[]>([])
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({})
  const [detecting, setDetecting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportSummary | null>(null)

  const transformedRows = useMemo(() => {
    if (!sheet) return []
    return sheet.rows
      .map(r => {
        const get = (f: string) => mapping[f] ? (r[mapping[f]!] ?? '').trim() : ''
        return {
          display_name:     get('display_name'),
          company_name:     get('company_name'),
          email:            get('email').toLowerCase(),
          phone:            get('phone'),
          tax_id:           get('tax_id'),
          address_line1:    get('address_line1'),
          city:             get('city'),
          state:            get('state'),
          postal_code:      get('postal_code'),
          default_currency: get('default_currency') || 'USD',
          payment_terms:    parseInt(get('payment_terms'), 10) || 30,
          country:          'US'
        }
      })
      .filter(r => r.display_name || r.email)
  }, [sheet, mapping])

  const rowErrors = useMemo(() => {
    const errs = new Map<number, string>()
    transformedRows.forEach((r, i) => {
      if (!r.display_name) errs.set(i, 'Missing name')
      else if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
        errs.set(i, `Invalid email: ${r.email}`)
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
      setError('No valid rows to import.')
      return
    }
    setError(null)
    runDuplicateDetection()
  }

  async function runDuplicateDetection() {
    setDetecting(true)
    try {
      const keys = validRows.map(r => r.email || r.display_name).filter(Boolean)
      const dups = await detectClientDuplicates(orgId, keys)
      setDuplicates(dups)
      const initRes: Record<string, Resolution> = {}
      dups.forEach(d => { initRes[d.match_key] = 'skip' })
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
      const summary = await importClients(orgId, validRows, resolutions)
      setResult(summary)
      setStep(3)
    } catch (e: unknown) {
      setError(errMessage(e, 'Import failed'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => navigate('/import')} style={{
          background: 'none', border: 'none', padding: 0,
          color: 'var(--lp-accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
        }}>
          ← Back to Import
        </button>
      </div>

      <h1 className="lp-page-title" style={{ margin: 0 }}>👥 Import Customers</h1>
      <p className="lp-page-sub" style={{ margin: '4px 0 24px 0' }}>
        {sourceLabel ? `Source: ${sourceLabel}` : 'Upload a CSV/Excel file or paste from clipboard'}
      </p>

      <ImportStepIndicator steps={STEPS} current={step} />

      {error && (
        <div style={{
          padding: '10px 14px', background: 'var(--sem-red-bg)',
          border: '0.5px solid var(--sem-red)', borderRadius: 8,
          color: 'var(--sem-red)', fontSize: 12.5, marginBottom: 16
        }}>
          ⚠ {error}
        </div>
      )}

      {step === 0 && (
        <div>
          <FileDropZone onParsed={handleParsed} onError={setError} />
          <div style={{
            marginTop: 20, padding: 14,
            background: 'var(--lp-surface-2)',
            border: '0.5px solid var(--lp-border)',
            borderRadius: 8, fontSize: 12,
            color: 'var(--lp-text-muted)', lineHeight: 1.6
          }}>
            <strong style={{ color: 'var(--lp-text)' }}>Required:</strong> client name<br />
            <strong style={{ color: 'var(--lp-text)' }}>Optional:</strong> email, phone, tax ID, address, currency, payment terms<br />
            <br />
            <strong>Duplicates are detected</strong> by matching email (preferred) or name.
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
                ⚠ {rowErrors.size} row(s) excluded:
              </div>
              <ImportPreviewTable
                columns={['Name', 'Email', 'Phone']}
                rows={transformedRows.map(r => [r.display_name, r.email, r.phone])}
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
              key: d.match_key,
              newName: validRows.find(r => (r.email || r.display_name.toLowerCase()) === d.match_key)?.display_name ?? d.match_key,
              existingName: d.existing_name,
              ...(d.existing_email ? { existingHint: d.existing_email } : {})
            }))}
            resolutions={resolutions}
            onChange={(key, r) => setResolutions(prev => ({ ...prev, [key]: r }))}
            onApplyAll={r => {
              const next: Record<string, Resolution> = {}
              duplicates.forEach(d => { next[d.match_key] = r })
              setResolutions(next)
            }}
          />
          <FooterActions
            onBack={() => setStep(1)} onNext={handleConfirmImport}
            nextLabel={importing ? 'Importing…' : 'Import customers'}
            nextDisabled={importing}
            stepInfo={`${validRows.length - duplicates.length} new + ${duplicates.length} duplicates`}
            isFinal
          />
        </>
      )}

      {step === 3 && result && (
        <div style={{
          padding: 24, background: 'var(--sem-green-bg)',
          border: '0.5px solid var(--sem-green)', borderRadius: 10, textAlign: 'center'
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--sem-green)', marginBottom: 14 }}>
            Customers imported
          </div>
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 24,
            fontSize: 13, marginBottom: 18
          }}>
            <Stat label="Inserted" value={result.inserted} color="var(--sem-green)" />
            <Stat label="Updated" value={result.updated} color="var(--lp-accent)" />
            <Stat label="Skipped" value={result.skipped} color="var(--lp-text-muted)" />
            <Stat label="Errors" value={result.errors.length}
              color={result.errors.length > 0 ? 'var(--sem-red)' : 'var(--lp-text-muted)'} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button
              onClick={() => navigate('/clients')}
              className="lp-btn lp-btn-primary lp-btn-sm"
            >
              View Clients →
            </button>
            <button
              onClick={() => navigate('/import')}
              className="lp-btn lp-btn-ghost lp-btn-sm"
            >
              Back to Import
            </button>
          </div>
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
      <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
    </div>
  )
}
