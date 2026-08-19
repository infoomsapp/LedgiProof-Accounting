// PATH: src/lib/csv-parser.ts
//
// P-Import-Data — Unified parser for 3 input modes.
//
// Output shape (identical regardless of source):
//   { headers: string[], rows: Record<string, string>[] }
//
// Supported sources:
//   1. CSV file (.csv)              via Papa Parse
//   2. Excel file (.xlsx, .xls)     via SheetJS (xlsx)
//   3. Clipboard paste              auto-detects TSV vs CSV
//
// Dependencies (require `npm install papaparse @types/papaparse xlsx`):

import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ── Public types ────────────────────────────────────────────────────────────

export interface ParseResult {
  headers: string[]
  rows:    Record<string, string>[]
  meta: {
    source:     'csv' | 'xlsx' | 'paste'
    file_name?: string
    sheet_name?: string
    row_count:  number
  }
}

export interface ParseError {
  source:   'csv' | 'xlsx' | 'paste'
  message:  string
}

export type FileKind = 'csv' | 'excel' | 'unknown'

// ── File-type detector ──────────────────────────────────────────────────────

/**
 * Inspect a File and return whether it's a CSV, Excel, or unsupported.
 * Used by the drop zone to route to the right parser.
 */
export function detectFileType(file: File): FileKind {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) return 'csv'
  if (name.endsWith('.xlsx') || name.endsWith('.xls'))                          return 'excel'
  if (file.type === 'text/csv' || file.type === 'text/plain')                  return 'csv'
  if (file.type.includes('spreadsheet') || file.type.includes('excel'))        return 'excel'
  return 'unknown'
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a File object. Auto-detects CSV vs Excel by extension.
 */
export async function parseFile(file: File): Promise<ParseResult> {
  const kind = detectFileType(file)
  if (kind === 'csv')   return parseCsvFile(file)
  if (kind === 'excel') return parseExcelFile(file)
  throw {
    source:  'csv',
    message: `Unsupported file type: ${file.name}. Use CSV or Excel.`
  } as ParseError
}

/**
 * Parse pasted text (clipboard). Auto-detects TSV vs CSV by delimiter sniff.
 */
export function parsePaste(text: string): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) {
    throw { source: 'paste', message: 'Empty paste' } as ParseError
  }

  // Sniff delimiter from the first line
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? ''
  const tabCount  = (firstLine.match(/\t/g) ?? []).length
  const commaCount = (firstLine.match(/,/g)  ?? []).length
  const delimiter = tabCount >= commaCount ? '\t' : ','

  const result = Papa.parse<Record<string, string>>(trimmed, {
    delimiter,
    header:           true,
    skipEmptyLines:   'greedy',
    transformHeader:  h => h.trim(),
    transform:        v => (typeof v === 'string' ? v.trim() : v)
  })

  if (result.errors.length > 0 && result.data.length === 0) {
    throw {
      source:  'paste',
      message: result.errors[0]?.message ?? 'Could not parse pasted content'
    } as ParseError
  }

  return {
    headers: result.meta.fields ?? [],
    rows:    result.data,
    meta: {
      source:    'paste',
      row_count: result.data.length
    }
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header:          true,
      skipEmptyLines:  'greedy',
      transformHeader: h => h.trim().replace(/^\uFEFF/, ''),  // strip BOM
      transform:       v => (typeof v === 'string' ? v.trim() : v),
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          reject({
            source:  'csv',
            message: results.errors[0]?.message ?? 'CSV parse failed'
          } as ParseError)
          return
        }
        resolve({
          headers: results.meta.fields ?? [],
          rows:    results.data,
          meta: {
            source:    'csv',
            file_name: file.name,
            row_count: results.data.length
          }
        })
      },
      error: (err) => reject({ source: 'csv', message: err.message } as ParseError)
    })
  })
}

async function parseExcelFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw { source: 'xlsx', message: 'Excel file has no sheets' } as ParseError
  }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw { source: 'xlsx', message: `Sheet "${sheetName}" could not be read` } as ParseError
  }

  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header:    1,
    defval:    '',
    raw:       false,
    blankrows: false
  })

  if (aoa.length === 0) {
    throw { source: 'xlsx', message: `Sheet "${sheetName}" is empty` } as ParseError
  }

  const headers = (aoa[0] as unknown[]).map(h => String(h ?? '').trim())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[]
    const obj: Record<string, string> = {}
    let isEmpty = true
    headers.forEach((header, j) => {
      const cell = row[j]
      const val = cell == null ? '' : String(cell).trim()
      if (val) isEmpty = false
      obj[header] = val
    })
    if (!isEmpty) rows.push(obj)
  }

  return {
    headers,
    rows,
    meta: {
      source:     'xlsx',
      file_name:  file.name,
      sheet_name: sheetName,
      row_count:  rows.length
    }
  }
}

// ── Column mapping helpers ─────────────────────────────────────────────────

/**
 * Fuzzy match a single target field name against parsed headers.
 * Used internally by suggestColumnsForSchema; also exported for ad-hoc use.
 */
export function suggestColumn(headers: string[], target: string): string | null {
  const t = target.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const h of headers) {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (norm === t) return h
  }
  for (const h of headers) {
    const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (norm.includes(t) || t.includes(norm)) return h
  }
  return null
}

/**
 * Suggested SchemaField shape — the wizards each define their own SCHEMA
 * with field + synonyms. We accept the loose shape here to avoid a circular
 * type dep with components/import/ColumnMapper.
 */
export interface SuggestionField {
  field:    string
  synonyms: string[]
}

/**
 * Auto-match an entire schema against the headers.
 * For each schema field, tries:
 *   1. Exact match of `field` name (normalized)
 *   2. Each synonym in order (normalized)
 * Returns Record<field, headerName | null>.
 *
 * The wizards use this to pre-fill the ColumnMapper in step 2.
 */
export function suggestColumnsForSchema(
  headers: string[],
  schema:  SuggestionField[]
): Record<string, string | null> {
  const result: Record<string, string | null> = {}
  for (const f of schema) {
    // Try the field name first, then each synonym
    let matched: string | null = suggestColumn(headers, f.field)
    if (!matched) {
      for (const syn of f.synonyms) {
        matched = suggestColumn(headers, syn)
        if (matched) break
      }
    }
    result[f.field] = matched
  }
  return result
}

/**
 * Apply a mapping {target_field: source_header} to a row.
 * Returns { [target_field]: row[source_header] ?? '' }
 */
export function applyMapping(
  row: Record<string, string>,
  mapping: Record<string, string | null>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [target, source] of Object.entries(mapping)) {
    out[target] = source ? (row[source] ?? '') : ''
  }
  return out
}
