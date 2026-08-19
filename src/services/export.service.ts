// PATH: src/services/export.service.ts
// Two export modes:
//   1. printToPDF()  — triggers Electron's printToPDF via IPC
//   2. downloadCSV() — builds CSV string and saves via IPC or browser download

// ── Type augment for window.api ────────────────────────────────────────────
declare global {
  interface Window {
    api?: {
      export?: {
        printToPDF: () => Promise<string | null>
        saveText:   (content: string, filename: string, ext: string) => Promise<string | null>
      }
    }
  }
}

// ── Print current page to PDF ─────────────────────────────────────────────
// Adds print-optimized CSS, opens system print dialog (Electron → PDF file).
export async function printToPDF(title?: string): Promise<void> {
  // Add print stylesheet to hide sidebar/topbar
  const styleId = 'lp-print-style'
  let style = document.getElementById(styleId) as HTMLStyleElement | null

  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    document.head.appendChild(style)
  }

  style.textContent = `
    @media print {
      /* Hide all nav chrome */
      nav, aside, [data-print-hide],
      .lp-sidebar, .lp-topbar,
      button, .lp-btn { display: none !important; }

      /* Make content full width */
      main, [data-print-content] {
        width: 100% !important;
        max-width: none !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      body { background: white !important; color: black !important; }

      /* Page setup */
      @page {
        margin: 18mm 16mm;
        size: letter;
      }

      /* Force colors for semaphore badges */
      [data-semaphore="blue"]  { color: #1d4ed8 !important; }
      [data-semaphore="green"] { color: #15803d !important; }
      [data-semaphore="amber"] { color: #92400e !important; }
      [data-semaphore="red"]   { color: #991b1b !important; }

      /* Tables */
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 0.5px solid #d1d5db; padding: 6px 10px; font-size: 11px; }
      thead { background: #f9fafb !important; }
    }
  `

  if (title) { document.title = title }

  // Electron: use IPC for PDF file save dialog
  if (window.api?.export?.printToPDF) {
    await window.api.export.printToPDF()
  } else {
    // Fallback: browser print dialog
    window.print()
  }
}

// ── Build + save CSV ──────────────────────────────────────────────────────
export function buildCSV(
  headers: string[],
  rows:    Array<(string | number | null | undefined)[]>
): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const lines = [
    headers.map(escape).join(','),
    ...rows.map(r => r.map(escape).join(','))
  ]

  return lines.join('\r\n')
}

export async function downloadCSV(
  csv:      string,
  filename: string
): Promise<void> {
  if (window.api?.export?.saveText) {
    await window.api.export.saveText(csv, filename, 'csv')
  } else {
    // Browser fallback
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}

// ── Transactions → CSV ────────────────────────────────────────────────────
import type { Transaction } from '../types/database.types'
import { formatDate } from '../lib/dates'

export function exportTransactionsCSV(rows: Transaction[]): string {
  return buildCSV(
    ['Date', 'Description', 'Reference', 'Amount', 'Currency', 'Semaphore', 'Status', 'Source', 'Reconciled'],
    rows.map(r => [
      r.transaction_date,
      r.description,
      r.reference,
      r.amount,
      r.currency,
      r.semaphore,
      r.review_status,
      r.source,
      r.reconciled_at ? formatDate(r.reconciled_at) : ''
    ])
  )
}