// PATH: src/pages/Payroll.tsx
//
// LedgiProof Payroll — main page. Mounted both flat (/payroll, self-service
// orgs) and nested (/clients/:clientId/payroll, firm-managed clients) via
// useScope(), matching the existing pattern used by Transactions/Invoices/
// Estimates/ChartOfAccounts.
//
// Launch scope: VA / MD / DC / PA / DE / WV. Solo/self-employed profile is
// explicitly out of scope (route itself is gated by RoleGuard in App.tsx,
// this page additionally checks canViewPayroll/canRunPayroll for
// action-level CBAC per LedgiProof's governance rules).

import { useState } from 'react'
import { useScope } from '../hooks/useScope'
import { useUserRole } from '../hooks/useUserRole'
import { useAuthStore } from '../store/auth.store'
import {
  usePayrollEmployees,
  usePayrollRuns,
  useApprovePayrollRun,
  useSubmitPayrollRunToProvider,
  useTerminatePayrollEmployee
} from '../hooks/usePayroll'
import PayrollEmployerSetupCard from '../components/payroll/PayrollEmployerSetupCard'
import AddPayrollEmployeeDialog from '../components/payroll/AddPayrollEmployeeDialog'
import SyncPayrollEmployeeDialog from '../components/payroll/SyncPayrollEmployeeDialog'
import CreatePayrollRunDialog from '../components/payroll/CreatePayrollRunDialog'
import Button from '../components/ui/Button'
import SemaphoreSpinner from '../components/ui/SemaphoreSpinner'
import {
  PAYROLL_RUN_STATUS_CONFIG,
  PAYROLL_EMPLOYEE_STATUS_CONFIG
} from '../types/payroll'
import type { PayrollEmployee } from '../types/payroll'

export default function Payroll() {
  const scope = useScope()
  const role  = useUserRole()
  const { profile } = useAuthStore()

  const employeesQuery = usePayrollEmployees(scope.isReady ? scope.orgId : null)
  const runsQuery       = usePayrollRuns(scope.isReady ? scope.orgId : null)

  const approveRun = useApprovePayrollRun(scope.orgId)
  const submitRun   = useSubmitPayrollRunToProvider(scope.orgId)
  const terminate    = useTerminatePayrollEmployee(scope.orgId)

  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false)
  const [createRunOpen, setCreateRunOpen]     = useState(false)
  const [syncTarget, setSyncTarget]           = useState<PayrollEmployee | null>(null)
  const [submitError, setSubmitError]         = useState<string | null>(null)

  if (!scope.isReady || role.loading) {
    return <SemaphoreSpinner label="Loading payroll…" />
  }

  if (!role.canViewPayroll) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--lp-text-muted)' }}>
        You don't have access to Payroll for this organization.
      </div>
    )
  }

  async function handleApprove(runId: string) {
    try {
      await approveRun.mutateAsync(runId)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not approve run')
    }
  }

  async function handleSubmit(runId: string) {
    setSubmitError(null)
    try {
      await submitRun.mutateAsync(runId)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not submit run to Check')
    }
  }

  async function handleTerminate(employeeId: string) {
    const today = new Date().toISOString().slice(0, 10)
    if (!window.confirm('Terminate this employee effective today?')) return
    try {
      await terminate.mutateAsync({ employeeId, terminationDate: today })
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not terminate employee')
    }
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--lp-text)', marginBottom: 4 }}>Payroll</h1>
        <p style={{ fontSize: 13, color: 'var(--lp-text-muted)' }}>
          Embedded payroll powered by Check. Available in VA, MD, DC, PA, DE, and WV.
        </p>
      </div>

      <PayrollEmployerSetupCard
        orgId={scope.orgId}
        clientId={scope.clientId}
        canConfigure={role.canRunPayroll}
      />

      {submitError && (
        <div style={{ padding: '10px 14px', background: 'var(--sem-red-bg)', border: '0.5px solid var(--sem-red)', borderRadius: 8, color: 'var(--sem-red)', fontSize: 13, marginBottom: 16 }}>
          ⚠ {submitError}
        </div>
      )}

      {/* ── Employees ──────────────────────────────────────────────── */}
      <section style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)' }}>Employees</div>
          {role.canRunPayroll && (
            <Button variant="primary" size="sm" onClick={() => setAddEmployeeOpen(true)}>+ Add employee</Button>
          )}
        </div>

        {employeesQuery.isLoading ? (
          <span style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>Loading employees…</span>
        ) : employeesQuery.error ? (
          <span style={{ fontSize: 12.5, color: 'var(--sem-red)' }}>{employeesQuery.error.message}</span>
        ) : (employeesQuery.data ?? []).length === 0 ? (
          <span style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>No employees yet.</span>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Name</Th><Th>Type</Th><Th>Status</Th><Th>State</Th>
                <Th>Compensation</Th><Th>Check sync</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {(employeesQuery.data ?? []).map(emp => (
                <tr key={emp.id}>
                  <Td>{emp.first_name} {emp.last_name}</Td>
                  <Td>{emp.employee_type === 'w2' ? 'W2' : '1099'}</Td>
                  <Td>
                    <Badge
                      label={PAYROLL_EMPLOYEE_STATUS_CONFIG[emp.status].label}
                      color={PAYROLL_EMPLOYEE_STATUS_CONFIG[emp.status].color}
                      bg={PAYROLL_EMPLOYEE_STATUS_CONFIG[emp.status].bg}
                    />
                  </Td>
                  <Td>{emp.residence_state}</Td>
                  <Td>${Number(emp.compensation_amount).toLocaleString()} / yr ({emp.compensation_basis})</Td>
                  <Td>{emp.provider_employee_id ? '✓ Synced' : 'Not synced'}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {role.canRunPayroll && !emp.provider_employee_id && emp.status !== 'terminated' && (
                        <Button variant="ghost" size="sm" onClick={() => setSyncTarget(emp)}>Sync to Check</Button>
                      )}
                      {role.canRunPayroll && emp.status !== 'terminated' && (
                        <Button variant="danger" size="sm" loading={terminate.isPending} onClick={() => handleTerminate(emp.id)}>Terminate</Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Runs ───────────────────────────────────────────────────── */}
      <section style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--lp-text)' }}>Payroll runs</div>
          {role.canRunPayroll && (
            <Button variant="primary" size="sm" onClick={() => setCreateRunOpen(true)}>+ Create run</Button>
          )}
        </div>

        {runsQuery.isLoading ? (
          <span style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>Loading runs…</span>
        ) : runsQuery.error ? (
          <span style={{ fontSize: 12.5, color: 'var(--sem-red)' }}>{runsQuery.error.message}</span>
        ) : (runsQuery.data ?? []).length === 0 ? (
          <span style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>No payroll runs yet.</span>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Period</Th><Th>Pay date</Th><Th>Status</Th>
                <Th>Gross</Th><Th>Employer taxes</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {(runsQuery.data ?? []).map(run => {
                const canApprove = role.canRunPayroll && run.status === 'draft' && !run.approved_by && run.prepared_by !== profile?.id
                const canSubmit  = role.canRunPayroll && run.status === 'draft' && !!run.approved_by
                return (
                  <tr key={run.id}>
                    <Td>{run.period_start} → {run.period_end}</Td>
                    <Td>{run.pay_date}</Td>
                    <Td>
                      <Badge
                        label={PAYROLL_RUN_STATUS_CONFIG[run.status].label}
                        color={PAYROLL_RUN_STATUS_CONFIG[run.status].color}
                        bg={PAYROLL_RUN_STATUS_CONFIG[run.status].bg}
                      />
                      {run.status === 'draft' && run.approved_by && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--sem-green)' }}>Approved</span>}
                    </Td>
                    <Td>{run.total_gross != null ? `$${Number(run.total_gross).toLocaleString()}` : '—'}</Td>
                    <Td>{run.total_employer_taxes != null ? `$${Number(run.total_employer_taxes).toLocaleString()}` : '—'}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {canApprove && (
                          <Button variant="ghost" size="sm" loading={approveRun.isPending} onClick={() => handleApprove(run.id)}>Approve</Button>
                        )}
                        {canSubmit && (
                          <Button variant="success" size="sm" loading={submitRun.isPending} onClick={() => handleSubmit(run.id)}>Submit to Check</Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <AddPayrollEmployeeDialog
        open={addEmployeeOpen}
        onClose={() => setAddEmployeeOpen(false)}
        orgId={scope.orgId}
        clientId={scope.clientId}
      />

      <CreatePayrollRunDialog
        open={createRunOpen}
        onClose={() => setCreateRunOpen(false)}
        orgId={scope.orgId}
        clientId={scope.clientId}
      />

      {syncTarget && (
        <SyncPayrollEmployeeDialog
          open={!!syncTarget}
          onClose={() => setSyncTarget(null)}
          orgId={scope.orgId}
          employeeId={syncTarget.id}
          employeeName={`${syncTarget.first_name} ${syncTarget.last_name}`}
        />
      )}
    </div>
  )
}

// ── Small presentational helpers ─────────────────────────────────────────

function Th({ children }: { children?: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--lp-text-muted)', borderBottom: '0.5px solid var(--lp-border)' }}>{children}</th>
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td style={{ padding: '10px', fontSize: 12.5, color: 'var(--lp-text)', borderBottom: '0.5px solid var(--lp-border)' }}>{children}</td>
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color, background: bg }}>
      {label}
    </span>
  )
}

const sectionCardStyle: React.CSSProperties = {
  padding: 16,
  background: 'var(--lp-surface)',
  border: '0.5px solid var(--lp-border-2)',
  borderRadius: 12,
  marginBottom: 16
}

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12
}

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse'
}
