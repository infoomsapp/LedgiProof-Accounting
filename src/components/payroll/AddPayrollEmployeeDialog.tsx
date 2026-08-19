// PATH: src/components/payroll/AddPayrollEmployeeDialog.tsx
//
// Creates a payroll.employees row (LedgiProof's own record — no SSN, no
// bank details here; those only ever go to Check via SyncPayrollEmployeeDialog).
//
// State pickers are restricted to PAYROLL_SUPPORTED_STATES (VA/MD/DC/PA/DE/WV
// launch scope) — not a placeholder restriction, it mirrors the DB's own
// `payroll.supported_state` enum, which only has these 6 values.

import { useState } from 'react'
import Modal from '../ui/modal'
import Button from '../ui/Button'
import { useCreatePayrollEmployee } from '../../hooks/usePayroll'
import { PAYROLL_SUPPORTED_STATES } from '../../types/payroll'
import type { PayrollEmployeeType, PayrollCompensationBasis, SupportedPayrollState } from '../../types/payroll'

interface Props {
  open:      boolean
  onClose:   () => void
  orgId:     string
  clientId:  string | null
  onCreated?: (employeeId: string) => void
}

export default function AddPayrollEmployeeDialog({ open, onClose, orgId, clientId, onCreated }: Props) {
  const createEmployee = useCreatePayrollEmployee(orgId)

  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [jobTitle, setJobTitle]     = useState('')
  const [department, setDepartment] = useState('')
  const [employeeType, setEmployeeType] = useState<PayrollEmployeeType>('w2')
  const [hireDate, setHireDate]     = useState('')
  const [compAmount, setCompAmount] = useState('')
  const [compBasis, setCompBasis]   = useState<PayrollCompensationBasis>('salary')
  const [residenceState, setResidenceState] = useState<SupportedPayrollState>('VA')
  const [workState, setWorkState]           = useState<SupportedPayrollState>('VA')
  const [residenceCounty, setResidenceCounty] = useState('')
  const [paPsdCode, setPaPsdCode]             = useState('')

  const [error, setError] = useState<string | null>(null)

  function reset() {
    setFirstName(''); setLastName(''); setJobTitle(''); setDepartment('')
    setEmployeeType('w2'); setHireDate(''); setCompAmount(''); setCompBasis('salary')
    setResidenceState('VA'); setWorkState('VA'); setResidenceCounty(''); setPaPsdCode('')
    setError(null)
  }

  function handleClose() {
    if (createEmployee.isPending) return
    reset()
    onClose()
  }

  async function handleSubmit() {
    setError(null)
    if (!firstName.trim() || !lastName.trim() || !hireDate || !compAmount) {
      setError('First name, last name, hire date, and compensation are required.')
      return
    }
    if (compBasis === 'hourly') {
      setError(
        'Hourly employees are not yet supported for payroll submission (no timesheet input exists). ' +
        'You can still add them here, but runs will refuse to submit while any active employee is hourly.'
      )
    }
    try {
      const result = await createEmployee.mutateAsync({
        org_id: orgId,
        client_id: clientId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        job_title: jobTitle.trim(),
        department: department.trim(),
        employee_type: employeeType,
        hire_date: hireDate,
        compensation_amount: Number(compAmount),
        compensation_basis: compBasis,
        residence_state: residenceState,
        work_state: workState,
        ...(residenceCounty.trim() ? { residence_county: residenceCounty.trim() } : {}),
        ...(paPsdCode.trim()       ? { pa_psd_code: paPsdCode.trim() }             : {})
      })
      reset()
      onCreated?.(result.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create employee')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add payroll employee"
      subtitle="LedgiProof stores name, compensation, and tax jurisdiction only. SSN and bank details are collected directly by Check during onboarding."
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={createEmployee.isPending}>Cancel</Button>
          <Button variant="primary" loading={createEmployee.isPending} onClick={handleSubmit}>Add employee</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="First name" required>
          <input className="lp-input" style={{ width: '100%' }} value={firstName} onChange={e => setFirstName(e.target.value)} autoFocus />
        </Field>
        <Field label="Last name" required>
          <input className="lp-input" style={{ width: '100%' }} value={lastName} onChange={e => setLastName(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Job title">
          <input className="lp-input" style={{ width: '100%' }} value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
        </Field>
        <Field label="Department">
          <input className="lp-input" style={{ width: '100%' }} value={department} onChange={e => setDepartment(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Employee type">
          <select className="lp-input" style={{ width: '100%' }} value={employeeType} onChange={e => setEmployeeType(e.target.value as PayrollEmployeeType)}>
            <option value="w2">W2 employee</option>
            <option value="contractor_1099">1099 contractor</option>
          </select>
        </Field>
        <Field label="Hire date" required>
          <input type="date" className="lp-input" style={{ width: '100%' }} value={hireDate} onChange={e => setHireDate(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Compensation (annual, USD)" required>
          <input type="number" min={0} step="0.01" className="lp-input" style={{ width: '100%' }} value={compAmount} onChange={e => setCompAmount(e.target.value)} />
        </Field>
        <Field label="Basis">
          <select className="lp-input" style={{ width: '100%' }} value={compBasis} onChange={e => setCompBasis(e.target.value as PayrollCompensationBasis)}>
            <option value="salary">Salary</option>
            <option value="hourly">Hourly (not yet submittable)</option>
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Residence state" required>
          <select className="lp-input" style={{ width: '100%' }} value={residenceState} onChange={e => setResidenceState(e.target.value as SupportedPayrollState)}>
            {PAYROLL_SUPPORTED_STATES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Work state" required>
          <select className="lp-input" style={{ width: '100%' }} value={workState} onChange={e => setWorkState(e.target.value as SupportedPayrollState)}>
            {PAYROLL_SUPPORTED_STATES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </Field>
      </div>

      {residenceState === 'MD' && (
        <Field label="Residence county (Maryland local tax)">
          <input className="lp-input" style={{ width: '100%' }} value={residenceCounty} onChange={e => setResidenceCounty(e.target.value)} placeholder="e.g. Montgomery" />
        </Field>
      )}
      {residenceState === 'PA' && (
        <Field label="PSD code (Pennsylvania local EIT)">
          <input className="lp-input" style={{ width: '100%' }} value={paPsdCode} onChange={e => setPaPsdCode(e.target.value)} placeholder="e.g. 510301" />
        </Field>
      )}

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
