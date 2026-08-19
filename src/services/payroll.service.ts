// PATH: src/services/payroll.service.ts
//
// Service layer for the LedgiProof Payroll module. Wraps all 14
// authenticated-callable payroll_* RPCs in strongly-typed async functions.
// Pure data layer — no React state here. Mirrors the pattern from
// estimate.service.ts.
//
// Provider-specific concerns (Check onboarding links, payroll submission)
// live exclusively in payroll-provider.adapter.ts — this file re-exports
// them so callers only need one import, but never talks to Check directly.
//
// payroll.employees / payroll.runs have no generated Row type (the
// `payroll` schema is RPC-only, not exposed via PostgREST — see
// types/payroll.ts's header comment), so list results are cast through the
// hand-authored row types after the RPC call.

import { db } from '../lib/supabase'
import { pruneRpcArgs } from '../lib/rpc-args'
import type {
  PayrollEmployee,
  PayrollRun,
  CreatePayrollEmployeeInput,
  CreatePayrollEmployeeResult,
  UpdatePayrollEmployeeInput,
  UpdatePayrollEmployeeResult,
  TerminatePayrollEmployeeResult,
  CreatePayrollRunInput,
  CreatePayrollRunResult,
  ApprovePayrollRunResult,
  PayrollRunStatusResult,
  PayrollPayStubResult,
  PayrollTaxDocumentsResult,
  SetPayrollAccountMappingInput,
  SetPayrollAccountMappingResult,
  CreatePayrollEmployerProfileResult,
  PayrollEmployerSyncState,
  PayrollEmployeeSyncState,
  PayrollPayFrequency
} from '../types/payroll'

export {
  startPayrollEmployerOnboarding,
  startPayrollEmployeeOnboarding,
  submitPayrollRunToProvider
} from './payroll-provider.adapter'

// ═════════════════════════════════════════════════════════════════════════════
// EMPLOYER PROFILE / ACCOUNT MAPPING
// ═════════════════════════════════════════════════════════════════════════════

/** Create or update the org's payroll employer profile (pay frequency, etc.) */
export async function createPayrollEmployerProfile(
  orgId: string,
  payFrequency: PayrollPayFrequency = 'biweekly'
): Promise<CreatePayrollEmployerProfileResult> {
  const { data, error } = await db.rpc('payroll_create_employer_profile', {
    p_org_id: orgId,
    p_pay_frequency: payFrequency
  })
  if (error) throw new Error(error.message)
  return data as unknown as CreatePayrollEmployerProfileResult
}

/**
 * Map the org's Cash / Payroll Expense / Payroll Tax Expense accounts.
 * Required before any run can be created (payroll_create_run enforces
 * onboarding_status = 'complete', which this RPC is what sets).
 */
export async function setPayrollAccountMapping(
  input: SetPayrollAccountMappingInput
): Promise<SetPayrollAccountMappingResult> {
  const { data, error } = await db.rpc('payroll_set_account_mapping', {
    p_org_id: input.org_id,
    p_cash_account_id: input.cash_account_id,
    p_payroll_expense_account_id: input.payroll_expense_account_id,
    p_payroll_tax_expense_account_id: input.payroll_tax_expense_account_id
  })
  if (error) throw new Error(error.message)
  return data as unknown as SetPayrollAccountMappingResult
}

/** Load the org's current Check sync state (used before calling startPayrollEmployerOnboarding) */
export async function getPayrollEmployerForSync(orgId: string): Promise<PayrollEmployerSyncState> {
  const { data, error } = await db.rpc('payroll_get_employer_for_sync', { p_org_id: orgId })
  if (error) throw new Error(error.message)
  return data as unknown as PayrollEmployerSyncState
}

// ═════════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ═════════════════════════════════════════════════════════════════════════════

export async function createPayrollEmployee(
  input: CreatePayrollEmployeeInput
): Promise<CreatePayrollEmployeeResult> {
  const { data, error } = await db.rpc('payroll_create_employee', {
    p_org_id:              input.org_id,
    // p_client_id (uuid, NO db default) accepts NULL for an org-level employee.
    // It must be SENT explicitly (as SQL NULL) — pruneRpcArgs would DROP a null
    // value, omitting a required param and making PostgREST fail to resolve the
    // function. The generated Args type over-narrows it to `string` (Supabase
    // doesn't express param nullability); cast documents that verified gap.
    p_client_id:           input.client_id as string,
    p_first_name:          input.first_name,
    p_last_name:           input.last_name,
    p_job_title:           input.job_title,
    p_department:          input.department,
    p_employee_type:       input.employee_type,
    p_hire_date:           input.hire_date,
    p_compensation_amount: input.compensation_amount,
    p_compensation_basis:  input.compensation_basis,
    p_residence_state:     input.residence_state,
    p_work_state:          input.work_state,
    // These two DO have DB DEFAULT NULL, so prune when absent (omit → default).
    ...pruneRpcArgs({
      p_residence_county:  input.residence_county ?? undefined,
      p_pa_psd_code:       input.pa_psd_code       ?? undefined
    })
  })
  if (error) throw new Error(error.message)
  return data as unknown as CreatePayrollEmployeeResult
}

export async function updatePayrollEmployee(
  input: UpdatePayrollEmployeeInput
): Promise<UpdatePayrollEmployeeResult> {
  const { data, error } = await db.rpc('payroll_update_employee', pruneRpcArgs({
    p_employee_id:                 input.employee_id,
    p_job_title:                   input.job_title                  ?? undefined,
    p_department:                  input.department                 ?? undefined,
    p_compensation_amount:         input.compensation_amount        ?? undefined,
    p_compensation_basis:          input.compensation_basis         ?? undefined,
    p_residence_state:             input.residence_state            ?? undefined,
    p_work_state:                  input.work_state                 ?? undefined,
    p_residence_county:            input.residence_county           ?? undefined,
    p_pa_psd_code:                 input.pa_psd_code                ?? undefined,
    p_reciprocity_exemption_type:  input.reciprocity_exemption_type ?? undefined
  }))
  if (error) throw new Error(error.message)
  return data as unknown as UpdatePayrollEmployeeResult
}

export async function terminatePayrollEmployee(
  employeeId: string,
  terminationDate: string
): Promise<TerminatePayrollEmployeeResult> {
  const { data, error } = await db.rpc('payroll_terminate_employee', {
    p_employee_id: employeeId,
    p_termination_date: terminationDate
  })
  if (error) throw new Error(error.message)
  return data as unknown as TerminatePayrollEmployeeResult
}

/** List all payroll employees for an org (RLS/authorize-gated inside the RPC) */
export async function listPayrollEmployees(orgId: string): Promise<PayrollEmployee[]> {
  const { data, error } = await db.rpc('payroll_list_employees', { p_org_id: orgId })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PayrollEmployee[]
}

/** Load an employee's Check sync state (used before calling startPayrollEmployeeOnboarding) */
export async function getPayrollEmployeeForSync(employeeId: string): Promise<PayrollEmployeeSyncState> {
  const { data, error } = await db.rpc('payroll_get_employee_for_sync', { p_employee_id: employeeId })
  if (error) throw new Error(error.message)
  return data as unknown as PayrollEmployeeSyncState
}

export async function getPayrollTaxDocuments(employeeId: string): Promise<PayrollTaxDocumentsResult> {
  const { data, error } = await db.rpc('payroll_get_tax_documents', { p_employee_id: employeeId })
  if (error) throw new Error(error.message)
  return data as unknown as PayrollTaxDocumentsResult
}

// ═════════════════════════════════════════════════════════════════════════════
// RUNS
// ═════════════════════════════════════════════════════════════════════════════

export async function createPayrollRun(input: CreatePayrollRunInput): Promise<CreatePayrollRunResult> {
  const { data, error } = await db.rpc('payroll_create_run', {
    p_org_id: input.org_id,
    // p_client_id (uuid, no db default) accepts NULL for an org-level run; the
    // generated Args type over-narrows it to `string`. Sent explicitly so a
    // null (org-level) run passes SQL NULL rather than omitting the param.
    p_client_id: input.client_id as string,
    p_period_start: input.period_start,
    p_period_end: input.period_end,
    p_pay_date: input.pay_date
  })
  if (error) throw new Error(error.message)
  return data as unknown as CreatePayrollRunResult
}

/**
 * Approves a draft run so it becomes eligible for submitPayrollRunToProvider.
 * Enforced server-side: the approver cannot be the same user who prepared
 * the run (segregation of duties), and super_admin (View As) is exempt
 * since that session is read-only anyway.
 */
export async function approvePayrollRun(runId: string): Promise<ApprovePayrollRunResult> {
  const { data, error } = await db.rpc('payroll_approve_run', { p_run_id: runId })
  if (error) throw new Error(error.message)
  return data as unknown as ApprovePayrollRunResult
}

export async function getPayrollRunStatus(runId: string): Promise<PayrollRunStatusResult> {
  const { data, error } = await db.rpc('payroll_get_run_status', { p_run_id: runId })
  if (error) throw new Error(error.message)
  return data as unknown as PayrollRunStatusResult
}

/** List all payroll runs for an org (RLS/authorize-gated inside the RPC) */
export async function listPayrollRuns(orgId: string): Promise<PayrollRun[]> {
  const { data, error } = await db.rpc('payroll_list_runs', { p_org_id: orgId })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PayrollRun[]
}

export async function getPayrollPayStub(lineItemId: string): Promise<PayrollPayStubResult> {
  const { data, error } = await db.rpc('payroll_get_paystub', { p_line_item_id: lineItemId })
  if (error) throw new Error(error.message)
  return data as unknown as PayrollPayStubResult
}
