// PATH: src/pages/W9Public.tsx
//
// 1099 Fase 4 — Página pública de W-9. El contratista (vendor) abre /w9/:token,
// completa su información y certifica. No es usuario del portal — igual que la
// vista pública del estimate (/e/:token). Al enviar, su w9_status pasa a
// 'on_file' y desbloquea el worksheet 1099 del negocio que lo contrató.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getW9Request, submitW9, type W9RequestContext } from '../services/w9.service'

const CLASSIFICATIONS = [
  { value: 'individual',   label: 'Individual / sole proprietor' },
  { value: 'sole_prop',    label: 'Sole proprietor' },
  { value: 'partnership',  label: 'Partnership' },
  { value: 'llc',          label: 'LLC (not taxed as a corporation)' },
  { value: 'c_corp',       label: 'C-Corporation' },
  { value: 's_corp',       label: 'S-Corporation' },
  { value: 'trust_estate', label: 'Trust / Estate' },
  { value: 'other',        label: 'Other' }
]

const wrap: React.CSSProperties = {
  minHeight: '100vh', background: 'var(--lp-bg)', color: 'var(--lp-text)',
  display: 'flex', justifyContent: 'center', padding: '40px 16px'
}
const card: React.CSSProperties = {
  width: '100%', maxWidth: 560, background: 'var(--lp-surface)',
  border: '0.5px solid var(--lp-border)', borderRadius: 14, padding: 28
}
const label: React.CSSProperties = {
  fontSize: 12, color: 'var(--lp-text-muted)', fontWeight: 600, marginBottom: 4, display: 'block'
}
const row: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }

export default function W9Public() {
  const { token } = useParams<{ token: string }>()

  const [ctx,     setCtx]     = useState<W9RequestContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [done,    setDone]    = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const [legalName, setLegalName] = useState('')
  const [cls,       setCls]       = useState('')
  const [tinType,   setTinType]   = useState<'ssn' | 'ein'>('ein')
  const [tin,       setTin]       = useState('')
  const [line1,     setLine1]     = useState('')
  const [city,      setCity]      = useState('')
  const [state,     setState]     = useState('')
  const [zip,       setZip]       = useState('')
  const [cert,      setCert]      = useState(false)
  const [certName,  setCertName]  = useState('')

  useEffect(() => {
    if (!token) return
    getW9Request(token)
      .then(c => {
        setCtx(c)
        setLegalName(c.legal_name ?? '')
        if (c.already_submitted) setDone(true)
      })
      .catch(e => setLoadErr(e?.message ?? 'This W-9 request could not be found.'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit() {
    if (!token) return
    if (!legalName.trim()) { setError('Legal name is required.'); return }
    if (!cls)              { setError('Please select your tax classification.'); return }
    if (!tin.trim())       { setError('TIN (SSN or EIN) is required.'); return }
    if (!cert || !certName.trim()) { setError('Please certify by typing your name.'); return }
    setSaving(true); setError(null)
    try {
      await submitW9({
        token, legalName: legalName.trim(), taxClassification: cls,
        tin: tin.trim(), tinType,
        ...(line1.trim() ? { addressLine1: line1.trim() } : {}),
        ...(city.trim()  ? { city: city.trim() } : {}),
        ...(state.trim() ? { state: state.trim() } : {}),
        ...(zip.trim()   ? { postalCode: zip.trim() } : {}),
        certName: certName.trim()
      })
      setDone(true)
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit your W-9.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={wrap}><div style={card}>Loading…</div></div>
  if (loadErr) return <div style={wrap}><div style={card}><h2 style={{ marginTop: 0 }}>Not found</h2><p style={{ color: 'var(--lp-text-muted)' }}>{loadErr}</p></div></div>

  if (done) return (
    <div style={wrap}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
        <h2 style={{ margin: '0 0 6px 0' }}>W-9 submitted</h2>
        <p style={{ color: 'var(--lp-text-muted)', fontSize: 13 }}>
          Thank you{ctx?.legal_name ? `, ${ctx.legal_name}` : ''}. Your information has been
          securely recorded. You can close this page.
        </p>
      </div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ margin: '0 0 4px 0', fontSize: 20 }}>Submit your W-9</h1>
        <p style={{ color: 'var(--lp-text-muted)', fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
          A business you worked with needs your taxpayer information to prepare a Form 1099.
          Your details are transmitted securely and used only for tax reporting.
        </p>

        <div style={{ marginTop: 18 }}>
          <div style={row}>
            <label style={label}>Legal name (as shown on your tax return) *</label>
            <input className="lp-input" value={legalName} onChange={e => setLegalName(e.target.value)} />
          </div>

          <div style={row}>
            <label style={label}>Federal tax classification *</label>
            <select className="lp-input" value={cls} onChange={e => setCls(e.target.value)}>
              <option value="">— Select —</option>
              {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div style={row}>
              <label style={label}>TIN type *</label>
              <select className="lp-input" value={tinType} onChange={e => setTinType(e.target.value as any)}>
                <option value="ein">EIN</option>
                <option value="ssn">SSN</option>
              </select>
            </div>
            <div style={row}>
              <label style={label}>{tinType === 'ssn' ? 'Social Security Number' : 'Employer ID Number'} *</label>
              <input className="lp-input" value={tin} onChange={e => setTin(e.target.value)}
                     placeholder={tinType === 'ssn' ? '123-45-6789' : '12-3456789'} />
            </div>
          </div>

          <div style={row}>
            <label style={label}>Street address</label>
            <input className="lp-input" value={line1} onChange={e => setLine1(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <div style={row}><label style={label}>City</label><input className="lp-input" value={city} onChange={e => setCity(e.target.value)} /></div>
            <div style={row}><label style={label}>State</label><input className="lp-input" value={state} onChange={e => setState(e.target.value)} /></div>
            <div style={row}><label style={label}>ZIP</label><input className="lp-input" value={zip} onChange={e => setZip(e.target.value)} /></div>
          </div>

          {/* Certification */}
          <div style={{
            marginTop: 8, padding: '12px 14px', borderRadius: 10,
            background: 'var(--lp-surface-2)', border: '0.5px solid var(--lp-border)'
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
              <input type="checkbox" checked={cert} onChange={e => setCert(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                Under penalties of perjury, I certify that the number shown is my correct
                taxpayer identification number and that the information provided is true and correct.
              </span>
            </label>
            <div style={{ ...row, marginTop: 10, marginBottom: 0 }}>
              <label style={label}>Type your full name to sign *</label>
              <input className="lp-input" value={certName} onChange={e => setCertName(e.target.value)} />
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 8,
              background: 'var(--sem-red-bg)', color: 'var(--sem-red)', fontSize: 12.5
            }}>⚠ {error}</div>
          )}

          <button className="lp-btn lp-btn-primary" style={{ marginTop: 16, width: '100%' }}
                  onClick={handleSubmit} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit W-9'}
          </button>
        </div>
      </div>
    </div>
  )
}
