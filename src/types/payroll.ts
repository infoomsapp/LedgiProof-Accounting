// PATH: src/types/payroll.ts
//
// Strict types for the LedgiProof Payroll module. Payroll data lives in its
// own Postgres schema (`payroll`), which is deliberately NOT exposed via
// PostgREST — only the curated payroll_* RPCs in `public` are callable, and
// those RPCs are the only entries in database.types.ts's generated
// Functions map. `payroll.employees` / `payroll.runs` themselves have no
// generated Row type (the SETOF-returning RPCs type as `unknown[]` because
// the `payroll` schema isn't in the generated Database type at all), so the
// row shapes below are hand-authored from the live schema (verified via
// Supabase MCP list_tables, not guessed) and used to cast those RPC results.
//
// Launch scope: VA / MD / DC / PA / DE / WV only. Solo/self-employed
// profile is explicitly OUT of payroll scope (per founder decision).
// Check (checkhq.com) is the embedded payroll processor — LedgiProof never
// stores SSN or bank account numbers; those live exclusively with Check.

// ── Enums (match Postgres enum/check-constraint values exactly) ────────────

export type SupportedPayrollState = 'VA' | 'MD' | 'DC' | 'PA' | 'DE' | 'WV'

export type PayrollEmployeeType = 'w2' | 'contractor_1099'

export type PayrollEmployeeStatus = 'onboarding' | 'active' | 'terminated'

export type PayrollCompensationBasis = 'salary' | 'hourly'

export type PayrollPayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export type PayrollReciprocityExemptionType = 'none' | 'md_mw507' | 'pa_rev419' | 'wv_it104'

export type PayrollRunStatus =
  | 'draft'
  | 'submitted'
  | 'provider_processing'
  | 'completed'
  | 'failed'
  | 'canceled'

export type PayrollOnboardingStatus = 'not_started' | 'in_progress' | 'complete'

// ── Row types (hand-authored — payroll schema is RPC-only, not in the
//    generated Database type) ───────────────────────────────────────────────

export interface PayrollEmployerProfile {
  id:                              string
  org_id:                          string
  provider_company_id:            string | null
  provider_workplace_id:          string | null
  pay_frequency:                  PayrollPayFrequency
  onboarding_status:              PayrollOnboardingStatus
  cash_account_id:                string | null
  payroll_expense_account_id:     string | null
  payroll_tax_expense_account_id: string | null
  created_at:                     string
  updated_at:                     string
}

export interface PayrollEmployee {
  id:                             string
  org_id:                         string
  client_id:                      string | null
  provider_employee_id:           string | null
  first_name:                     string
  last_name:                      string
  job_title:                      string | null
  department:                     string | null
  employee_type:                  PayrollEmployeeType
  status:                         PayrollEmployeeStatus
  hire_date:                      string
  termination_date:               string | null
  compensation_amount:            number   // annual figure — see payroll-submit-run for per-period conversion
  compensation_basis:             PayrollCompensationBasis
  residence_state:                SupportedPayrollState
  work_state:                     SupportedPayrollState
  residence_county:               string | null
  pa_psd_code:                    string | null
  reciprocity_exemption_type:     PayrollReciprocityExemptionType
  reciprocity_exemption_filed_at: string | null
  created_by:                     string
  created_at:                     string
  updated_at:                     string
}

export interface PayrollRun {
  id:                    string
  org_id:                string
  client_id:             string | null
  provider_run_id:       string | null
  period_start:          string
  period_end:            string
  pay_date:               string
  status:                PayrollRunStatus
  prepared_by:           string
  approved_by:           string | null
  approved_at:           string | null
  submitted_at:          string | null
  completed_at:          string | null
  failure_reason:        string | null
  total_gross:           number | null
  total_employer_taxes:  number | null
  total_net:             number | null
  created_at:            string
  updated_at:            string
}

// ── RPC input types ──────────────────────────────────────────────────────

export interface CreatePayrollEmployeeInput {
  org_id:              string
  client_id:           string | null
  first_name:          string
  last_name:           string
  job_title:           string
  department:          string
  employee_type:       PayrollEmployeeType
  hire_date:           string
  compensation_amount: number
  compensation_basis:  PayrollCompensationBasis
  residence_state:     SupportedPayrollState
  work_state:          SupportedPayrollState
  residence_county?:   string
  pa_psd_code?:        string
}

export interface UpdatePayrollEmployeeInput {
  employee_id:                  string
  job_title?:                   string
  department?:                  string
  compensation_amount?:         number
  compensation_basis?:          PayrollCompensationBasis
  residence_state?:             SupportedPayrollState
  work_state?:                  SupportedPayrollState
  residence_county?:            string
  pa_psd_code?:                 string
  reciprocity_exemption_type?:  PayrollReciprocityExemptionType
}

export interface CreatePayrollRunInput {
  org_id:       string
  client_id:    string | null
  period_start: string
  period_end:   string
  pay_date:      string
}

export interface SetPayrollAccountMappingInput {
  org_id:                          string
  cash_account_id:                string
  payroll_expense_account_id:     string
  payroll_tax_expense_account_id: string
}

// ── RPC result DTOs ──────────────────────────────────────────────────────

export interface CreatePayrollEmployeeResult { id: string }
export interface CreatePayrollEmployerProfileResult { id: string }
export interface CreatePayrollRunResult { id: string; status: 'draft' }
export interface ApprovePayrollRunResult { id: string; approved_by: string }
export interface TerminatePayrollEmployeeResult { id: string; status: 'terminated' }
export interface UpdatePayrollEmployeeResult { id: string }
export interface SetPayrollAccountMappingResult { org_id: string; onboarding_status: 'complete' }

/** Result of payroll_get_run_status — the full run row, or an authorization/not-found error */
export type PayrollRunStatusResult = PayrollRun | { error: string }

/** Result of payroll_get_paystub — display-only figures, never used for further math client-side */
export interface PayrollPayStub {
  employee_name:       string
  pay_date:            string
  period_start:        string
  period_end:          string
  gross_pay:           number
  federal_withholding: number
  state_withholding:   number
  local_withholding:   number
  fica_employee:       number
  other_deductions:    number
  net_pay:             number
}
export type PayrollPayStubResult = PayrollPayStub | { error: string }

export interface PayrollTaxDocuments {
  provider:              'check'
  provider_company_id:   string | null
  provider_employee_id:  string | null
}
export type PayrollTaxDocumentsResult = PayrollTaxDocuments | { error: string }

/** Result of payroll_get_employer_for_sync — what the employer sync Edge Function needs */
export interface PayrollEmployerSyncState {
  org_id:                 string
  legal_name:             string
  ein:                    string | null
  pay_frequency:          PayrollPayFrequency
  provider_company_id:    string | null
  provider_workplace_id:  string | null
}

/** Result of payroll_get_employee_for_sync — what the employee sync Edge Function needs */
export interface PayrollEmployeeSyncState {
  employee_id:            string
  org_id:                 string
  first_name:             string
  last_name:              string
  hire_date:              string
  residence_state:        SupportedPayrollState
  provider_employee_id:   string | null
  provider_company_id:    string
  provider_workplace_id:  string
}

// ── Edge Function contracts (LedgiProof <-> our own Edge Functions —
//    NOT the Check API directly; see payroll-provider.adapter.ts) ──────────

export interface SyncPayrollEmployerInput {
  org_id:             string
  signer_name:        string
  signer_title:       string
  signer_email:       string
  workplace_name?:    string
  workplace_address: {
    line1:       string
    line2?:      string
    city:        string
    state:       SupportedPayrollState
    postal_code: string
  }
}

export interface SyncPayrollEmployerResult {
  success:                boolean
  provider_company_id:    string
  provider_workplace_id:  string
  onboard_url:            string
}

export interface SyncPayrollEmployeeInput {
  employee_id: string
  email:       string
  dob:         string // YYYY-MM-DD
  residence: {
    line1:       string
    line2?:      string
    city:        string
    postal_code: string
  }
}

export interface SyncPayrollEmployeeResult {
  success:               boolean
  provider_employee_id:  string
  onboard_url:           string
}

export interface SubmitPayrollRunResult {
  success:            boolean
  run_id:             string
  check_payroll_id:   string
  status:             'submitted'
}

// ── UI configuration ─────────────────────────────────────────────────────

export const PAYROLL_SUPPORTED_STATES: Array<{ code: SupportedPayrollState; label: string }> = [
  { code: 'VA', label: 'Virginia' },
  { code: 'MD', label: 'Maryland' },
  { code: 'DC', label: 'Washington DC' },
  { code: 'PA', label: 'Pennsylvania' },
  { code: 'DE', label: 'Delaware' },
  { code: 'WV', label: 'West Virginia' }
]

export const PAYROLL_RUN_STATUS_CONFIG: Record<PayrollRunStatus, {
  label: string
  color: string
  bg:    string
}> = {
  draft:                { label: 'Draft',      color: 'var(--lp-text-muted)', bg: 'var(--lp-muted-bg)' },
  submitted:            { label: 'Submitted',  color: 'var(--lp-accent)',     bg: 'var(--sem-blue-bg)' },
  provider_processing:  { label: 'Processing', color: 'var(--sem-amber)',     bg: 'var(--sem-amber-bg)' },
  completed:            { label: 'Completed',  color: 'var(--sem-green)',     bg: 'var(--sem-green-bg)' },
  failed:               { label: 'Failed',     color: 'var(--sem-red)',       bg: 'var(--sem-red-bg)' },
  canceled:             { label: 'Canceled',   color: 'var(--lp-text-muted)', bg: 'var(--lp-muted-bg)' }
}

export const PAYROLL_EMPLOYEE_STATUS_CONFIG: Record<PayrollEmployeeStatus, {
  label: string
  color: string
  bg:    string
}> = {
  onboarding: { label: 'Onboarding', color: 'var(--sem-amber)', bg: 'var(--sem-amber-bg)' },
  active:     { label: 'Active',     color: 'var(--sem-green)', bg: 'var(--sem-green-bg)' },
  terminated: { label: 'Terminated', color: 'var(--lp-text-muted)', bg: 'var(--lp-muted-bg)' }
}

/** Type guard for the `{ error: string }` shape several RPCs return instead of throwing */
export function isPayrollRpcError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
}
