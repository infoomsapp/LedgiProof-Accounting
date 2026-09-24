// PATH: src/components/clients/AddClientDialog.tsx
//
// P4 — Reusable "Add Client" modal.
//
// Replaces the inline modal that lived inside Invoices.tsx, now a shared
// component used by:
//   · LpAddMenu (BookkeeperDashboard header + /clients page header)
//   · Invoices.tsx (via "+ New client" inside the invoice editor)
//
// Architectural rationale:
//   The current implementation in Invoices.tsx is minimal (name + email only).
//   AL's pedido implies clients should be CREATABLE from multiple entry points
//   with consistent fields. This dialog exposes the FULL client schema with
//   sensible defaults (US country, USD currency, 30-day terms).

import { useState } from 'react'
import Modal from '../ui/modal'
import Button from '../ui/Button'
import { useAuthStore } from '../../store/auth.store'
import { createClient } from '../../services/invoice.service'
// 🆕 Sprint 5 Paso 5.5 — Inline template selection (replaces post-create modal).
import TemplatePicker      from './TemplatePicker'
import { useCloneTemplate } from '../../hooks/useAccountTemplates'
import { toSafeMessage } from '../../lib/errors'
import { checkClientLimit } from '../../services/seat-limits.service'
import UpgradeModal from '../billing/UpgradeModal'
import type { SubscriptionPlan } from '../../types/database.types'
import {
  createClientPortalInvitation, sendClientInvitationEmail,
  CLIENT_PORTAL_ROLE_CONFIG, type ClientPortalRole
} from '../../services/client-portal.service'

interface Props {
  open:    boolean
  onClose: () => void
  orgId:   string
  /** Called with the newly created client_id */
  onCreated?: (clientId: string) => void
}

export default function AddClientDialog({ open, onClose, orgId, onCreated }: Props) {
  const { profile } = useAuthStore()

  // Required
  const [displayName, setDisplayName] = useState('')
  // Optional core
  const [companyName, setCompanyName] = useState('')
  const [email,       setEmail]       = useState('')
  const [phone,       setPhone]       = useState('')
  const [taxId,       setTaxId]       = useState('')
  // Optional address
  const [addressLine1, setAddressLine1] = useState('')
  const [city,         setCity]         = useState('')
  const [stateCode,    setStateCode]    = useState('')
  const [postalCode,   setPostalCode]   = useState('')
  // Defaults
  const [currency,     setCurrency]     = useState('USD')
  const [paymentTerms, setPaymentTerms] = useState(30)

  // UI state
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [showOptional, setShowOptional] = useState(false)

  // 🆕 Sprint 5 Paso 5.5 — Inline template selection (replaces post-create modal).
  // Empty string means "no template" (create client without CoA).
  const [templateId, setTemplateId] = useState<string>('')

  // 🆕 Partial-failure warning surfaced if create succeeded but clone failed.
  // The client is already in the DB; user can retry the template from CoA page.
  const [partialWarning, setPartialWarning] = useState<{ clientId: string; message: string } | null>(null)

  // 🆕 One-step portal invite (matches QuickBooks Online Accountant's single
  // "Add Client" action, which creates the client AND sends the invite in
  // one save -- previously this app required a second trip to the separate
  // "Client Invites" tab to pick the just-created client from a dropdown and
  // re-type their email). Off by default: not every client needs portal
  // login (many are bookkeeper-managed only), so this stays an explicit,
  // optional checkbox rather than always firing.
  const [inviteToPortal, setInviteToPortal] = useState(false)
  const [portalRole, setPortalRole] = useState<ClientPortalRole>('client_contact')
  const [inviteWarning, setInviteWarning] = useState<string | null>(null)

  // Plan seat limit ("Up to N clients") -- real enforcement, see
  // seat-limits.service.ts for why this isn't the usage_tracking system.
  const [limitModal, setLimitModal] = useState<{ used: number; limit: number; plan: SubscriptionPlan } | null>(null)

  const cloneMut = useCloneTemplate(orgId)

  function reset() {
    setDisplayName(''); setCompanyName(''); setEmail(''); setPhone(''); setTaxId('')
    setAddressLine1(''); setCity(''); setStateCode(''); setPostalCode('')
    setCurrency('USD'); setPaymentTerms(30)
    setError(null); setShowOptional(false)
    // 🆕 Sprint 5 Paso 5.5
    setTemplateId(''); setPartialWarning(null)
    setInviteToPortal(false); setPortalRole('client_contact'); setInviteWarning(null)
  }

  function handleClose() {
    if (saving) return
    reset()
    onClose()
  }

  async function handleSubmit() {
    if (!displayName.trim()) {
      setError('Client name is required')
      return
    }
    if (!profile?.id) {
      setError('Not authenticated')
      return
    }
    if (inviteToPortal && !email.trim()) {
      setError('Email is required to invite this client to the portal')
      return
    }
    setError(null)
    setPartialWarning(null)
    setInviteWarning(null)
    setSaving(true)

    try {
      // ── Step 0: enforce the plan's client limit ──────────────────────
      const limit = await checkClientLimit(profile.id, orgId)
      if (!limit.allowed) {
        setLimitModal(limit)
        setSaving(false)
        return
      }

      // ── Step 1: create client ────────────────────────────────────────
      const c = await createClient({
        org_id:           orgId,
        display_name:     displayName.trim(),
        company_name:     companyName.trim() || null,
        email:            email.trim() || null,
        phone:            phone.trim() || null,
        tax_id:           taxId.trim() || null,
        address_line1:    addressLine1.trim() || null,
        address_line2:    null,
        city:             city.trim() || null,
        state:            stateCode.trim() || null,
        postal_code:      postalCode.trim() || null,
        country:          'US',
        default_currency: currency,
        payment_terms:    paymentTerms,
        notes:            null,
        is_active:        true,
        created_by:       profile.id
      })

      // ── Step 2: optionally apply selected template ──────────────────
      // If template is selected, clone immediately. Partial failure here
      // is non-fatal — the client exists; we surface a warning + CTA.
      if (templateId) {
        try {
          const result = await cloneMut.mutateAsync({
            templateId,
            clientId: c.id
          })
          if (result.accountsCreated === 0) {
            // Edge: clone returned 0 accounts (empty template)
            setPartialWarning({
              clientId: c.id,
              message:  'Client was created but the selected template produced 0 accounts. You can pick a different template from the client\'s Chart of Accounts page.'
            })
            // Don't reset / close — keep dialog open so user sees the warning
            onCreated?.(c.id)
            setSaving(false)
            return
          }
        } catch (cloneErr: any) {
          // Partial failure: client exists, template clone failed
          setPartialWarning({
            clientId: c.id,
            message:  `Client was created, but applying the template failed: ${toSafeMessage(cloneErr, 'unknown error')}. You can retry from the client's Chart of Accounts page.`
          })
          onCreated?.(c.id)
          setSaving(false)
          return
        }
      }

      // ── Step 3: optionally send the portal invite, same save ────────────
      // Client already exists at this point regardless of what happens
      // below -- an invite failure is surfaced as a warning, never rolls
      // back the client (same partial-failure shape as the template step).
      if (inviteToPortal) {
        try {
          const inv = await createClientPortalInvitation({
            clientId: c.id,
            email:    email.trim(),
            role:     portalRole
          })
          const emailResult = await sendClientInvitationEmail({ invitationId: inv.invitation_id })
          if (!emailResult.sent) {
            setInviteWarning(
              `Client created, but the portal invitation email couldn't be sent (${emailResult.error ?? 'unknown error'}). ` +
              `You can resend it from the Client Invites tab.`
            )
            onCreated?.(c.id)
            setSaving(false)
            return
          }
        } catch (inviteErr: any) {
          setInviteWarning(
            `Client created, but the portal invitation failed: ${toSafeMessage(inviteErr, 'unknown error')}. ` +
            `You can send it from the Client Invites tab.`
          )
          onCreated?.(c.id)
          setSaving(false)
          return
        }
      }

      // ── Success path: client created (+ template applied, + portal invite sent, if selected)
      reset()
      onCreated?.(c.id)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Could not create client')
    } finally {
      setSaving(false)
    }
  }

  function handleAcknowledgePartial() {
    // User saw the warning and is moving on. Close everything.
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add a new client"
      subtitle="Create a billing client. You can add bank connections and invoices to them later."
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={saving || displayName.trim().length === 0}
            onClick={handleSubmit}
          >
            {templateId && inviteToPortal ? 'Create client + apply template + invite'
              : templateId ? 'Create client + apply template'
              : inviteToPortal ? 'Create client + send invite'
              : 'Create client'}
          </Button>
        </>
      }
    >
      {/* Required: name */}
      <Field label="Client name" required>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="e.g. Acme Restaurant LLC"
          className="lp-input"
          autoFocus
          style={{ width: '100%' }}
        />
      </Field>

      {/* Optional: company name */}
      <Field label="Legal company name (if different)">
        <input
          type="text"
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          placeholder="Optional"
          className="lp-input"
          style={{ width: '100%' }}
        />
      </Field>

      {/* Email + phone row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="billing@acme.com"
            className="lp-input"
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(555) 555-0100"
            className="lp-input"
            style={{ width: '100%' }}
          />
        </Field>
      </div>

      {/* 🆕 One-step portal invite -- see the state comment above for why
          this replaces the old two-tab flow. */}
      <div style={{
        padding: 12, borderRadius: 8, marginBottom: 12,
        background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: 'var(--lp-text)' }}>
          <input
            type="checkbox"
            checked={inviteToPortal}
            onChange={e => setInviteToPortal(e.target.checked)}
          />
          Invite this client to the client portal now
        </label>
        <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 3, marginLeft: 24 }}>
          Sends a login invite to the email above. Leave unchecked if this client is bookkeeper-managed only.
        </div>
        {inviteToPortal && (
          <div style={{ marginTop: 10, marginLeft: 24 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-muted)', display: 'block', marginBottom: 5 }}>
              Portal access level
            </label>
            <select
              value={portalRole}
              onChange={e => setPortalRole(e.target.value as ClientPortalRole)}
              className="lp-input"
              style={{ width: '100%' }}
            >
              {(Object.keys(CLIENT_PORTAL_ROLE_CONFIG) as ClientPortalRole[]).map(r => (
                <option key={r} value={r}>{CLIENT_PORTAL_ROLE_CONFIG[r].label} — {CLIENT_PORTAL_ROLE_CONFIG[r].description}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Toggle for optional fields */}
      <button
        onClick={() => setShowOptional(o => !o)}
        style={{
          background:  'none',
          border:      'none',
          color:       'var(--lp-accent)',
          fontSize:    11.5,
          fontWeight:  500,
          fontFamily:  'inherit',
          cursor:      'pointer',
          padding:     '6px 0',
          marginBottom: 4,
          display:     'flex',
          alignItems:  'center',
          gap:         4
        }}
      >
        <span>{showOptional ? '▼' : '▶'}</span>
        <span>{showOptional ? 'Hide optional fields' : 'Add tax ID, address, payment terms'}</span>
      </button>

      {/* 🆕 Sprint 5 Paso 5.5 — Inline template selector.
          Visible right above the optional-fields toggle so the user sees it
          BEFORE clicking Create. If left at "(none)", client is created
          without a CoA bootstrap (same as legacy behavior). */}
      <div style={{
        padding:      12,
        background:   'var(--lp-muted-bg)',
        border:       '0.5px solid var(--lp-border)',
        borderRadius: 8,
        marginBottom: 12,
        marginTop:    8
      }}>
        <TemplatePicker
          orgId={orgId}
          selectedId={templateId}
          onSelect={setTemplateId}
          label="Bootstrap Chart of Accounts (optional)"
          helpText="Choose a template to pre-create accounts for this client. Leave empty to create the client with no accounts (you can apply a template later from the Chart of Accounts page)."
          disabled={saving}
        />
      </div>

      {showOptional && (
        <div style={{
          padding:      12,
          background:   'var(--lp-surface-2)',
          border:       '0.5px solid var(--lp-border)',
          borderRadius: 8,
          marginBottom: 12
        }}>
          <Field label="Tax ID / EIN">
            <input
              type="text"
              value={taxId}
              onChange={e => setTaxId(e.target.value)}
              placeholder="XX-XXXXXXX"
              className="lp-input"
              style={{ width: '100%' }}
            />
          </Field>

          <Field label="Address">
            <input
              type="text"
              value={addressLine1}
              onChange={e => setAddressLine1(e.target.value)}
              placeholder="123 Main St"
              className="lp-input"
              style={{ width: '100%' }}
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
              />
            </Field>
            <Field label="State">
              <input
                type="text"
                value={stateCode}
                onChange={e => setStateCode(e.target.value)}
                placeholder="MD"
                maxLength={2}
                className="lp-input"
                style={{ width: '100%', textTransform: 'uppercase' }}
              />
            </Field>
            <Field label="ZIP">
              <input
                type="text"
                value={postalCode}
                onChange={e => setPostalCode(e.target.value)}
                placeholder="21201"
                className="lp-input"
                style={{ width: '100%' }}
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Currency">
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="lp-input"
                style={{ width: '100%' }}
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
              />
            </Field>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding:      '8px 12px',
          background:   'var(--sem-red-bg)',
          border:       '0.5px solid var(--sem-red)',
          borderRadius: 7,
          color:        'var(--sem-red)',
          fontSize:     12,
          marginTop:    8
        }}>
          ⚠ {error}
        </div>
      )}

      {/* 🆕 Sprint 5 Paso 5.5 — Partial-failure warning. Client created OK
          but template clone failed; user must acknowledge before closing. */}
      {partialWarning && (
        <div style={{
          padding:      '12px 14px',
          background:   'var(--sem-amber-bg)',
          border:       '0.5px solid var(--sem-amber-border)',
          borderRadius: 8,
          fontSize:     12.5,
          color:        'var(--lp-text)',
          marginTop:    12,
          lineHeight:   1.5
        }}>
          <div style={{ fontWeight: 600, color: 'var(--sem-amber)', marginBottom: 6 }}>
            Partial success
          </div>
          <div style={{ marginBottom: 10 }}>
            {partialWarning.message}
          </div>
          <Button variant="ghost" onClick={handleAcknowledgePartial}>
            Got it — close dialog
          </Button>
        </div>
      )}

      {/* 🆕 Portal-invite partial-failure warning -- client (and template, if
          any) already exist either way; only the invite email step failed. */}
      {inviteWarning && (
        <div style={{
          padding:      '12px 14px',
          background:   'var(--sem-amber-bg)',
          border:       '0.5px solid var(--sem-amber-border)',
          borderRadius: 8,
          fontSize:     12.5,
          color:        'var(--lp-text)',
          marginTop:    12,
          lineHeight:   1.5
        }}>
          <div style={{ fontWeight: 600, color: 'var(--sem-amber)', marginBottom: 6 }}>
            Client created — invite needs a retry
          </div>
          <div style={{ marginBottom: 10 }}>
            {inviteWarning}
          </div>
          <Button variant="ghost" onClick={handleAcknowledgePartial}>
            Got it — close dialog
          </Button>
        </div>
      )}

      {limitModal && (
        <UpgradeModal
          open
          onClose={() => setLimitModal(null)}
          feature="clients"
          currentPlan={limitModal.plan}
          reason="limit_exhausted"
          used={limitModal.used}
          limit={limitModal.limit}
        />
      )}
    </Modal>
  )
}

// ── Field wrapper ───────────────────────────────────────────────────────────

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
        display:       'block',
        fontSize:      10.5,
        fontWeight:    700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color:         'var(--lp-text-muted)',
        marginBottom:  5
      }}>
        {label}
        {required && (
          <span style={{ color: 'var(--sem-red)', marginLeft: 4 }}>*</span>
        )}
      </label>
      {children}
    </div>
  )
}