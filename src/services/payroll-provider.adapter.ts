// PATH: src/services/payroll-provider.adapter.ts
//
// The ONLY frontend file that knows a payroll provider (Check / checkhq.com)
// is involved at all. Every other file in the app — payroll.service.ts,
// hooks, pages, components — talks exclusively to LedgiProof's own RPCs and
// to the three functions exported here, none of which mention "Check" in
// their name or shape. If LedgiProof ever swaps processors, this file (plus
// the three server-side Edge Functions it calls) is the entire blast radius
// on the frontend.
//
// These three Edge Functions are themselves thin — they call Check's real
// API server-side and never expose Check's request/response shapes verbatim
// to the browser (e.g. "onboard_url" here is Check's hosted onboarding
// link, but the caller doesn't need to know that; it just opens a URL).
//
// payroll-webhook is deliberately NOT wrapped here — it's server-to-server
// (Check calls it directly), never invoked from the frontend.

import { supabase } from '../lib/supabase'
import type {
  SyncPayrollEmployerInput,
  SyncPayrollEmployerResult,
  SyncPayrollEmployeeInput,
  SyncPayrollEmployeeResult,
  SubmitPayrollRunResult
} from '../types/payroll'
import { dbError } from '../lib/errors'

async function requireAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return session.access_token
}

async function invokeEdgeFunction<TResult>(
  functionName: string,
  body: Record<string, unknown>
): Promise<TResult> {
  const accessToken = await requireAccessToken()

  const res = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (res.error) throw dbError(res.error, 'The payroll provider request failed')

  const data = res.data as (TResult & { error?: string }) | { error: string }
  if ('error' in data && data.error) throw new Error(data.error)

  return data as TResult
}

/**
 * Onboards (or resumes onboarding for) an org's payroll employer profile
 * with the provider: creates the company + workplace shells if they don't
 * exist yet, then returns a fresh hosted onboarding link for the employer's
 * signatory to finish compliance setup (legal address, signatory, tax
 * parameters, filing authorization, bank account) directly with the
 * provider. LedgiProof never collects or stores that data itself.
 */
export async function startPayrollEmployerOnboarding(
  input: SyncPayrollEmployerInput
): Promise<SyncPayrollEmployerResult> {
  return invokeEdgeFunction<SyncPayrollEmployerResult>('payroll-sync-employer', input as unknown as Record<string, unknown>)
}

/**
 * Onboards (or resumes onboarding for) one payroll employee with the
 * provider: creates the employee shell if it doesn't exist yet, then
 * returns a fresh hosted onboarding link where the EMPLOYEE THEMSELVES
 * enters SSN, bank account, payment method, and tax withholding elections.
 * None of that ever touches LedgiProof's database.
 */
export async function startPayrollEmployeeOnboarding(
  input: SyncPayrollEmployeeInput
): Promise<SyncPayrollEmployeeResult> {
  return invokeEdgeFunction<SyncPayrollEmployeeResult>('payroll-sync-employee', input as unknown as Record<string, unknown>)
}

/**
 * Submits an approved payroll run to the provider for processing. Requires
 * the run to already be in 'draft' status with approved_by set (see
 * payroll.service.ts's approvePayrollRun) and every active employee to
 * already be onboarded with the provider — the Edge Function refuses with a
 * clear 409 otherwise rather than submitting a broken payload.
 */
export async function submitPayrollRunToProvider(runId: string): Promise<SubmitPayrollRunResult> {
  return invokeEdgeFunction<SubmitPayrollRunResult>('payroll-submit-run', { run_id: runId })
}
