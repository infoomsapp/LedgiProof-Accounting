// PATH: src/components/payroll/SyncPayrollEmployeeDialog.tsx
//
// Collects the fields Check's /employees endpoint needs that LedgiProof
// doesn't store (email, dob, full residence street address — see
// payroll-sync-employee/index.ts's header comment for why), then opens the
// employee's own hosted Check Onboard link where THEY enter SSN and bank
// details directly. Never sent to or stored by LedgiProof.

import { useState } from 'react'
import Modal from '../ui/modal'
import Button from '../ui/Button'
import { useStartPayrollEmployeeOnboarding } from '../../hooks/usePayroll'

interface Props {
  open:        boolean
  onClose:     () => void
  orgId:       string
  employeeId:  string
  employeeName: string
}

export default function SyncPayrollEmployeeDialog({ open, onClose, orgId, employeeId, employeeName }: Props) {
  const startOnboarding = useStartPayrollEmployeeOnboarding(orgId)

  const [email, setEmail]           = useState('')
  const [dob, setDob]               = useState('')
  const [line1, setLine1]           = useState('')
  const [city, setCity]             = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [error, setError]           = useState<string | null>(null)
  const [onboardUrl, setOnboardUrl] = useState<string | null>(null)

  function reset() {
    setEmail(''); setDob(''); setLine1(''); setCity(''); setPostalCode('')
    setError(null); setOnboardUrl(null)
  }

  function handleClose() {
    if (startOnboarding.isPending) return
    reset()
    onClose()
  }

  async function handleSubmit() {
    setError(null)
    if (!email.trim() || !dob || !line1.trim() || !city.trim() || !postalCode.trim()) {
      setError('All fields are required.')
      return
    }
    try {
      const result = await startOnboarding.mutateAsync({
        employee_id: employeeId,
        email: email.trim(),
        dob,
        residence: { line1: line1.trim(), city: city.trim(), postal_code: postalCode.trim() }
      })
      setOnboardUrl(result.onboard_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Check onboarding for this employee')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Sync ${employeeName} to Check`}
      subtitle="These fields are only used to create the Check employee record — LedgiProof does not store them."
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={startOnboarding.isPending}>Close</Button>
          {!onboardUrl && (
            <Button variant="primary" loading={startOnboarding.isPending} onClick={handleSubmit}>
              Generate onboarding link
            </Button>
          )}
        </>
      }
    >
      {!onboardUrl ? (
        <>
          <Field label="Email" required>
            <input type="email" className="lp-input" style={{ width: '100%' }} value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Date of birth" required>
            <input type="date" className="lp-input" style={{ width: '100%' }} value={dob} onChange={e => setDob(e.target.value)} />
          </Field>
          <Field label="Residence street address" required>
            <input className="lp-input" style={{ width: '100%' }} value={line1} onChange={e => setLine1(e.target.value)} placeholder="123 Main St" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Field label="City" required>
              <input className="lp-input" style={{ width: '100%' }} value={city} onChange={e => setCity(e.target.value)} />
            </Field>
            <Field label="ZIP" required>
              <input className="lp-input" style={{ width: '100%' }} value={postalCode} onChange={e => setPostalCode(e.target.value)} />
            </Field>
          </div>
          {error && (
            <div style={{ padding: '8px 12px', background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)', borderRadius: 7, color: 'var(--sem-red)', fontSize: 12, marginTop: 8 }}>
              ⚠ {error}
            </div>
          )}
        </>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: 'var(--lp-text)', marginBottom: 12 }}>
            Onboarding link generated. Send this to {employeeName} (or have them complete it now) — they'll
            enter their SSN, bank account, and W-4 elections directly with Check.
          </p>
          <a href={onboardUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="success">Open Check onboarding →</Button>
          </a>
        </div>
      )}
    </Modal>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--lp-text-muted)', marginBottom: 5 }}>
        {label}{required && <span style={{ color: 'var(--sem-red)', marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  )
}
