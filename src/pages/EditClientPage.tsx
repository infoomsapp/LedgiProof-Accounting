// PATH: src/pages/EditClientPage.tsx
//
// P4 Fase 2.A — Dedicated edit page for a billing client.
//
// AL's decision (memoria #18): edit cliente = página dedicada /clients/:id/edit
// (not a modal). Provides more space for the full client schema (address, tax_id,
// payment terms, currency, etc).
//
// Route: /clients/:id/edit
// Access: same as /clients (bookkeeper roles + super_admin)
//
// Features:
//   · Full editable form pre-populated from the existing client
//   · Save changes (updateClient RPC)
//   · Deactivate / Re-activate (toggles is_active)
//   · Cancel returns to /clients
//   · Shows "last updated" metadata

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import Button from '../components/ui/Button'
import SemaphoreSpinner from '../components/ui/SemaphoreSpinner'
import { db } from '../lib/supabase'
import { updateClient } from '../services/invoice.service'
import type { Client } from '../types/database.types'
import { toSafeMessage } from '../lib/errors'

export default function EditClientPage() {
  const { id }       = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const { membership } = useAuthStore()
  const orgId        = membership?.org_id ?? ''

  const [client,  setClient]  = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState(false)

  // Form fields
  const [displayName,  setDisplayName]  = useState('')
  const [companyName,  setCompanyName]  = useState('')
  const [email,        setEmail]        = useState('')
  const [phone,        setPhone]        = useState('')
  const [taxId,        setTaxId]        = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [city,         setCity]         = useState('')
  const [stateCode,    setStateCode]    = useState('')
  const [postalCode,   setPostalCode]   = useState('')
  const [currency,     setCurrency]     = useState('USD')
  const [paymentTerms, setPaymentTerms] = useState(30)
  const [notes,        setNotes]        = useState('')
  const [isActive,     setIsActive]     = useState(true)

  // ── Load client ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadClient() {
      if (!id || !orgId) return
      setLoading(true)
      setError(null)

      const { data, error: dbErr } = await db
        .from('clients')
        .select('*')
        .eq('id', id)
        .eq('org_id', orgId)  // RLS-safe scoping
        .single()

      if (dbErr) {
        setError(toSafeMessage(dbErr, 'Could not load the client'))
        setLoading(false)
        return
      }

      const c = data as Client
      setClient(c)
      setDisplayName(c.display_name ?? '')
      setCompanyName(c.company_name ?? '')
      setEmail(c.email ?? '')
      setPhone(c.phone ?? '')
      setTaxId(c.tax_id ?? '')
      setAddressLine1(c.address_line1 ?? '')
      setCity(c.city ?? '')
      setStateCode(c.state ?? '')
      setPostalCode(c.postal_code ?? '')
      setCurrency(c.default_currency ?? 'USD')
      setPaymentTerms(c.payment_terms ?? 30)
      setNotes(c.notes ?? '')
      setIsActive(c.is_active)
      setLoading(false)
    }
    loadClient()
  }, [id, orgId])

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!client) return
    if (!displayName.trim()) {
      setError('Client name is required')
      return
    }
    // Unified client record: email is how every client in the app is
    // reachable, so it can't be blanked out here either -- see
    // AddClientDialog.tsx for the matching requirement at creation.
    if (!email.trim()) {
      setError('Client email is required — this is how they get portal access.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await updateClient(client.id, {
        display_name:     displayName.trim(),
        company_name:     companyName.trim() || null,
        email:            email.trim() || null,
        phone:            phone.trim() || null,
        tax_id:           taxId.trim() || null,
        address_line1:    addressLine1.trim() || null,
        city:             city.trim() || null,
        state:            stateCode.trim() || null,
        postal_code:      postalCode.trim() || null,
        default_currency: currency,
        payment_terms:    paymentTerms,
        notes:            notes.trim() || null,
        is_active:        isActive
      }, orgId)
      setSuccess(true)
      // Reload to get fresh updated_at
      const { data } = await db.from('clients').select('*').eq('id', client.id).single()
      if (data) setClient(data as Client)
      setTimeout(() => setSuccess(false), 2500)
    } catch (e: any) {
      setError(e?.message ?? 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <SemaphoreSpinner size="md" inline />
      </div>
    )
  }

  if (!client) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
          Client not found
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginBottom: 16 }}>
          {error ?? 'This client does not exist or you don\'t have access.'}
        </div>
        <Button variant="ghost" onClick={() => navigate('/clients')}>
          ← Back to clients
        </Button>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 880, width: '100%', margin: '0 auto' }}>

      {/* Breadcrumb + back */}
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={() => navigate('/clients')}
          style={{
            background: 'none', border: 'none', padding: 0,
            color: 'var(--lp-accent)', fontSize: 12,
            cursor: 'pointer', fontFamily: 'inherit'
          }}
        >
          ← Back to clients
        </button>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="lp-page-title" style={{ margin: 0 }}>
            Edit client
          </h1>
          <p className="lp-page-sub" style={{ margin: '4px 0 0 0' }}>
            {client.display_name}
            <span style={{
              marginLeft:    10,
              fontSize:      11,
              padding:       '2px 8px',
              borderRadius:  100,
              color:         isActive ? 'var(--sem-green)' : 'var(--lp-text-muted)',
              background:    isActive ? 'var(--sem-green-bg)' : 'var(--lp-surface-2)',
              border:        `0.5px solid ${isActive ? 'var(--sem-green)' : 'var(--lp-border)'}`
            }}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => navigate('/clients')} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={saving}
            onClick={handleSave}
          >
            Save changes
          </Button>
        </div>
      </div>

      {/* Success inline */}
      {success && (
        <div style={{
          padding:      '10px 14px',
          background:   'var(--sem-green-bg)',
          border:       '0.5px solid var(--sem-green)',
          borderRadius: 8,
          color:        'var(--sem-green)',
          fontSize:     12.5,
          marginBottom: 16
        }}>
          ✓ Changes saved
        </div>
      )}

      {/* Form sections */}
      <div className="lp-card" style={{ marginBottom: 16 }}>
        <SectionTitle>Identity</SectionTitle>
        <Field label="Client name" required>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
          />
        </Field>

        <Field label="Legal company name (if different)">
          <input
            type="text"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Email" required>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="lp-input"
              style={{ width: '100%' }}
              disabled={saving}
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
            />
          </Field>
        </div>

        <Field label="Tax ID / EIN">
          <input
            type="text"
            value={taxId}
            onChange={e => setTaxId(e.target.value)}
            placeholder="XX-XXXXXXX"
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
          />
        </Field>
      </div>

      <div className="lp-card" style={{ marginBottom: 16 }}>
        <SectionTitle>Address</SectionTitle>
        <Field label="Street address">
          <input
            type="text"
            value={addressLine1}
            onChange={e => setAddressLine1(e.target.value)}
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
          <Field label="City">
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              className="lp-input"
              style={{ width: '100%' }}
              disabled={saving}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={stateCode}
              onChange={e => setStateCode(e.target.value)}
              maxLength={2}
              className="lp-input"
              style={{ width: '100%', textTransform: 'uppercase' }}
              disabled={saving}
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
            />
          </Field>
        </div>
      </div>

      <div className="lp-card" style={{ marginBottom: 16 }}>
        <SectionTitle>Billing</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Currency">
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="lp-input"
              style={{ width: '100%' }}
              disabled={saving}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="MXN">MXN</option>
            </select>
          </Field>
          <Field label="Payment terms (days)">
            <input
              type="number"
              value={paymentTerms}
              onChange={e => setPaymentTerms(parseInt(e.target.value, 10) || 0)}
              min={0}
              max={120}
              className="lp-input"
              style={{ width: '100%' }}
              disabled={saving}
            />
          </Field>
        </div>

        <Field label="Internal notes">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Visible only to your team — not the client."
            className="lp-input"
            style={{ width: '100%', minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            disabled={saving}
          />
        </Field>
      </div>

      {/* Danger zone */}
      <div style={{
        padding:      '14px 16px',
        background:   isActive ? 'var(--sem-red-bg)' : 'var(--sem-green-bg)',
        border:       `0.5px solid ${isActive ? 'var(--sem-red)' : 'var(--sem-green)'}`,
        borderRadius: 10,
        marginBottom: 16,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        gap:          12
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize:   13,
            fontWeight: 600,
            color:      isActive ? 'var(--sem-red)' : 'var(--sem-green)',
            marginBottom: 3
          }}>
            {isActive ? 'Deactivate client' : 'Re-activate client'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)' }}>
            {isActive
              ? 'Hides this client from new invoices. Historical data is preserved.'
              : 'Restores this client so you can create new invoices for them.'}
          </div>
        </div>
        <button
          onClick={() => setIsActive(a => !a)}
          disabled={saving}
          style={{
            background:    'transparent',
            border:        `0.5px solid ${isActive ? 'var(--sem-red)' : 'var(--sem-green)'}`,
            color:         isActive ? 'var(--sem-red)' : 'var(--sem-green)',
            borderRadius:  7,
            padding:       '7px 13px',
            fontSize:      11.5,
            fontWeight:    600,
            cursor:        saving ? 'not-allowed' : 'pointer',
            fontFamily:    'inherit',
            whiteSpace:    'nowrap'
          }}
        >
          {isActive ? '🗑 Deactivate' : '✓ Re-activate'}
        </button>
      </div>

      {error && (
        <div style={{
          padding:      '10px 14px',
          background:   'var(--sem-red-bg)',
          border:       '0.5px solid var(--sem-red)',
          borderRadius: 8,
          color:        'var(--sem-red)',
          fontSize:     12.5,
          marginBottom: 16
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Metadata */}
      <div style={{
        fontSize:  11,
        color:     'var(--lp-text-muted)',
        textAlign: 'center',
        marginTop: 20
      }}>
        Created {new Date(client.created_at).toLocaleString()}
        {client.updated_at && client.updated_at !== client.created_at && (
          <> · Last updated {new Date(client.updated_at).toLocaleString()}</>
        )}
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize:      11,
      fontWeight:    700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color:         'var(--lp-text-muted)',
      margin:        '0 0 14px 0'
    }}>
      {children}
    </h2>
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
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display:       'block',
        fontSize:      10.5,
        fontWeight:    700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color:         'var(--lp-text-muted)',
        marginBottom:  5
      }}>
        {label}
        {required && <span style={{ color: 'var(--sem-red)', marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  )
}