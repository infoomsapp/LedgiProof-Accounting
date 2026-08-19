// PATH: src/pages/import/ImportOpeningBalances.tsx
//
// 4-step wizard. STRICT accounting validation:
//   · transition_date required
//   · Sum(debit) == Sum(credit) within 0.01
//   · Each row has either debit OR credit, not both
//   · All account_codes must exist (enforced server-side)

import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import FileDropZone from '../../components/import/FileDropZone'
import ImportStepIndicator from '../../components/import/ImportStepIndicator'
import ColumnMapper, { validateMapping, type SchemaField } from '../../components/import/ColumnMapper'
import ImportPreviewTable from '../../components/import/ImportPreviewTable'
import { suggestColumnsForSchema, type ParseResult } from '../../lib/csv-parser'
import {
  importOpeningBalances,
  type OpeningBalanceResult,
  type OpeningBalanceEntry
} from '../../services/import.service'

const SCHEMA: SchemaField[] = [
  { field: 'account_code', label: 'Account code', required: true,
    synonyms: ['code', 'accountcode', 'account', 'acct'] },
  { field: 'debit', label: 'Debit', required: true,
    synonyms: ['debit', 'debits', 'dr'],
    hint: 'Enter 0 if this entry is a credit' },
  { field: 'credit', label: 'Credit', required: true,
    synonyms: ['credit', 'credits', 'cr'],
    hint: 'Enter 0 if this entry is a debit' },
  { field: 'memo', label: 'Memo', required: false,
    synonyms: ['memo', 'description', 'notes'] }
]

const STEPS = [
  { label: 'Upload' },
  { label: 'Date & Map' },
  { label: 'Validate balance' },
  { label: 'Confirm' }
]

function parseNumber(s: string): number {
  if (!s || s.trim() === '') return 0
  const cleaned = s.replace(/[$,€£¥\s]/g, '')
  const n = parseFloat(cleaned)
  return isFinite(n) ? n : 0
}

export default function ImportOpeningBalances() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clientId = searchParams.get('clientId')  // firm mode: scope account resolution to this client
  const { membership } = useAuthStore()
  const orgId = membership?.org_id ?? ''

  const [step, setStep] = useState(0)
  const [sheet, setSheet] = useState<ParseResult | null>(null)
  const [sourceLabel, setSourceLabel] = useState('')
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [transitionDate, setTransitionDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OpeningBalanceResult | null>(null)

  const entries = useMemo<OpeningBalanceEntry[]>(() => {
    if (!sheet) return []
    return sheet.rows
      .map(r => {
        const get = (f: string) => mapping[f] ? (r[mapping[f]!] ?? '').trim() : ''
        return {
          account_code: get('account_code'),
          debit:        parseNumber(get('debit')),
          credit:       parseNumber(get('credit')),
          ...(get('memo') ? { memo: get('memo') } : {})
        }
      })
      .filter(e => e.account_code)
  }, [sheet, mapping])

  const rowErrors = useMemo(() => {
    const errs = new Map<number, string>()
    const seen = new Set<string>()
    entries.forEach((e, i) => {
      if (!e.account_code) errs.set(i, 'Missing account code')
      else if (seen.has(e.account_code)) errs.set(i, `Duplicate code: ${e.account_code}`)
      else if (e.debit < 0 || e.credit < 0) errs.set(i, 'Negative values not allowed')
      else if (e.debit > 0 && e.credit > 0) errs.set(i, 'Cannot have both debit and credit')
      else if (e.debit === 0 && e.credit === 0) errs.set(i, 'Must have either debit or credit')
      seen.add(e.account_code)
    })
    return errs
  }, [entries])

  const validEntries = useMemo(
    () => entries.filter((_, i) => !rowErrors.has(i)),
    [entries, rowErrors]
  )

  const totals = useMemo(() => {
    const totalDebit = validEntries.reduce((s, e) => s + e.debit, 0)
    const totalCredit = validEntries.reduce((s, e) => s + e.credit, 0)
    const diff = Math.abs(totalDebit - totalCredit)
    return { totalDebit, totalCredit, diff, balanced: diff <= 0.01 }
  }, [validEntries])

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
    if (!transitionDate) {
      setError('Transition date is required')
      return
    }
    if (validEntries.length === 0) {
      setError('No valid entries to import.')
      return
    }
    setError(null)
    setStep(2)
  }

  async function handleConfirmImport() {
    if (!totals.balanced) {
      setError(`Debits and credits must match. Diff: ${totals.diff.toFixed(2)}`)
      return
    }
    setImporting(true)
    setError(null)
    try {
      const res = await importOpeningBalances(orgId, transitionDate, validEntries, undefined, clientId)
      setResult(res)
      setStep(3)
    } catch (e: any) {
      setError(e?.message ?? 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 980, width: '100%', margin: '0 auto' }}>
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => navigate('/import')} style={{
          background: 'none', border: 'none', padding: 0,
          color: 'var(--lp-accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
        }}>
          ← Back to Import
        </button>
      </div>

      <h1 className="lp-page-title" style={{ margin: 0 }}>⚖️ Import Opening Balances</h1>
      <p className="lp-page-sub" style={{ margin: '4px 0 24px 0' }}>
        Seed account balances from a prior books period.
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
            background: 'var(--sem-amber-bg)',
            border: '0.5px solid var(--sem-amber)',
            borderRadius: 8, fontSize: 12,
            lineHeight: 1.6, color: 'var(--lp-text)'
          }}>
            <strong style={{ color: 'var(--sem-amber)' }}>⚠️ Strict validation:</strong>
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>Total debits must equal total credits</li>
              <li>Each row must have <strong>either debit OR credit</strong>, not both</li>
              <li>All account codes must already exist in your Chart of Accounts</li>
              <li>If your Chart of Accounts is empty, run <strong>Import Chart of Accounts</strong> first</li>
            </ul>
          </div>
        </div>
      )}

      {step === 1 && sheet && (
        <>
          <div className="lp-card" style={{ marginBottom: 16, padding: 16 }}>
            <label style={{
              display: 'block', fontSize: 10.5, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'var(--lp-text-muted)', marginBottom: 5
            }}>
              Transition date <span style={{ color: 'var(--sem-red)' }}>*</span>
            </label>
            <input
              type="date"
              value={transitionDate}
              onChange={e => setTransitionDate(e.target.value)}
              className="lp-input"
              style={{ width: 200 }}
            />
            <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 5 }}>
              Date of the closing balance from the prior books period.
            </div>
          </div>

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
                ⚠ {rowErrors.size} row(s) have errors and will be excluded:
              </div>
              <ImportPreviewTable
                columns={['Code', 'Debit', 'Credit', 'Memo']}
                rows={entries.map(e => [
                  e.account_code,
                  e.debit > 0 ? e.debit.toFixed(2) : '',
                  e.credit > 0 ? e.credit.toFixed(2) : '',
                  e.memo ?? ''
                ])}
                errors={rowErrors}
                maxVisible={10}
              />
            </div>
          )}

          <FooterActions
            onBack={() => setStep(0)} onNext={handleNextFromMapping}
            nextLabel="Next: validate balance →"
            nextDisabled={false}
            stepInfo={`${validEntries.length} valid entries`}
          />
        </>
      )}

      {step === 2 && (
        <>
          <div className="lp-card" style={{
            padding: 20,
            background: totals.balanced ? 'var(--sem-green-bg)' : 'var(--sem-red-bg)',
            border: `0.5px solid ${totals.balanced ? 'var(--sem-green)' : 'var(--sem-red)'}`,
            marginBottom: 16
          }}>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: totals.balanced ? 'var(--sem-green)' : 'var(--sem-red)',
              marginBottom: 14, textAlign: 'center'
            }}>
              {totals.balanced
                ? '✓ Debits and credits are balanced'
                : '✗ Debits and credits do NOT balance'}
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16, textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Total debits
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 700, color: 'var(--lp-text)',
                  fontFamily: 'monospace'
                }}>
                  ${totals.totalDebit.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Total credits
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 700, color: 'var(--lp-text)',
                  fontFamily: 'monospace'
                }}>
                  ${totals.totalCredit.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Difference
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 700,
                  color: totals.balanced ? 'var(--sem-green)' : 'var(--sem-red)',
                  fontFamily: 'monospace'
                }}>
                  ${totals.diff.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <ImportPreviewTable
            columns={['Code', 'Debit', 'Credit', 'Memo']}
            rows={validEntries.map(e => [
              e.account_code,
              e.debit > 0 ? e.debit.toFixed(2) : '',
              e.credit > 0 ? e.credit.toFixed(2) : '',
              e.memo ?? ''
            ])}
            maxVisible={50}
          />

          <div style={{
            marginTop: 16, padding: 12,
            background: 'var(--lp-surface-2)',
            border: '0.5px solid var(--lp-border)',
            borderRadius: 8, fontSize: 12,
            color: 'var(--lp-text-muted)'
          }}>
            <div style={{ marginBottom: 4 }}>
              <strong style={{ color: 'var(--lp-text)' }}>Transition date:</strong> {transitionDate}
            </div>
            <div>
              On confirm, a single journal entry will be created with {validEntries.length} lines.
            </div>
          </div>

          <FooterActions
            onBack={() => setStep(1)} onNext={handleConfirmImport}
            nextLabel={importing ? 'Importing…' : 'Confirm import'}
            nextDisabled={importing || !totals.balanced}
            stepInfo={totals.balanced
              ? '✓ Ready to import'
              : `Imbalanced by $${totals.diff.toFixed(2)} — fix before importing`}
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
            Opening balances imported
          </div>
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 32,
            fontSize: 13, marginBottom: 18
          }}>
            <Stat label="Lines created" value={result.lines_count} color="var(--sem-green)" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--lp-text)', fontFamily: 'monospace' }}>
                ${result.total_debit.toFixed(2)}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Total balanced
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--lp-text)' }}>
                {result.transition_date}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Transition date
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginBottom: 14 }}>
            Journal entry: <code style={{ fontFamily: 'monospace' }}>{result.journal_entry_id.slice(0, 8)}…</code>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button onClick={() => navigate('/reports')} style={{
              background: 'var(--lp-accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 14px', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
            }}>
              View Reports →
            </button>
            <button onClick={() => navigate('/import')} style={{
              background: 'transparent', color: 'var(--lp-text-muted)',
              border: '0.5px solid var(--lp-border)',
              borderRadius: 8, padding: '8px 14px', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit'
            }}>
              Back to Import
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FooterActions({ onBack, onNext, nextLabel, nextDisabled, stepInfo, isFinal }: any) {
  return (
    <div style={{
      marginTop: 20, padding: '14px 0',
      borderTop: '0.5px solid var(--lp-border)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <button onClick={onBack} style={{
        background: 'transparent',
        border: '0.5px solid var(--lp-border)',
        color: 'var(--lp-text-muted)',
        borderRadius: 8, padding: '7px 14px',
        fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
      }}>
        ← Back
      </button>
      {stepInfo && <div style={{
        fontSize: 11.5,
        color: typeof stepInfo === 'string' && stepInfo.startsWith('✓')
          ? 'var(--sem-green)' : 'var(--lp-text-muted)'
      }}>{stepInfo}</div>}
      <button onClick={onNext} disabled={nextDisabled} style={{
        background: nextDisabled ? 'var(--lp-surface-2)'
                  : isFinal ? 'var(--sem-green)' : 'var(--lp-accent)',
        border: 'none',
        color: nextDisabled ? 'var(--lp-text-muted)' : '#fff',
        borderRadius: 8, padding: '7px 16px',
        fontSize: 12, fontWeight: 600,
        cursor: nextDisabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit'
      }}>
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
