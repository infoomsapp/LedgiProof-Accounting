// PATH: src/components/pyme/PymeClientEditDialog.tsx
//
// P4 Fase 2.D — Edit dialog for PYME-owned billing clients.
//
// Audience: pyme_owner / pyme_staff (NOT bookkeeper).
// What this CAN edit:
//   · display_name, company_name (the customer's identity)
//   · email, phone (contact info)
//   · tax_id (EIN / RFC / VAT)
//   · address_line1, city, state, postal_code, country
//   · default_currency, payment_terms
//
// What this CANNOT edit (intentionally):
//   · primary_user_id — that's the bookkeeper's portal invite responsibility
//   · is_active — handled separately via the deactivate flow
//   · notes — kept simple for this sprint; can be re-added if needed

import { useState, useEffect } from 'react'
import Modal from '../ui/modal'
import Button from '../ui/Button'
import { updateClient } from '../../services/invoice.service'
import type { Client } from '../../types/database.types'

interface Props {
  open:     boolean
  client:   Client | null
  onClose:  () => void
  onSaved?: (updated: Client) => void
}

export default function PymeClientEditDialog({ open, client, onClose, onSaved }: Props) {
  // Form state
  const [displayName,  setDisplayName]  = useState('')
  const [companyName,  setCompanyName]  = useState('')
  const [email,        setEmail]        = useState('')
  const [phone,        setPhone]        = useState('')
  const [taxId,        setTaxId]        = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [city,         setCity]         = useState('')
  const [state,        setState]        = useState('')
  const [postalCode,   setPostalCode]   = useState('')
  const [country,      setCountry]      = useState('US')
  const [currency,     setCurrency]     = useState('USD')
  const [paymentTerms, setPaymentTerms] = useState(30)

  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset form whenever the dialog opens with a new client
  useEffect(() => {
    if (!open || !client) return
    setDisplayName (client.display_name)
    setCompanyName (client.company_name  ?? '')
    setEmail       (client.email         ?? '')
    setPhone       (client.phone         ?? '')
    setTaxId       (client.tax_id        ?? '')
    setAddressLine1(client.address_line1 ?? '')
    setCity        (client.city          ?? '')
    setState       (client.state         ?? '')
    setPostalCode  (client.postal_code   ?? '')
    setCountry     (client.country       ?? 'US')
    setCurrency    (client.default_currency ?? 'USD')
    setPaymentTerms(client.payment_terms ?? 30)
    setSaveError(null)
  }, [open, client])

  async function handleSave() {
    if (!client) return
    if (!displayName.trim()) {
      setSaveError('Client name is required')
      return
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setSaveError('Invalid email format')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateClient(client.id, {
        display_name:     displayName.trim(),
        company_name:     companyName.trim()  || null,
        email:            email.trim()        || null,
        phone:            phone.trim()        || null,
        tax_id:           taxId.trim()        || null,
        address_line1:    addressLine1.trim() || null,
        city:             city.trim()         || null,
        state:            state.trim()        || null,
        postal_code:      postalCode.trim()   || null,
        country:          country.trim()      || 'US',
        default_currency: currency.trim()     || 'USD',
        payment_terms:    Number.isFinite(paymentTerms) ? paymentTerms : 30
      }, client.org_id)
      onSaved?.(updated)
      onClose()
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  if (!client) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${client.display_name}`}
      subtitle="Update contact info, address, or billing defaults"
      width={560}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            disabled={saving || !displayName.trim()}
          >
            Save changes
          </Button>
        </div>
      }
    >
      {saveError && (
        <div style={{
          padding: '8px 12px',
          background: 'var(--sem-red-bg)',
          border: '0.5px solid var(--sem-red)',
          borderRadius: 7,
          color: 'var(--sem-red)',
          fontSize: 12.5,
          marginBottom: 14
        }}>
          ⚠ {saveError}
        </div>
      )}

      <SectionTitle>Identity</SectionTitle>

      <Field label="Display name" required>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          className="lp-input"
          style={{ width: '100%' }}
          disabled={saving}
          maxLength={120}
        />
      </Field>

      <Field label="Legal company name">
        <input
          type="text"
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          className="lp-input"
          style={{ width: '100%' }}
          disabled={saving}
          maxLength={200}
        />
      </Field>

      <Field label="Tax ID / EIN">
        <input
          type="text"
          value={taxId}
          onChange={e => setTaxId(e.target.value)}
          className="lp-input"
          style={{ width: '100%' }}
          disabled={saving}
          maxLength={40}
        />
      </Field>

      <SectionTitle>Contact</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
            maxLength={120}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
            maxLength={40}
          />
        </Field>
      </div>

      <SectionTitle>Address</SectionTitle>

      <Field label="Street address">
        <input
          type="text"
          value={addressLine1}
          onChange={e => setAddressLine1(e.target.value)}
          className="lp-input"
          style={{ width: '100%' }}
          disabled={saving}
          maxLength={200}
        />
      </Field>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr',
        gap: 12
      }}>
        <Field label="City">
          <input
            type="text"
            value={city}
            onChange={e => setCity(e.target.value)}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
            maxLength={80}
          />
        </Field>
        <Field label="State">
          <input
            type="text"
            value={state}
            onChange={e => setState(e.target.value)}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
            maxLength={40}
          />
        </Field>
        <Field label="ZIP">
          <input
            type="text"
            value={postalCode}
            onChange={e => setPostalCode(e.target.value)}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
            maxLength={20}
          />
        </Field>
      </div>

      <SectionTitle>Billing defaults</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="Country">
          <input
            type="text"
            value={country}
            onChange={e => setCountry(e.target.value.toUpperCase().slice(0, 2))}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
            maxLength={2}
          />
        </Field>
        <Field label="Currency">
          <input
            type="text"
            value={currency}
            onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
            maxLength={3}
          />
        </Field>
        <Field label="Payment terms (days)">
          <input
            type="number"
            value={paymentTerms}
            onChange={e => setPaymentTerms(parseInt(e.target.value, 10) || 0)}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
            min={0}
            max={365}
          />
        </Field>
      </div>
    </Modal>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 10.5,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--lp-text-muted)',
      margin: '4px 0 10px 0'
    }}>
      {children}
    </h3>
  )
}

function Field({
  label, required, children
}: {
  label:    string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'block',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--lp-text-muted)',
        marginBottom: 4
      }}>
        {label}
        {required && <span style={{ color: 'var(--sem-red)', marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  )
}