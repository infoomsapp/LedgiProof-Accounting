// PATH: supabase/functions/payroll-submit-run/index.ts
//
// Submits an approved LedgiProof payroll run to Check (the embedded
// payroll processor). Real API calls, verified against Check's live
// OpenAPI schema and docs (docs.checkhq.com) — not guessed.
//
// Flow (mirrors Check's actual payroll lifecycle: draft → preview → pending):
//   1. Verify caller identity + role (owner/admin) for the run's org —
//      same RLS-mirroring pattern as resolve-transaction: never trust a
//      client-supplied role, always re-check organization_memberships.
//   2. Pull the submission payload via the SERVICE-ROLE-only RPC
//      payroll_get_run_for_submission (never callable directly from a
//      browser — see the REVOKE/GRANT in the payroll_system_rpcs
//      migration).
//   3. Hard guard: every employee must already have a provider_employee_id
//      and the employer must have a provider_company_id + provider_workplace_id.
//      Employer/employee sync-to-Check is a separate, not-yet-built piece
//      of work — this function refuses loudly rather than silently
//      submitting a broken payload.
//   4. POST /payrolls (create, include_items=true)
//   5. POST /payrolls/{id}/preview (Check requires a succeeded preview
//      before a payroll can be approved)
//   6. POST /payrolls/{id}/approve
//   7. payroll_mark_run_submitted(run_id, check_payroll_id)
//
// Only SALARY employees are supported in this pass — HOURLY employees
// need a timesheet/hours-worked input this schema does not yet have.
// Flagged explicitly below, not silently mishandled.
//
// Deploy: supabase functions deploy payroll-submit-run

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'

const CHECK_ENV      = Deno.env.get('CHECK_ENV') ?? 'sandbox' // 'sandbox' | 'production'
const CHECK_BASE_URL = CHECK_ENV === 'production'
  ? 'https://api.checkhq.com'
  : 'https://sandbox.checkhq.com'
const CHECK_API_KEY  = Deno.env.get('CHECK_API_KEY')

const WRITE_ROLES = ['owner', 'admin']

const PERIODS_PER_YEAR: Record<string, number> = {
  weekly:       52,
  biweekly:     26,
  semimonthly:  24,
  monthly:      12
}

interface SubmissionEmployee {
  employee_id:            string
  provider_employee_id:   string | null
  first_name:             string
  last_name:              string
  compensation_amount:    string
  compensation_basis:     'salary' | 'hourly'
  residence_state:        string
  work_state:              string
}

interface SubmissionPayload {
  run_id:                 string
  org_id:                 string
  provider_company_id:    string | null
  provider_workplace_id:  string | null
  pay_frequency:          string
  ein:                    string | null
  period_start:           string
  period_end:             string
  pay_date:                string
  employees:                SubmissionEmployee[]
}

async function checkFetch(path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${CHECK_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${CHECK_API_KEY}`,
      'Content-Type':  'application/json',
      ...(init.headers ?? {})
    }
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = body?.error?.message ?? `Check API error (${res.status})`
    throw new Error(message)
  }
  return body
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    if (!CHECK_API_KEY) {
      return Response.json({ error: 'CHECK_API_KEY is not configured' }, { status: 500, headers: cors })
    }

    // ── Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })
    }

    // ── Request body ────────────────────────────────────────────────────
    const body = await req.json().catch(() => null)
    const runId = body?.run_id as string | undefined
    if (!runId || typeof runId !== 'string') {
      return Response.json({ error: 'run_id required' }, { status: 400, headers: cors })
    }

    // ── Load run status through the USER-scoped client's RPC ─────────────
    // payroll_get_run_status internally checks payroll.authorize() — if
    // this returns an error, the caller has no standing on this run at all.
    const { data: statusData, error: statusErr } = await supabaseUser.rpc('payroll_get_run_status', { p_run_id: runId })
    if (statusErr) {
      return Response.json({ error: safeMessage(statusErr, 'Failed to update the run status') }, { status: 500, headers: cors })
    }
    if (statusData?.error) {
      return Response.json({ error: statusData.error }, { status: 403, headers: cors })
    }

    const orgId = statusData.org_id as string
    if (statusData.status !== 'draft' || !statusData.approved_by) {
      return Response.json({ error: 'Payroll run is not approved and ready to submit' }, { status: 409, headers: cors })
    }

    // ── Stricter role gate: submission is owner/admin only, not merely
    //    "can view" (which payroll_get_run_status also allows accountant/
    //    auditor to do). Mirrors resolve-transaction's WRITE_ROLES check.
    const { data: membership } = await supabaseUser
      .from('organization_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle()

    const { data: profile } = await supabaseUser
      .from('profiles')
      .select('system_role')
      .eq('id', user.id)
      .maybeSingle()

    const isSuperAdmin = profile?.system_role === 'super_admin'
    if (!isSuperAdmin && (!membership || !WRITE_ROLES.includes(membership.role as string))) {
      return Response.json({ error: 'Your role cannot submit payroll for this organization' }, { status: 403, headers: cors })
    }

    // ── Pull the full submission payload via the service-role-only RPC ──
    const { data: submission, error: subErr } = await supabaseAdmin
      .rpc('payroll_get_run_for_submission', { p_run_id: runId }) as { data: SubmissionPayload | null, error: any }

    if (subErr || !submission) {
      return Response.json({ error: safeMessage(subErr, 'Could not load run for submission') }, { status: 500, headers: cors })
    }

    // ── Hard prerequisite guard — employer/employee Check sync ──────────
    // This function does not (yet) create Check companies/workplaces/
    // employees itself — that is a separate onboarding sync step. Refuse
    // clearly rather than submit an incomplete payload.
    if (!submission.provider_company_id) {
      return Response.json({
        error: 'This organization has not been synced to Check yet (no provider_company_id). Complete Check employer onboarding before running payroll.'
      }, { status: 409, headers: cors })
    }

    const unsyncedEmployees = submission.employees.filter(e => !e.provider_employee_id)
    if (unsyncedEmployees.length > 0) {
      return Response.json({
        error: 'One or more employees have not been synced to Check yet',
        unsynced_employee_ids: unsyncedEmployees.map(e => e.employee_id)
      }, { status: 409, headers: cors })
    }

    const hourlyEmployees = submission.employees.filter(e => e.compensation_basis === 'hourly')
    if (hourlyEmployees.length > 0) {
      return Response.json({
        error: 'Hourly employees are not yet supported (no hours-worked input exists in this version). Remove them from this run or mark them inactive.',
        hourly_employee_ids: hourlyEmployees.map(e => e.employee_id)
      }, { status: 409, headers: cors })
    }

    if (!submission.provider_workplace_id) {
      return Response.json({
        error: 'This organization has no synced Check workplace yet. Complete Check employer onboarding before running payroll.'
      }, { status: 409, headers: cors })
    }

    const periodsPerYear = PERIODS_PER_YEAR[submission.pay_frequency] ?? 26

    // ── Build the real Check /payrolls payload ───────────────────────────
    // Salary compensation_amount is stored as an ANNUAL figure; Check
    // wants the amount actually earned in THIS pay period.
    const items = submission.employees.map(e => {
      const perPeriodGross = (Number(e.compensation_amount) / periodsPerYear).toFixed(2)
      return {
        employee: e.provider_employee_id,
        earnings: [{
          type:      'salary',
          workplace: submission.provider_workplace_id,
          amount:    perPeriodGross
        }]
      }
    })

    // 1) Create the payroll (draft)
    const payroll = await checkFetch('/payrolls?include_items=true', {
      method: 'POST',
      body: JSON.stringify({
        company:      submission.provider_company_id,
        period_start: submission.period_start,
        period_end:   submission.period_end,
        payday:       submission.pay_date,
        pay_frequency: submission.pay_frequency,
        items
      })
    })

    const checkPayrollId = payroll.id as string

    // 2) Preview — per Check's docs, approve requires preview.status
    //    === 'succeeded'. Refuse to approve otherwise rather than guess.
    const preview = await checkFetch(`/payrolls/${checkPayrollId}/preview`, { method: 'POST' })
    if (preview?.preview?.status !== 'succeeded') {
      return Response.json({
        error: 'Payroll preview did not succeed',
        preview: preview?.preview ?? null,
        warnings: preview?.warnings ?? null
      }, { status: 422, headers: cors })
    }

    // 3) Approve — moves Check's payroll to `pending`, kicks off the real
    //    ACH pipeline on Check's side (or the sandbox simulation of it).
    await checkFetch(`/payrolls/${checkPayrollId}/approve`, { method: 'POST' })

    // ── Mark our own run as submitted (service-role RPC) ─────────────────
    const { error: markErr } = await supabaseAdmin.rpc('payroll_mark_run_submitted', {
      p_run_id: runId,
      p_provider_run_id: checkPayrollId
    })
    if (markErr) {
      // The Check payroll is already approved and real money is (or will
      // be, depending on environment) moving — log loudly rather than
      // fail the response, since the webhook handler will still be able
      // to complete the run later based on Check's own events even if
      // this particular status write failed.
      console.error('[payroll-submit-run] payroll_mark_run_submitted failed after Check approval:', markErr)
    }

    return Response.json({
      success: true,
      run_id: runId,
      check_payroll_id: checkPayrollId,
      status: 'submitted'
    }, { headers: cors })

  } catch (err) {
    console.error('[payroll-submit-run] Unexpected error:', err)
    return Response.json({ error: safeMessage(err, 'Failed to submit the payroll run') }, { status: 500, headers: cors })
  }
})
