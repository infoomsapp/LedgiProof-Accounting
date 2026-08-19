// PATH: src/components/vendors/VendorAssignmentSection.tsx
//
// 1099 Fase 1 — Confirmar el payee (vendor) de una transacción, dentro del
// detalle. Al confirmar: enlaza la tx (assignVendorToTransaction) Y aprende el
// patrón merchant→vendor (learnVendorPattern), para que futuras tx similares se
// auto-asignen. Este es el disparo que hace "cobrar vida" a la automatización.

import { useState, useMemo } from 'react'
import { db } from '../../lib/supabase'
import type { Transaction, PaymentMethodType } from '../../types/database.types'
import { useVendors, useVendor } from '../../hooks/useVendors'
import { assignVendorToTransaction } from '../../services/vendor.service'
import { learnVendorPattern } from '../../services/learning.service'
import AddVendorDialog from './AddVendorDialog'

// Reportabilidad 1099 espejo de la función SQL tx_payment_reportability.
const PM_OPTIONS: Array<{ v: PaymentMethodType; label: string }> = [
  { v: 'ach',                 label: 'ACH / bank transfer' },
  { v: 'check',               label: 'Check' },
  { v: 'cash',                label: 'Cash' },
  { v: 'wire',                label: 'Wire' },
  { v: 'other_bank',          label: 'Other bank' },
  { v: 'card',                label: 'Credit/debit card' },
  { v: 'third_party_network', label: 'PayPal / third-party' },
  { v: 'unknown',             label: 'Unknown' }
]
function reportability(pm: PaymentMethodType): { label: string; color: string } {
  if (pm === 'card' || pm === 'third_party_network')
    return { label: 'Excluded (1099-K)', color: 'var(--lp-text-muted)' }
  if (pm === 'unknown')
    return { label: 'Needs review', color: 'var(--sem-amber)' }
  return { label: 'Reportable', color: 'var(--sem-green)' }
}

interface Props {
  transaction: Transaction
  orgId:       string
  onAssigned?: (vendorId: string | null) => void
}

export default function VendorAssignmentSection({ transaction: tx, orgId, onAssigned }: Props) {
  const clientId = (tx as any).client_id ?? null
  const vendorsQ = useVendors(orgId, { clientId: clientId ?? undefined })
  const currentQ = useVendor(tx.vendor_id ?? undefined)

  const [search,   setSearch]   = useState('')
  const [picked,   setPicked]   = useState<string | null>(null)
  const [addOpen,  setAddOpen]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [pm, setPm]             = useState<PaymentMethodType>(tx.payment_method)

  const vendors = vendorsQ.data ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vendors.slice(0, 8)
    return vendors.filter(v =>
      [v.legal_name, v.dba_name ?? '', v.email ?? ''].join(' ').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [vendors, search])

  const current = currentQ.data ?? null

  async function confirm(vendorId: string) {
    setSaving(true); setError(null); setSavedMsg(null)
    try {
      await assignVendorToTransaction(tx.id, vendorId)
      // Aprender el patrón (no fatal si falla).
      await learnVendorPattern({ orgId, transaction: tx, vendorId })
      setSavedMsg('Payee confirmed — future similar transactions will auto-assign.')
      setPicked(null); setSearch('')
      onAssigned?.(vendorId)
    } catch (e: any) {
      setError(e?.message ?? 'Could not assign vendor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 8
      }}>
        Payee (1099 vendor)
      </div>

      {/* Estado actual */}
      {current ? (
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)',
          marginBottom: 10
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
            {current.legal_name}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
            {current.is_1099_eligible ? '1099 eligible' : 'Not 1099 eligible'}
            {' · W-9 '}{current.w9_status}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginBottom: 10 }}>
          No payee assigned yet.
        </div>
      )}

      {/* Buscador */}
      <input
        className="lp-input"
        placeholder="Search vendors to assign as payee…"
        value={search}
        onChange={e => { setSearch(e.target.value); setPicked(null) }}
      />

      {(search || filtered.length > 0) && (
        <div style={{
          marginTop: 6, border: '0.5px solid var(--lp-border)', borderRadius: 8, overflow: 'hidden'
        }}>
          {filtered.map(v => (
            <button
              key={v.id}
              onClick={() => setPicked(v.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', textAlign: 'left', gap: 8,
                padding: '8px 12px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
                background: picked === v.id ? 'var(--chat-row-hover)' : 'transparent',
                border: 'none', borderBottom: '0.5px solid var(--lp-border)',
                color: 'var(--lp-text)'
              }}
            >
              <span>{v.legal_name}{v.dba_name ? ` · ${v.dba_name}` : ''}</span>
              {picked === v.id && (
                <span
                  onClick={(e) => { e.stopPropagation(); if (!saving) confirm(v.id) }}
                  className="lp-btn lp-btn-primary"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  {saving ? '…' : 'Confirm'}
                </span>
              )}
            </button>
          ))}
          {search && filtered.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--lp-text-muted)' }}>
              No vendors match.
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="lp-btn lp-btn-ghost"
        style={{ fontSize: 12, marginTop: 8 }}
        onClick={() => setAddOpen(true)}
      >
        ＋ New vendor
      </button>

      {savedMsg && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 7,
          background: 'rgba(34,197,94,0.07)', border: '0.5px solid rgba(34,197,94,0.25)',
          color: 'var(--sem-green)', fontSize: 12
        }}>
          ✓ {savedMsg}
        </div>
      )}
      {error && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 7,
          background: 'var(--sem-red-bg)', color: 'var(--sem-red)', fontSize: 12
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Método de pago → reportabilidad 1099 */}
      <div style={{ marginTop: 16 }}>
        <div style={{
          fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 8
        }}>
          Payment method (1099)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="lp-input"
            value={pm}
            style={{ flex: 1 }}
            onChange={async (e) => {
              const next = e.target.value as PaymentMethodType
              setPm(next)
              try { await db.from('transactions').update({ payment_method: next }).eq('id', tx.id) }
              catch { /* non-fatal */ }
            }}
          >
            {PM_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 100,
            color: reportability(pm).color, background: 'var(--lp-surface-2)', whiteSpace: 'nowrap'
          }}>
            {reportability(pm).label}
          </span>
        </div>
      </div>

      <AddVendorDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        orgId={orgId}
        clientId={clientId}
        onSaved={(v) => { setAddOpen(false); confirm(v.id) }}
      />
    </div>
  )
}
