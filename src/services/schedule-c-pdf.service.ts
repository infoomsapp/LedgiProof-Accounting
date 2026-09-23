// PATH: src/services/schedule-c-pdf.service.ts
//
// Real Schedule C PDF export — replaces the previously-unwired
// onExportPdf prop on ScheduleCPreview.tsx. Builds an actual PDF file
// with pdf-lib (no browser print dialog involved) that a self-employed
// user can hand straight to their accountant or attach to their own
// filing: Part I income, Part II expenses by IRS line number, and the
// Line 31 net profit/loss -- not a replica of the official IRS form
// (LedgiProof isn't a tax-filing engine), but every number and every
// line label on it is real, computed from the user's own transactions
// via get_schedule_c_data.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { SCHEDULE_C_LINE_LABELS, type ScheduleCData } from './solo-dashboard.service'

const PAGE_WIDTH  = 612 // US Letter, points
const PAGE_HEIGHT = 792
const MARGIN      = 48

const INK       = rgb(0.09, 0.11, 0.16)
const MUTED     = rgb(0.42, 0.46, 0.53)
const GREEN     = rgb(0.13, 0.55, 0.29)
const RED       = rgb(0.75, 0.15, 0.15)
const LINE      = rgb(0.85, 0.87, 0.90)

function fmt(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Cursor { page: PDFPage; y: number }

function newPage(doc: PDFDocument): Cursor {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  return { page, y: PAGE_HEIGHT - MARGIN }
}

function ensureSpace(doc: PDFDocument, cursor: Cursor, needed: number): Cursor {
  if (cursor.y - needed > MARGIN) return cursor
  return newPage(doc)
}

export async function generateScheduleCPdf(
  data: ScheduleCData,
  year: number,
  businessName: string | null
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono    = await doc.embedFont(StandardFonts.Courier)

  let c = newPage(doc)

  // ── Header ──────────────────────────────────────────────────────────────
  c.page.drawText('Schedule C Summary', { x: MARGIN, y: c.y, size: 18, font: bold, color: INK })
  c.y -= 22
  c.page.drawText(`Profit or Loss from Business — Tax Year ${year}`, { x: MARGIN, y: c.y, size: 11, font: regular, color: MUTED })
  c.y -= 16
  if (businessName) {
    c.page.drawText(businessName, { x: MARGIN, y: c.y, size: 11, font: bold, color: INK })
    c.y -= 16
  }
  c.page.drawText(`Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · LedgiProof`, {
    x: MARGIN, y: c.y, size: 9, font: regular, color: MUTED
  })
  c.y -= 10
  c.page.drawLine({ start: { x: MARGIN, y: c.y }, end: { x: PAGE_WIDTH - MARGIN, y: c.y }, thickness: 1, color: LINE })
  c.y -= 24

  const colLine   = MARGIN
  const colLabel  = MARGIN + 40
  const colAmount = PAGE_WIDTH - MARGIN - 90

  function drawSectionHeader(title: string, color = INK) {
    c = ensureSpace(doc, c, 30)
    c.page.drawText(title.toUpperCase(), { x: MARGIN, y: c.y, size: 10, font: bold, color })
    c.y -= 16
  }

  function drawLineRow(lineNumber: number, label: string, amount: number, opts: { emphasize?: boolean; color?: typeof INK } = {}) {
    c = ensureSpace(doc, c, 16)
    const font = opts.emphasize ? bold : regular
    const size = opts.emphasize ? 10.5 : 10
    c.page.drawText(`Ln ${lineNumber}`, { x: colLine, y: c.y, size: 9, font: mono, color: MUTED })
    c.page.drawText(label, { x: colLabel, y: c.y, size, font, color: opts.color ?? INK })
    const amountText = fmt(amount)
    const amountWidth = font.widthOfTextAtSize(amountText, size)
    c.page.drawText(amountText, { x: PAGE_WIDTH - MARGIN - amountWidth, y: c.y, size, font, color: opts.color ?? INK })
    c.y -= opts.emphasize ? 18 : 15
  }

  function drawSubRow(text: string, amount: number) {
    c = ensureSpace(doc, c, 14)
    c.page.drawText(text, { x: colLabel + 12, y: c.y, size: 8.5, font: regular, color: MUTED })
    const amountText = fmt(amount)
    const amountWidth = mono.widthOfTextAtSize(amountText, 8.5)
    c.page.drawText(amountText, { x: PAGE_WIDTH - MARGIN - amountWidth, y: c.y, size: 8.5, font: mono, color: MUTED })
    c.y -= 12
  }

  const sorted = [...data.lines].sort((a, b) => a.line_number - b.line_number)
  const incomeLines  = sorted.filter(l => l.account_type === 'income')
  const expenseLines = sorted.filter(l => l.account_type === 'expense')

  // ── Part I — Income ─────────────────────────────────────────────────────
  drawSectionHeader('Part I — Income', GREEN)
  if (incomeLines.length === 0) {
    c.page.drawText('No income recorded for this period.', { x: colLabel, y: c.y, size: 9.5, font: regular, color: MUTED })
    c.y -= 16
  }
  for (const line of incomeLines) {
    const label = SCHEDULE_C_LINE_LABELS[line.line_number] ?? `Line ${line.line_number}`
    drawLineRow(line.line_number, label, line.line_total)
    for (const acc of line.accounts) drawSubRow(`${acc.account_code} · ${acc.account_name}`, acc.amount)
  }
  c.y -= 4
  drawLineRow(1, 'Gross receipts (Line 1)', data.totals.gross_receipts, { emphasize: true, color: GREEN })
  c.y -= 10

  // ── Part II — Expenses ──────────────────────────────────────────────────
  drawSectionHeader('Part II — Expenses', RED)
  if (expenseLines.length === 0) {
    c.page.drawText('No expenses recorded for this period.', { x: colLabel, y: c.y, size: 9.5, font: regular, color: MUTED })
    c.y -= 16
  }
  for (const line of expenseLines) {
    if (Math.abs(line.line_total) < 0.005) continue
    const label = SCHEDULE_C_LINE_LABELS[line.line_number] ?? `Line ${line.line_number}`
    drawLineRow(line.line_number, label, line.line_total)
    for (const acc of line.accounts) drawSubRow(`${acc.account_code} · ${acc.account_name}`, acc.amount)
  }
  c.y -= 4
  drawLineRow(28, 'Total expenses (Line 28)', data.totals.total_expenses, { emphasize: true, color: RED })
  c.y -= 14

  // ── Net profit / loss ────────────────────────────────────────────────────
  c = ensureSpace(doc, c, 40)
  c.page.drawLine({ start: { x: MARGIN, y: c.y }, end: { x: PAGE_WIDTH - MARGIN, y: c.y }, thickness: 1, color: LINE })
  c.y -= 20
  const netColor = data.totals.net_profit >= 0 ? GREEN : RED
  const netLabel = data.totals.net_profit >= 0 ? 'Line 31 — Net profit' : 'Line 31 — Net loss'
  drawLineRow(31, netLabel, data.totals.net_profit, { emphasize: true, color: netColor })
  c.y -= 4
  c.page.drawText('Flows to Form 1040, Schedule 1, Line 3.', { x: colLabel, y: c.y, size: 8.5, font: regular, color: MUTED })

  // ── Unmapped accounts note ───────────────────────────────────────────────
  if (data.unmapped.length > 0) {
    c.y -= 24
    c = ensureSpace(doc, c, 40)
    c.page.drawText(
      `${data.unmapped.length} account${data.unmapped.length === 1 ? '' : 's'} not yet mapped to a Schedule C line — excluded from the totals above. Assign them in Chart of Accounts.`,
      { x: MARGIN, y: c.y, size: 8.5, font: regular, color: MUTED, maxWidth: PAGE_WIDTH - MARGIN * 2 }
    )
  }

  return doc.save()
}

export function downloadScheduleCPdf(bytes: Uint8Array, year: number): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `schedule-c-${year}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
