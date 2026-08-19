// PATH: src/pages/client/ClientAccountSettings.tsx
//
// P4 Fase 2.C — Audiencia A
//
// Settings page for the external client user (role: pyme_client).
// What the user can do here:
//   · Update display_name and phone
//   · See their account info (email, LP code) read-only
//   · Quick-link to chat with bookkeeper
//
// What they CANNOT do:
//   · Change email (would require reverification — out of scope)
//   · Edit billing client info (the bookkeeper owns that record)
//
// Route: /client/settings  (registered in App.tsx under ClientPortalShell)

import { useState, useEffect } from 'react'
import { useNavigate }        from 'react-router-dom'
import { useChatBubbleStore } from '../../store/chat-bubble.store'
import Button from '../../components/ui/Button'
import SemaphoreSpinner from '../../components/ui/SemaphoreSpinner'
import MfaSetup from '../../components/settings/MfaSetup'
import {
  getMyProfile,
  updateMyProfile,
  type ClientProfile
} from '../../services/client-profile.service'

export default function ClientAccountSettings() {
  const navigate     = useNavigate()
  const { openChat } = useChatBubbleStore()

  const [profile,     setProfile]     = useState<ClientProfile | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState<string | null>(null)

  // Form state
  const [displayName, setDisplayName] = useState('')
  const [phone,       setPhone]       = useState('')

  // Save state
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt,   setSavedAt]   = useState<number | null>(null)

  // ── Load profile ────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const p = await getMyProfile()
        if (!alive) return
        if (!p) {
          setLoadError('Your profile could not be loaded. Please contact support.')
          return
        }
        setProfile(p)
        setDisplayName(p.display_name ?? '')
        setPhone(p.phone ?? '')
      } catch (e: any) {
        if (alive) setLoadError(e?.message ?? 'Could not load profile')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  // ── Detect changes ──────────────────────────────────────────────────────
  const hasChanges =
    !!profile && (
      (displayName.trim() !== (profile.display_name ?? '')) ||
      (phone.trim()       !== (profile.phone        ?? ''))
    )

  // ── Save ────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!profile || !hasChanges || saving) return
    if (!displayName.trim()) {
      setSaveError('Display name is required')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateMyProfile({
        display_name: displayName,
        phone
      })
      setProfile(updated)
      setDisplayName(updated.display_name ?? '')
      setPhone(updated.phone ?? '')
      setSavedAt(Date.now())
      // Auto-clear "saved" message after 3s
      setTimeout(() => setSavedAt(t => (t && Date.now() - t >= 3000) ? null : t), 3100)
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
        <SemaphoreSpinner size="md" inline />
      </div>
    )
  }

  if (loadError || !profile) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>⚠</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)', marginBottom: 6 }}>
          Could not load your settings
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)', marginBottom: 16 }}>
          {loadError ?? 'Unknown error'}
        </div>
        <Button variant="ghost" onClick={() => navigate('/client')}>
          ← Back to dashboard
        </Button>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 720, width: '100%', margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={() => navigate('/client')}
          style={{
            background: 'none', border: 'none', padding: 0,
            color: 'var(--lp-accent)', fontSize: 12,
            cursor: 'pointer', fontFamily: 'inherit'
          }}
        >
          ← Back to dashboard
        </button>
      </div>

      {/* Header */}
      <h1 className="lp-page-title" style={{ margin: 0 }}>
        Account settings
      </h1>
      <p className="lp-page-sub" style={{ margin: '4px 0 24px 0' }}>
        Manage how your name and phone appear to your bookkeeper.
      </p>

      {/* Saved indicator */}
      {savedAt && (
        <div style={{
          padding: '8px 12px',
          background: 'var(--sem-green-bg)',
          border: '0.5px solid var(--sem-green)',
          borderRadius: 7,
          color: 'var(--sem-green)',
          fontSize: 12.5,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span>✓</span>
          <span>Saved</span>
        </div>
      )}

      {/* Profile section */}
      <div className="lp-card" style={{ marginBottom: 16 }}>
        <SectionTitle>Your profile</SectionTitle>

        <Field label="Display name" required>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. Maria Garcia"
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
            placeholder="(555) 555-0100"
            className="lp-input"
            style={{ width: '100%' }}
            disabled={saving}
            maxLength={40}
          />
        </Field>

        {saveError && (
          <div style={{
            padding: '8px 12px',
            background: 'var(--sem-red-bg)',
            border: '0.5px solid var(--sem-red)',
            borderRadius: 7,
            color: 'var(--sem-red)',
            fontSize: 12,
            marginTop: 4,
            marginBottom: 4
          }}>
            ⚠ {saveError}
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 14
        }}>
          <Button
            variant="primary"
            loading={saving}
            disabled={saving || !hasChanges || !displayName.trim()}
            onClick={handleSave}
          >
            Save changes
          </Button>
        </div>
      </div>

      {/* Read-only section */}
      <div className="lp-card" style={{ marginBottom: 16 }}>
        <SectionTitle>Account info</SectionTitle>

        <ReadOnlyRow
          label="Email"
          value={profile.email ?? '—'}
          hint="To change your email, contact your bookkeeper."
        />

        <ReadOnlyRow
          label="LedgiProof user code"
          value={profile.lp_user_code ?? '—'}
          mono
          hint="Reference code when contacting support."
        />
      </div>

      {/* Security section — 2FA (same component used in staff Settings) */}
      <div className="lp-card" style={{ marginBottom: 16 }}>
        <SectionTitle>Security</SectionTitle>
        <MfaSetup />
      </div>

      {/* Quick action — chat */}
      <div style={{
        padding: '14px 16px',
        background: 'var(--chat-bubble-internal-bg)',
        border: '0.5px solid var(--chat-bubble-internal-border)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--lp-text)',
            marginBottom: 2
          }}>
            Need to make a change to your billing info?
          </div>
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)' }}>
            Your bookkeeper handles company name, tax ID, and address updates.
          </div>
        </div>
        <button
          onClick={() => openChat()}
          style={{
            background: 'var(--lp-accent)',
            border: 'none',
            color: '#fff',
            borderRadius: 7,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap'
          }}
        >
          💬 Chat with bookkeeper
        </button>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--lp-text-muted)',
      margin: '0 0 14px 0'
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
        display: 'block',
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--lp-text-muted)',
        marginBottom: 5
      }}>
        {label}
        {required && <span style={{ color: 'var(--sem-red)', marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

function ReadOnlyRow({
  label, value, hint, mono
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '160px 1fr',
      gap: 16,
      padding: '8px 0',
      borderBottom: '0.5px solid var(--chat-row-divider)',
      alignItems: 'baseline'
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--lp-text-muted)'
      }}>
        {label}
      </div>
      <div>
        <div style={{
          fontSize: 13,
          color: 'var(--lp-text)',
          fontFamily: mono ? 'monospace' : 'inherit'
        }}>
          {value}
        </div>
        {hint && (
          <div style={{
            fontSize: 11,
            color: 'var(--lp-text-muted)',
            marginTop: 2
          }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}