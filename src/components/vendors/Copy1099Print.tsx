// PATH: src/components/vendors/Copy1099Print.tsx
//
// 1099 Fase 5 — Copy B (recipient statement) imprimible. Patrón InvoicePrint:
// div oculto + window.print(). No es el formulario rojo oficial Copy A (ese va
// por e-file); es el statement que se le entrega/envía al contratista, con
// todas las cajas requeridas del 1099-NEC.

import { useEffect, useRef } from 'react'
import type { Recipient1099 } from '../../services/tax1099.service'
import { formatCurrency } from '../../lib/currency'

const fmt = (n: number) => formatCurrency(n)

function Party({ title, name, tin, line1, city, state, zip }: {
  title: string; name: string | null; tin: string | null
  line1: string | null; city: string | null; state: string | null; zip: string | null
}) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{name ?? '—'}</div>
      {(line1 || city) && (
        <div style={{ fontSize: 11.5, color: '#374151', marginTop: 2 }}>
          {line1}{line1 ? <br /> : null}
          {[city, state, zip].filter(Boolean).join(', ')}
        </div>
      )}
      {tin && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>TIN: {tin}</div>}
    </div>
  )
}

export default function Copy1099Print({ data, onClose }: { data: Recipient1099; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => { window.print(); onClose() }, 300)
    return () => clearTimeout(t)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        @media print {
          body > *:not(#lp-1099-print) { display: none !important; }
          #lp-1099-print { display: block !important; }
          @page { margin: 18mm; size: letter; }
        }
        @media screen { #lp-1099-print { display: none; } }
      `}</style>

      <div id="lp-1099-print" ref={ref} style={{
        fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111827', fontSize: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Form 1099-NEC</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Nonemployee Compensation · {data.tax_year}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#9ca3af' }}>
            Copy B — For Recipient<br />Recipient statement
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 24 }}>
          <Party title="Payer" name={data.payer.name} tin={data.payer.tin}
                 line1={data.payer.address_line1} city={data.payer.city} state={data.payer.state} zip={data.payer.postal_code} />
          <Party title="Recipient" name={data.recipient.legal_name} tin={data.recipient.tin}
                 line1={data.recipient.address_line1} city={data.recipient.city} state={data.recipient.state} zip={data.recipient.postal_code} />
        </div>

        {/* Boxes */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #d1d5db', padding: '10px 12px', width: '70%' }}>
                <div style={{ fontSize: 10, color: '#6b7280' }}>Box 1 — Nonemployee compensation</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{fmt(Number(data.box1))}</div>
              </td>
              <td style={{ border: '1px solid #d1d5db', padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: '#6b7280' }}>Box 4 — Federal tax withheld</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                  {data.backup_withholding ? '(backup)' : fmt(0)}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 20, fontSize: 10, color: '#6b7280', lineHeight: 1.5 }}>
          This is important tax information and is being furnished to the recipient. If you are
          required to file a return, a negligence penalty or other sanction may be imposed on you
          if this income is taxable and the IRS determines that it has not been reported.
        </div>
        <div style={{ marginTop: 10, fontSize: 9, color: '#9ca3af' }}>
          Prepared with LedgiProof · Copy A is filed electronically with the IRS.
        </div>
      </div>
    </>
  )
}
