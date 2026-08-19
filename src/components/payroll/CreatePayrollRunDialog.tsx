// PATH: src/components/payroll/CreatePayrollRunDialog.tsx
//
// Creates a draft payroll.runs row. payroll_create_run enforces
// employer_profiles.onboarding_status = 'complete' (i.e. account mapping
// saved) server-side — this dialog surfaces that error verbatim rather
// than pre-guessing it, since the sync-state DTO doesn't expose
// onboarding_status to check client-side (see PayrollEmployerSetupCard's
// comment on the same limitation).

import { useState } from 'react'
import Modal from '../ui/modal'
import Button from '../ui/Button'
import { useCreatePayrollRun } from '../../hooks/usePayroll'

interface Props {
  open:     boolean
  onClose:  () => void
  orgId:    string
  clientId: string | null
  onCreated?: (runId: string) => void
}

export default function CreatePayrollRunDialog({ open, onClose, orgId, clientId, onCreated }: Props) {
  const createRun = useCreatePayrollRun(orgId)

  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd]     = useState('')
  const [payDate, setPayDate]         = useState('')
  const [error, setError]             = useState<string | null>(null)

  function reset() {
    setPeriodStart(''); setPeriodEnd(''); setPayDate(''); setError(null)
  }

  function handleClose() {
    if (createRun.isPending) return
    reset()
    onClose()
  }

  async function handleSubmit() {
    setError(null)
    if (!periodStart || !periodEnd || !payDate) {
      setError('Period start, period end, and pay date are all required.')
      return
    }
    if (new Date(periodEnd) < new Date(periodStart)) {
      setError('Period end cannot be before period start.')
      return
    }
    try {
      const result = await createRun.mutateAsync({
        org_id: orgId,
        client_id: clientId,
        period_start: periodStart,
        period_end: periodEnd,
        pay_date: payDate
      })
      reset()
      onCreated?.(result.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create payroll run')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create payroll run"
      subtitle="Draft only — nothing is sent to Check until you approve and submit it."
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={createRun.isPending}>Cancel</Button>
          <Button variant="primary" loading={createRun.isPending} onClick={handleSubmit}>Create run</Button>
        </>
      }
    >
      <Field label="Period start" required>
        <input type="date" className="lp-input" style={{ width: '100%' }} value={periodStart} onChange={e => setPeriodStart(e.target.value)} autoFocus />
      </Field>
      <Field label="Period end" required>
        <input type="date" className="lp-input" style={{ width: '100%' }} value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
      </Field>
      <Field label="Pay date" required>
        <input type="date" className="lp-input" style={{ width: '100%' }} value={payDate} onChange={e => setPayDate(e.target.value)} />
      </Field>

      {error && (
        <div style={{ padding: '8px 12px', background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)', borderRadius: 7, color: 'var(--sem-red)', fontSize: 12, marginTop: 8 }}>
          ⚠ {error}
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
