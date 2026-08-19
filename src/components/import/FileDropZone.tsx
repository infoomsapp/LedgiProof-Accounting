// PATH: src/components/import/FileDropZone.tsx
//
// P-Import-Data — Drop zone for CSV/Excel, with clipboard paste option.

import { useState, useRef } from 'react'
import {
  parseFile,
  parsePaste,
  detectFileType,
  type ParseResult
} from '../../lib/csv-parser'

interface Props {
  onParsed: (sheet: ParseResult, sourceLabel: string) => void
  /** Optional: callback for errors */
  onError?: (msg: string) => void
}

export default function FileDropZone({ onParsed, onError }: Props) {
  const [dragOver,  setDragOver]  = useState(false)
  const [parsing,   setParsing]   = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  function reportError(msg: string) {
    if (onError) onError(msg)
    else alert(msg)
  }

  async function handleFile(file: File) {
    setParsing(true)
    try {
      const kind = detectFileType(file)
      if (kind === 'unknown') {
        reportError(`Unsupported file type: ${file.name}. Use CSV or Excel.`)
        return
      }
      const sheet = await parseFile(file)
      if (sheet.headers.length === 0) {
        reportError('No headers detected in this file.')
        return
      }
      onParsed(sheet, file.name)
    } catch (e: any) {
      reportError(e?.message ?? 'Could not parse file')
    } finally {
      setParsing(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function handleClipboardSubmit() {
    if (!pasteText.trim()) return
    setParsing(true)
    try {
      const sheet = parsePaste(pasteText)
      if (sheet.headers.length === 0) {
        reportError('No headers detected in pasted text.')
        return
      }
      onParsed(sheet, '(pasted from clipboard)')
      setPasteOpen(false)
      setPasteText('')
    } catch (e: any) {
      reportError(e?.message ?? 'Could not parse pasted text')
    } finally {
      setParsing(false)
    }
  }

  return (
    <div>
      {!pasteOpen ? (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--lp-accent)' : 'var(--lp-border)'}`,
              borderRadius: 12,
              padding: '32px 24px',
              textAlign: 'center',
              background: dragOver ? 'var(--chat-bubble-mine-bg)' : 'var(--lp-surface)',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>📥</div>
            <div style={{
              fontSize: 14, fontWeight: 600,
              color: 'var(--lp-text)', marginBottom: 4
            }}>
              {parsing ? 'Parsing…' : 'Drop a CSV or Excel file here'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
              Or click to browse files (.csv, .xlsx, .xls)
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.tsv,.txt,text/csv"
            onChange={onSelect}
            style={{ display: 'none' }}
          />

          <div style={{ textAlign: 'center', margin: '12px 0' }}>
            <button
              onClick={() => setPasteOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--lp-accent)',
                fontSize: 12,
                fontFamily: 'inherit',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Or paste data from clipboard (Excel / Google Sheets)
            </button>
          </div>
        </>
      ) : (
        <div style={{
          padding: 16,
          background: 'var(--lp-surface)',
          border: '0.5px solid var(--lp-border)',
          borderRadius: 10
        }}>
          <div style={{ fontSize: 12.5, color: 'var(--lp-text)', marginBottom: 8 }}>
            Paste your data below (tab or comma-separated):
          </div>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste here..."
            autoFocus
            style={{
              width: '100%',
              minHeight: 160,
              padding: 10,
              fontFamily: 'monospace',
              fontSize: 12,
              background: 'var(--lp-surface-2)',
              color: 'var(--lp-text)',
              border: '0.5px solid var(--lp-border)',
              borderRadius: 7,
              resize: 'vertical'
            }}
          />
          <div style={{
            display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end'
          }}>
            <button
              onClick={() => { setPasteOpen(false); setPasteText('') }}
              style={{
                background: 'transparent',
                border: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text-muted)',
                borderRadius: 7,
                padding: '6px 12px',
                fontSize: 12,
                fontFamily: 'inherit',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleClipboardSubmit}
              disabled={!pasteText.trim() || parsing}
              style={{
                background: pasteText.trim() ? 'var(--lp-accent)' : 'var(--lp-surface-2)',
                border: 'none',
                color: pasteText.trim() ? '#fff' : 'var(--lp-text-muted)',
                borderRadius: 7,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: pasteText.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              {parsing ? 'Parsing…' : 'Parse'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}