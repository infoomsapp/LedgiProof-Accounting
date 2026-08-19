// PATH: src/hooks/usePayroll.ts
//
// React Query hooks for the LedgiProof Payroll module. Pattern matches
// useEstimates.ts. All mutations invalidate the relevant query keys so the
// Payroll page refreshes automatically after every write.
//
// Provider (Check) onboarding/submission mutations are included here too —
// they call payroll-provider.adapter.ts, never Check directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createPayrollEmployerProfile,
  setPayrollAccountMapping,
  getPayrollEmployerForSync,
  createPayrollEmployee,
  updatePayrollEmployee,
  terminatePayrollEmployee,
  listPayrollEmployees,
  getPayrollEmployeeForSync,
  getPayrollTaxDocuments,
  createPayrollRun,
  approvePayrollRun,
  getPayrollRunStatus,
  listPayrollRuns,
  getPayrollPayStub,
  startPayrollEmployerOnboarding,
  startPayrollEmployeeOnboarding,
  submitPayrollRunToProvider
} from '../services/payroll.service'
import type {
  CreatePayrollEmployeeInput,
  UpdatePayrollEmployeeInput,
  CreatePayrollRunInput,
  SetPayrollAccountMappingInput,
  SyncPayrollEmployerInput,
  SyncPayrollEmployeeInput,
  PayrollPayFrequency
} from '../types/payroll'

// ── Query keys ────────────────────────────────────────────────────────────

export const payrollKeys = {
  employerSync:  (orgId: string)     => ['payroll', 'employer-sync', orgId] as const,
  employees:     (orgId: string)     => ['payroll', 'employees', orgId] as const,
  employeeSync:  (employeeId: string) => ['payroll', 'employee-sync', employeeId] as const,
  taxDocuments:  (employeeId: string) => ['payroll', 'tax-documents', employeeId] as const,
  runs:          (orgId: string)     => ['payroll', 'runs', orgId] as const,
  runStatus:     (runId: string)     => ['payroll', 'run-status', runId] as const,
  paystub:       (lineItemId: string) => ['payroll', 'paystub', lineItemId] as const
}

// ═════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Employer's payroll config + Check sync state. Throws (React Query surfaces
 * as `error`) if the employer profile hasn't been created yet — the page
 * treats that as "show the setup flow", not a fatal error.
 */
export function usePayrollEmployerSync(orgId: string | null | undefined) {
  return useQuery({
    queryKey: payrollKeys.employerSync(orgId ?? ''),
    queryFn:  () => getPayrollEmployerForSync(orgId!),
    enabled:  !!orgId,
    retry:    false,
    staleTime: 10_000
  })
}

export function usePayrollEmployees(orgId: string | null | undefined) {
  return useQuery({
    queryKey: payrollKeys.employees(orgId ?? ''),
    queryFn:  () => listPayrollEmployees(orgId!),
    enabled:  !!orgId,
    staleTime: 10_000
  })
}

export function usePayrollEmployeeSync(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: payrollKeys.employeeSync(employeeId ?? ''),
    queryFn:  () => getPayrollEmployeeForSync(employeeId!),
    enabled:  !!employeeId,
    retry:    false,
    staleTime: 10_000
  })
}

export function usePayrollTaxDocuments(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: payrollKeys.taxDocuments(employeeId ?? ''),
    queryFn:  () => getPayrollTaxDocuments(employeeId!),
    enabled:  !!employeeId
  })
}

export function usePayrollRuns(orgId: string | null | undefined) {
  return useQuery({
    queryKey: payrollKeys.runs(orgId ?? ''),
    queryFn:  () => listPayrollRuns(orgId!),
    enabled:  !!orgId,
    staleTime: 10_000
  })
}

export function usePayrollRunStatus(runId: string | null | undefined) {
  return useQuery({
    queryKey: payrollKeys.runStatus(runId ?? ''),
    queryFn:  () => getPayrollRunStatus(runId!),
    enabled:  !!runId,
    staleTime: 5_000
  })
}

export function usePayrollPayStub(lineItemId: string | null | undefined) {
  return useQuery({
    queryKey: payrollKeys.paystub(lineItemId ?? ''),
    queryFn:  () => getPayrollPayStub(lineItemId!),
    enabled:  !!lineItemId
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTATIONS — Employer / account mapping
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatePayrollEmployerProfile(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payFrequency: PayrollPayFrequency) => createPayrollEmployerProfile(orgId, payFrequency),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.employerSync(orgId) })
    }
  })
}

export function useSetPayrollAccountMapping(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SetPayrollAccountMappingInput) => setPayrollAccountMapping(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.employerSync(orgId) })
    }
  })
}

export function useStartPayrollEmployerOnboarding(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SyncPayrollEmployerInput) => startPayrollEmployerOnboarding(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.employerSync(orgId) })
    }
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTATIONS — Employees
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatePayrollEmployee(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePayrollEmployeeInput) => createPayrollEmployee(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.employees(orgId) })
    }
  })
}

export function useUpdatePayrollEmployee(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdatePayrollEmployeeInput) => updatePayrollEmployee(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: payrollKeys.employees(orgId) })
      qc.invalidateQueries({ queryKey: payrollKeys.employeeSync(vars.employee_id) })
    }
  })
}

export function useTerminatePayrollEmployee(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { employeeId: string; terminationDate: string }) =>
      terminatePayrollEmployee(vars.employeeId, vars.terminationDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.employees(orgId) })
    }
  })
}

export function useStartPayrollEmployeeOnboarding(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SyncPayrollEmployeeInput) => startPayrollEmployeeOnboarding(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: payrollKeys.employees(orgId) })
      qc.invalidateQueries({ queryKey: payrollKeys.employeeSync(vars.employee_id) })
    }
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// MUTATIONS — Runs
// ═════════════════════════════════════════════════════════════════════════════

export function useCreatePayrollRun(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePayrollRunInput) => createPayrollRun(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.runs(orgId) })
    }
  })
}

export function useApprovePayrollRun(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => approvePayrollRun(runId),
    onSuccess: (_, runId) => {
      qc.invalidateQueries({ queryKey: payrollKeys.runs(orgId) })
      qc.invalidateQueries({ queryKey: payrollKeys.runStatus(runId) })
    }
  })
}

export function useSubmitPayrollRunToProvider(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => submitPayrollRunToProvider(runId),
    onSuccess: (_, runId) => {
      qc.invalidateQueries({ queryKey: payrollKeys.runs(orgId) })
      qc.invalidateQueries({ queryKey: payrollKeys.runStatus(runId) })
    }
  })
}
