// PATH: src/components/settings/BrandingTab.tsx
//
// Facturación paso 5 — Branding de documentos. Logo, color de marca, términos,
// footer e instrucciones de pago que aparecen en invoices/estimates y en la
// página pública. Guardado en la org.

import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { getBranding, updateBranding, uploadLogo, type Branding } from '../../services/branding.service'
import FeatureGate from './FeatureGate'

interface Props {
  onMessage: (m: { type: 'ok' | 'err'; text: string }) => void
}

const label: React.CSSProperties = { fontSize: 12, color: 'var(--lp-text-muted)', fontWeight: 600, marginBottom: 4, display: 'block' }

export default function BrandingTab({ onMessage }: Props) {
  return (
    <FeatureGate
      featureKey="white_label"
      title="White-label invoicing"
      description="Put your firm's own logo, brand color, and payment terms on every invoice and estimate your clients see — no LedgiProof branding. Available on the Accountant plan."
    >
      <BrandingTabContent onMessage={onMessage} />
    </FeatureGate>
  )
}

function BrandingTabContent({ onMessage }: Props) {
  const { membership } = useAuthStore()
  const orgId = membership?.org_id ?? ''
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [b, setB] = useState<Branding>({
    logo_url: null, brand_color: '#2563eb',
    invoice_footer: null, invoice_terms: null, payment_instructions: null
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!orgId) return
    getBranding(orgId)
      .then(d => setB({ ...d, brand_color: d.brand_color ?? '#2563eb' }))
      .catch(e => onMessage({ type: 'err', text: e?.message ?? 'Could not load branding' }))
      .finally(() => setLoading(false))
  }, [orgId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogo(file: File) {
    setUploading(true)
    try {
      const url = await uploadLogo(orgId, file)
      setB(prev => ({ ...prev, logo_url: url }))
      onMessage({ type: 'ok', text: 'Logo updated.' })
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Logo upload failed' })
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      await updateBranding(orgId, {
        brand_color:          b.brand_color,
        invoice_footer:       b.invoice_footer,
        invoice_terms:        b.invoice_terms,
        payment_instructions: b.payment_instructions
      })
      onMessage({ type: 'ok', text: 'Branding saved.' })
    } catch (e: any) {
      onMessage({ type: 'err', text: e?.message ?? 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>Loading…</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', gap: 24 }}>
      <div className="lp-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Logo */}
        <div>
          <span style={label}>Logo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 10, border: '0.5px solid var(--lp-border)',
              background: 'var(--lp-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden'
            }}>
              {b.logo_url
                ? <img src={b.logo_url} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                : <BuildingIcon />}
            </div>
            <button className="lp-btn lp-btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : b.logo_url ? 'Replace logo' : 'Upload logo'}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                   style={{ display: 'none' }}
                   onChange={e => { const f = e.target.files?.[0]; if (f) handleLogo(f); e.target.value = '' }} />
          </div>
        </div>

        {/* Brand color */}
        <div>
          <span style={label}>Brand color</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="color" value={b.brand_color ?? '#2563eb'}
                   onChange={e => setB(p => ({ ...p, brand_color: e.target.value }))}
                   style={{ width: 40, height: 34, border: 'none', background: 'none', cursor: 'pointer' }} />
            <input className="lp-input" value={b.brand_color ?? ''} style={{ width: 120 }}
                   onChange={e => setB(p => ({ ...p, brand_color: e.target.value }))} />
          </div>
        </div>

        <div>
          <span style={label}>Default terms</span>
          <textarea className="lp-input" rows={2} value={b.invoice_terms ?? ''}
                    placeholder="e.g. Payment due within 30 days."
                    onChange={e => setB(p => ({ ...p, invoice_terms: e.target.value }))} />
        </div>
        <div>
          <span style={label}>Payment instructions</span>
          <textarea className="lp-input" rows={2} value={b.payment_instructions ?? ''}
                    placeholder="e.g. Zelle to pay@yourbiz.com, or check to…"
                    onChange={e => setB(p => ({ ...p, payment_instructions: e.target.value }))} />
        </div>
        <div>
          <span style={label}>Footer</span>
          <input className="lp-input" value={b.invoice_footer ?? ''}
                 placeholder="e.g. Thank you for your business!"
                 onChange={e => setB(p => ({ ...p, invoice_footer: e.target.value }))} />
        </div>

        <div>
          <button className="lp-btn lp-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save branding'}
          </button>
        </div>
      </div>

      {/* Preview */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Preview</div>
        <div style={{ border: '0.5px solid var(--lp-border)', borderRadius: 10, overflow: 'hidden', background: '#fff', color: '#111827' }}>
          <div style={{ height: 6, background: b.brand_color ?? '#2563eb' }} />
          <div style={{ padding: 14 }}>
            {b.logo_url
              ? <img src={b.logo_url} alt="" style={{ maxHeight: 28, marginBottom: 8 }} />
              : <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Your Business</div>}
            <div style={{ fontSize: 18, fontWeight: 800, color: b.brand_color ?? '#2563eb' }}>INVOICE</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 10 }}>
              {b.invoice_terms || 'Terms appear here'}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>
              {b.payment_instructions || 'Payment instructions here'}
            </div>
            <div style={{ fontSize: 9.5, color: '#9ca3af', marginTop: 8 }}>{b.invoice_footer || 'Footer'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BuildingIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--lp-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" />
      <path d="M15 21V9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v12" />
      <path d="M4 21h16" />
      <path d="M8 7h0M8 11h0M8 15h0" />
    </svg>
  )
}
