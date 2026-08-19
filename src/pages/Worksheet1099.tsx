// PATH: src/pages/Worksheet1099.tsx
//
// 1099 Fase 3 — Worksheet 1099 por vendor/año. Muestra el DTO ya computado por
// el RPC (la UI no suma nada). Semáforo de readiness: verde = listo para
// imprimir; rojo = falta algo (W-9, tx sin verificar). El PDF (Copy B) y el
// export a e-file son la Fase 5.

import { useState } from 'react'
import { useAuthStore } from '../store/auth.store'
import { use1099Worksheet } from '../hooks/use1099Worksheet'
import {
  get1099Recipient, build1099EfileCsv,
  type Worksheet1099Row, type Worksheet1099Reason, type Recipient1099
} from '../services/tax1099.service'
import Copy1099Print from '../components/vendors/Copy1099Print'
import { formatCurrency } from '../lib/currency'

const fmtUsd = (n: number) => formatCurrency(n)

const REASON_LABEL: Record<Worksheet1099Reason, string> = {
  missing_w9:              'W-9 / TIN missing',
  unverified_transactions: 'Has unverified transactions',
  unknown_payment_method:  'Unknown payment method',
  below_threshold:         'Below $600'
}

function ReadinessBadge({ row }: { row: Worksheet1099Row }) {
  const map = {
    ready:           { bg: 'rgba(34,197,94,0.10)',  color: 'var(--sem-green)', label: '✓ Ready to print' },
    blocked:         { bg: 'var(--sem-red-bg)',      color: 'var(--sem-red)',   label: '● Blocked' },
    below_threshold: { bg: 'var(--lp-surface-2)',    color: 'var(--lp-text-muted)', label: 'Below $600' },
    not_1099:        { bg: 'var(--lp-surface-2)',    color: 'var(--lp-text-muted)', label: 'Not 1099' }
  }[row.readiness]
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 100,
      background: map.bg, color: map.color, whiteSpace: 'nowrap'
    }}>
      {map.label}
    </span>
  )
}

export default function Worksheet1099() {
  const { membership } = useAuthStore()
  const orgId = membership?.org_id ?? ''
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const q = use1099Worksheet(orgId, year)
  const rows = q.data ?? []

  const [printData, setPrintData] = useState<Recipient1099 | null>(null)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [exportErr, setExportErr] = useState<string | null>(null)

  async function printCopyB(vendorId: string) {
    setBusy(vendorId); setExportErr(null)
    try {
      const data = await get1099Recipient(vendorId, year)
      setPrintData(data)
    } catch (e: any) {
      setExportErr(e?.message ?? 'Could not load 1099 data.')
    } finally {
      setBusy(null)
    }
  }

  async function exportCsv() {
    setBusy('__csv__'); setExportErr(null)
    try {
      const ready = rows.filter(r => r.readiness === 'ready')
      const recipients = await Promise.all(ready.map(r => get1099Recipient(r.vendor_id, year)))
      const csv = build1099EfileCsv(year, recipients)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `1099-efile-${year}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setExportErr(e?.message ?? 'Export failed.')
    } finally {
      setBusy(null)
    }
  }

  const readyCount   = rows.filter(r => r.readiness === 'ready').length
  const blockedCount = rows.filter(r => r.readiness === 'blocked').length
  const totalBox1    = rows.filter(r => r.readiness === 'ready').reduce((s, r) => s + Number(r.box1), 0)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 className="lp-page-title" style={{ margin: 0 }}>1099 Worksheet</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="lp-btn lp-btn-ghost" onClick={exportCsv}
                  disabled={busy === '__csv__' || readyCount === 0} style={{ fontSize: 12 }}>
            {busy === '__csv__' ? 'Exporting…' : '⬇ Export e-file CSV'}
          </button>
          <select className="lp-input" value={year} onChange={e => setYear(Number(e.target.value))}
                  style={{ width: 100 }}>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {exportErr && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: 'var(--sem-red-bg)', color: 'var(--sem-red)', fontSize: 12.5
        }}>⚠ {exportErr}</div>
      )}
      <p className="lp-page-sub" style={{ margin: '0 0 18px 0' }}>
        Reportable payments per vendor for {year}. Card / third-party payments are excluded
        (the processor reports those on 1099-K). Only verified (blue) transactions count.
      </p>

      {/* Resumen */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Ready to print', value: String(readyCount), color: 'var(--sem-green)' },
          { label: 'Blocked',        value: String(blockedCount), color: 'var(--sem-red)' },
          { label: 'Total Box 1 (ready)', value: fmtUsd(totalBox1), color: 'var(--lp-text)' }
        ].map(k => (
          <div key={k.label} className="lp-card" style={{ flex: 1, padding: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {q.isLoading && <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>Loading worksheet…</div>}

      {!q.isLoading && rows.length === 0 && (
        <div style={{
          padding: 28, textAlign: 'center', borderRadius: 12,
          border: '0.5px dashed var(--lp-border)', color: 'var(--lp-text-muted)', fontSize: 13
        }}>
          No vendor payments recorded for {year} yet. Assign payees to transactions and they'll show up here.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ border: '0.5px solid var(--lp-border)', borderRadius: 12, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <div key={r.vendor_id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              background: 'var(--lp-surface)',
              borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)' }}>
                  {r.legal_name}
                  {r.default_1099_box && (
                    <span style={{ color: 'var(--lp-text-muted)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                      Box {r.default_1099_box}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 3 }}>
                  {r.reportable_count} reportable · {r.excluded_count} excluded
                  {r.unverified_count > 0 && ` · ${r.unverified_count} unverified`}
                  {r.reasons.length > 0 && (
                    <span style={{ color: 'var(--sem-red)' }}>
                      {' · '}{r.reasons.map(x => REASON_LABEL[x]).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--lp-text)', fontFamily: 'monospace' }}>
                {fmtUsd(Number(r.box1))}
              </div>
              {r.readiness === 'ready' && (
                <button className="lp-btn lp-btn-ghost" style={{ fontSize: 11 }}
                        onClick={() => printCopyB(r.vendor_id)} disabled={busy === r.vendor_id}>
                  {busy === r.vendor_id ? '…' : 'Print Copy B'}
                </button>
              )}
              <ReadinessBadge row={r} />
            </div>
          ))}
        </div>
      )}

      {printData && <Copy1099Print data={printData} onClose={() => setPrintData(null)} />}
    </div>
  )
}
