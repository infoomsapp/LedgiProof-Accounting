// PATH: src/components/vendors/AddVendorDialog.tsx
//
// 1099 Fase 1 — Alta/edición de un vendor (payee) con atributos 1099.
// La elegibilidad 1099 se sugiere desde la clasificación fiscal (corps exentos
// salvo abogado) y el humano puede forzarla.

import { useState, useEffect } from 'react'
import Modal  from '../ui/modal'
import Button from '../ui/Button'
import { useCreateVendor, useUpdateVendor, type Vendor } from '../../hooks/useVendors'
import { suggested1099Eligibility, type VendorTaxClassification } from '../../services/vendor.service'
import { requestW9 } from '../../services/w9.service'

interface Props {
  open:      boolean
  onClose:   () => void
  orgId:     string
  clientId?: string | null
  /** Presente para editar; ausente para crear. */
  vendor?:   Vendor | null
  onSaved?:  (vendor: Vendor) => void
}

const CLASSIFICATIONS: Array<{ value: VendorTaxClassification; label: string }> = [
  { value: 'individual',   label: 'Individual' },
  { value: 'sole_prop',    label: 'Sole proprietor' },
  { value: 'partnership',  label: 'Partnership' },
  { value: 'llc',          label: 'LLC (non-corp)' },
  { value: 'c_corp',       label: 'C-Corporation' },
  { value: 's_corp',       label: 'S-Corporation' },
  { value: 'trust_estate', label: 'Trust / Estate' },
  { value: 'other',        label: 'Other' }
]

const BOXES = [
  { value: '',        label: '— Auto —' },
  { value: 'NEC-1',   label: '1099-NEC Box 1 · Nonemployee compensation' },
  { value: 'MISC-1',  label: '1099-MISC Box 1 · Rents' },
  { value: 'MISC-2',  label: '1099-MISC Box 2 · Royalties' },
  { value: 'MISC-3',  label: '1099-MISC Box 3 · Other income' },
  { value: 'MISC-6',  label: '1099-MISC Box 6 · Medical/health' },
  { value: 'MISC-10', label: '1099-MISC Box 10 · Gross proceeds to attorney' }
]

const W9_OPTIONS = [
  { value: 'missing',   label: 'Missing' },
  { value: 'requested', label: 'Requested' },
  { value: 'on_file',   label: 'On file' }
] as const

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--lp-text-muted)', fontWeight: 600, marginBottom: 4, display: 'block'
}
const rowStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 }

export default function AddVendorDialog({ open, onClose, orgId, clientId, vendor, onSaved }: Props) {
  const isEdit = !!vendor
  const create = useCreateVendor(orgId)
  const update = useUpdateVendor(orgId)

  const [legalName,   setLegalName]   = useState('')
  const [dbaName,     setDbaName]     = useState('')
  const [email,       setEmail]       = useState('')
  const [classification, setClassification] = useState<VendorTaxClassification | ''>('')
  const [isAttorney,  setIsAttorney]  = useState(false)
  const [tin,         setTin]         = useState('')
  const [tinType,     setTinType]     = useState<'ssn' | 'ein' | ''>('')
  const [w9Status,    setW9Status]    = useState<'missing' | 'requested' | 'on_file'>('missing')
  const [box,         setBox]         = useState('')
  const [eligibleOverride, setEligibleOverride] = useState<boolean | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [w9Link,      setW9Link]      = useState<string | null>(null)
  const [w9Busy,      setW9Busy]      = useState(false)
  const [copied,      setCopied]      = useState(false)

  // Reset from props on open
  useEffect(() => {
    if (!open) return
    setLegalName(vendor?.legal_name ?? '')
    setDbaName(vendor?.dba_name ?? '')
    setEmail(vendor?.email ?? '')
    setClassification((vendor?.tax_classification as VendorTaxClassification) ?? '')
    setIsAttorney(vendor?.is_attorney ?? false)
    setTin(vendor?.tin ?? '')
    setTinType((vendor?.tin_type as 'ssn' | 'ein') ?? '')
    setW9Status((vendor?.w9_status as any) ?? 'missing')
    setBox(vendor?.default_1099_box ?? '')
    setEligibleOverride(null)
    setError(null)
    setW9Link(null)
    setCopied(false)
  }, [open, vendor])

  async function handleRequestW9() {
    if (!vendor) return
    setW9Busy(true); setError(null)
    try {
      const { url } = await requestW9(vendor.id)
      setW9Link(url)
      try { await navigator.clipboard.writeText(url); setCopied(true) } catch { /* clipboard optional */ }
    } catch (e: any) {
      setError(e?.message ?? 'Could not generate the W-9 link.')
    } finally {
      setW9Busy(false)
    }
  }

  const suggestedEligible = suggested1099Eligibility(classification || null, isAttorney)
  const effectiveEligible = eligibleOverride ?? suggestedEligible

  async function handleSave() {
    if (!legalName.trim()) { setError('Legal name is required.'); return }
    setError(null)
    try {
      const base = {
        legal_name:         legalName.trim(),
        dba_name:           dbaName.trim() || null,
        email:              email.trim() || null,
        is_attorney:        isAttorney,
        is_1099_eligible:   effectiveEligible,
        w9_status:          w9Status,
        ...(classification ? { tax_classification: classification } : { tax_classification: null }),
        ...(tin.trim() ? { tin: tin.trim() } : { tin: null }),
        ...(tinType ? { tin_type: tinType } : { tin_type: null }),
        ...(box ? { default_1099_box: box } : { default_1099_box: null })
      }
      let saved: Vendor
      if (isEdit && vendor) {
        saved = await update.mutateAsync({ id: vendor.id, patch: base })
      } else {
        saved = await create.mutateAsync({
          org_id: orgId,
          ...(clientId ? { client_id: clientId } : {}),
          ...base
        })
      }
      onSaved?.(saved)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Could not save vendor.')
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit vendor' : 'New vendor'}
      subtitle="Payee for 1099 reporting. Corps are exempt unless attorney fees."
      width={560}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create vendor'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={rowStyle}>
          <label style={labelStyle}>Legal name *</label>
          <input className="lp-input" value={legalName} onChange={e => setLegalName(e.target.value)}
                 placeholder="e.g. Acme Consulting LLC" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={rowStyle}>
            <label style={labelStyle}>DBA (optional)</label>
            <input className="lp-input" value={dbaName} onChange={e => setDbaName(e.target.value)} />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>Email</label>
            <input className="lp-input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={rowStyle}>
            <label style={labelStyle}>Tax classification</label>
            <select className="lp-input" value={classification}
                    onChange={e => { setClassification(e.target.value as VendorTaxClassification); setEligibleOverride(null) }}>
              <option value="">— Unknown —</option>
              {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>W-9 status</label>
            <select className="lp-input" value={w9Status} onChange={e => setW9Status(e.target.value as any)}>
              {W9_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div style={rowStyle}>
            <label style={labelStyle}>TIN (SSN/EIN)</label>
            <input className="lp-input" value={tin} onChange={e => setTin(e.target.value)}
                   placeholder={vendor?.tin_last4 ? `On file ••••${vendor.tin_last4} — type to replace` : '123-45-6789 / 12-3456789'} />
            {vendor?.tin_last4 && !tin && (
              <span style={{ fontSize: 11, color: 'var(--sem-green)', marginTop: 2 }}>
                ✓ Encrypted TIN on file (••••{vendor.tin_last4})
              </span>
            )}
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>TIN type</label>
            <select className="lp-input" value={tinType} onChange={e => setTinType(e.target.value as any)}>
              <option value="">—</option>
              <option value="ssn">SSN</option>
              <option value="ein">EIN</option>
            </select>
          </div>
        </div>

        <div style={rowStyle}>
          <label style={labelStyle}>Default 1099 box</label>
          <select className="lp-input" value={box} onChange={e => setBox(e.target.value)}>
            {BOXES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--lp-text)' }}>
          <input type="checkbox" checked={isAttorney}
                 onChange={e => { setIsAttorney(e.target.checked); setEligibleOverride(null) }} />
          This vendor is an attorney (legal fees are always reportable)
        </label>

        {/* Request W-9 — solo en edición (necesita un vendor existente) */}
        {isEdit && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: 'var(--lp-text)' }}>
                Need the vendor's TIN? Send them a secure W-9 link.
              </span>
              <button type="button" className="lp-btn lp-btn-ghost" style={{ fontSize: 11 }}
                      onClick={handleRequestW9} disabled={w9Busy}>
                {w9Busy ? '…' : 'Request W-9'}
              </button>
            </div>
            {w9Link && (
              <div style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11, color: 'var(--lp-text-muted)'
              }}>
                <input className="lp-input" readOnly value={w9Link} style={{ flex: 1, fontSize: 11 }} />
                <button type="button" className="lp-btn lp-btn-ghost" style={{ fontSize: 11 }}
                        onClick={() => { navigator.clipboard?.writeText(w9Link); setCopied(true) }}>
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Elegibilidad sugerida + override */}
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)',
          fontSize: 12.5, color: 'var(--lp-text)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>
              1099 eligible:{' '}
              <strong style={{ color: effectiveEligible ? 'var(--sem-green)' : 'var(--lp-text-muted)' }}>
                {effectiveEligible ? 'Yes' : 'No'}
              </strong>
              {eligibleOverride === null && (
                <span style={{ color: 'var(--lp-text-muted)' }}> · suggested from classification</span>
              )}
            </span>
            <button type="button" className="lp-btn lp-btn-ghost" style={{ fontSize: 11 }}
                    onClick={() => setEligibleOverride(!effectiveEligible)}>
              Override → {effectiveEligible ? 'No' : 'Yes'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--sem-red-bg)', color: 'var(--sem-red)', fontSize: 12.5
          }}>
            ⚠ {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
