// PATH: src/pages/Vendors.tsx
//
// 1099 Fase 1 — Gestión de vendors (payees). Lista + alta/edición con atributos
// 1099. El semáforo de "readiness" 1099 por vendor (falta W-9, no elegible) se
// muestra inline como pista temprana para el preparer.

import { useState } from 'react'
import { useAuthStore } from '../store/auth.store'
import { useVendors, type Vendor } from '../hooks/useVendors'
import AddVendorDialog from '../components/vendors/AddVendorDialog'

function W9Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    on_file:   { bg: 'rgba(34,197,94,0.10)', color: 'var(--sem-green)', label: 'W-9 on file' },
    requested: { bg: 'rgba(245,158,11,0.10)', color: 'var(--sem-amber)', label: 'W-9 requested' },
    missing:   { bg: 'var(--sem-red-bg)',     color: 'var(--sem-red)',   label: 'W-9 missing' }
  }
  const m = map[status] ?? map.missing
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
      background: m!.bg, color: m!.color
    }}>
      {m!.label}
    </span>
  )
}

export default function Vendors() {
  const { membership } = useAuthStore()
  const orgId = membership?.org_id ?? ''
  const vendorsQ = useVendors(orgId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing,    setEditing]    = useState<Vendor | null>(null)

  const vendors = vendorsQ.data ?? []

  function openNew()  { setEditing(null); setDialogOpen(true) }
  function openEdit(v: Vendor) { setEditing(v); setDialogOpen(true) }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 className="lp-page-title" style={{ margin: 0 }}>Vendors</h1>
        <button className="lp-btn lp-btn-primary" onClick={openNew}>＋ New vendor</button>
      </div>
      <p className="lp-page-sub" style={{ margin: '0 0 20px 0' }}>
        Payees you may need to issue a 1099 to. Collect a W-9 for each eligible vendor;
        corporations are exempt unless the payment is attorney fees.
      </p>

      {vendorsQ.isLoading && (
        <div style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>Loading vendors…</div>
      )}

      {!vendorsQ.isLoading && vendors.length === 0 && (
        <div style={{
          padding: '28px', textAlign: 'center', borderRadius: 12,
          border: '0.5px dashed var(--lp-border)', color: 'var(--lp-text-muted)', fontSize: 13
        }}>
          No vendors yet. Add one, or confirm a payee from a transaction and it'll be learned here.
        </div>
      )}

      {vendors.length > 0 && (
        <div style={{
          border: '0.5px solid var(--lp-border)', borderRadius: 12, overflow: 'hidden'
        }}>
          {vendors.map((v, i) => (
            <button
              key={v.id}
              onClick={() => openEdit(v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                padding: '14px 16px', background: 'var(--lp-surface)', border: 'none',
                borderTop: i === 0 ? 'none' : '0.5px solid var(--lp-border)',
                cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)' }}>
                  {v.legal_name}
                  {v.dba_name && (
                    <span style={{ color: 'var(--lp-text-muted)', fontWeight: 400, marginLeft: 8 }}>
                      · {v.dba_name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', marginTop: 3 }}>
                  {v.tax_classification ?? 'Classification unknown'}
                  {v.default_1099_box ? ` · Box ${v.default_1099_box}` : ''}
                </div>
              </div>

              {!v.is_1099_eligible && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                  background: 'var(--lp-surface-2)', color: 'var(--lp-text-muted)'
                }}>
                  Not 1099
                </span>
              )}
              {v.is_1099_eligible && <W9Badge status={v.w9_status} />}
              <span style={{ color: 'var(--lp-text-muted)', fontSize: 18 }}>›</span>
            </button>
          ))}
        </div>
      )}

      <AddVendorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        orgId={orgId}
        vendor={editing}
        onSaved={() => setDialogOpen(false)}
      />
    </div>
  )
}
