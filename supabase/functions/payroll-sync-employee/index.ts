// PATH: supabase/functions/payroll-sync-employee/index.ts
//
// Creates a Check employee record for one payroll.employees row and
// generates that employee's own Onboard link, where THEY (not the
// employer, not LedgiProof) enter SSN and bank account details directly
// with Check's hosted UI.
//
// Verified against Check's live API reference:
//   POST /employees               (name, email, dob, residence, company,
//                                   workplaces, start_date — SSN is
//                                   OPTIONAL here and deliberately omitted)
//   POST /employees/{id}/onboard  (returns a one-time hosted onboarding URL
//                                   where the EMPLOYEE self-serves SSN +
//                                   bank account + payment method + W-4)
//
// payroll.employees only stores residence_state + residence_county (used
// for our own reciprocity/withholding logic) — it does NOT store dob,
// street address, or email, because those aren't needed for anything
// LedgiProof itself computes. Check's /employees endpoint requires a full
// residence object (line1/city/state/postal_code) and dob to clear the
// employee's onboarding blocking steps, so this function requires them as
// real caller input (e.g. from a "sync to Check" form) rather than
// guessing or defaulting them — same principle already applied throughout
// this module: no fabricated data.
//
// Only W2 employees are supported (enforced by payroll_get_employee_for_sync).
// 1099 contractors use a different Check object entirely and are out of
// scope for this pass — flagged, not silently mishandled.
//
// Deploy: supabase functions deploy payroll-sync-employee

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'

const CHECK_ENV      = Deno.env.get('CHECK_ENV') ?? 'sandbox'
const CHECK_BASE_URL = CHECK_ENV === 'production'
  ? 'https://api.checkhq.com'
  : 'https://sandbox.checkhq.com'
const CHECK_API_KEY  = Deno.env.get('CHECK_API_KEY')

const WRITE_ROLES = ['owner', 'admin']

interface EmployeeResidence {
  line1:       string
  line2?:      string
  city:        string
  postal_code: string
}

interface SyncRequestBody {
  employee_id: string
  email:       string
  dob:         string // YYYY-MM-DD
  residence:   EmployeeResidence
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
    const body = await req.json().catch(() => null) as SyncRequestBody | null
    if (!body?.employee_id || !body?.email || !body?.dob || !body?.residence) {
      return Response.json({
        error: 'employee_id, email, dob, and residence are all required'
      }, { status: 400, headers: cors })
    }
    const { line1, city, postal_code } = body.residence
    if (!line1 || !city || !postal_code) {
      return Response.json({ error: 'residence requires line1, city, postal_code' }, { status: 400, headers: cors })
    }

    // ── Load current sync state via the USER-scoped RPC — this both
    //    authorizes (owner/admin on the employee's org, or super_admin)
    //    and enforces w2-only + "employer already synced" preconditions
    //    inside the function body. ─────────────────────────────────────
    const { data: employee, error: employeeErr } = await supabaseUser.rpc('payroll_get_employee_for_sync', { p_employee_id: body.employee_id })
    if (employeeErr) {
      return Response.json({ error: safeMessage(employeeErr, 'Failed to look up the employee') }, { status: 400, headers: cors })
    }

    // Belt-and-suspenders role re-check, mirroring payroll-sync-employer /
    // payroll-submit-run's pattern (the RPC's payroll.authorize() already
    // enforces owner/admin, but we re-verify explicitly here rather than
    // relying solely on the RPC's internal exception message for a 403).
    const { data: membership } = await supabaseUser
      .from('organization_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', employee.org_id)
      .eq('is_active', true)
      .maybeSingle()

    const { data: profile } = await supabaseUser
      .from('profiles')
      .select('system_role')
      .eq('id', user.id)
      .maybeSingle()

    const isSuperAdmin = profile?.system_role === 'super_admin'
    if (!isSuperAdmin && (!membership || !WRITE_ROLES.includes(membership.role as string))) {
      return Response.json({ error: 'Your role cannot configure payroll for this organization' }, { status: 403, headers: cors })
    }

    let providerEmployeeId = employee.provider_employee_id as string | null

    // ── Step 1: create the Check employee if it doesn't exist yet ───────
    if (!providerEmployeeId) {
      const created = await checkFetch('/employees', {
        method: 'POST',
        body: JSON.stringify({
          first_name:  employee.first_name,
          last_name:   employee.last_name,
          email:       body.email,
          dob:         body.dob,
          company:     employee.provider_company_id,
          workplaces:  [employee.provider_workplace_id],
          start_date:  employee.hire_date,
          residence: {
            line1:       line1,
            line2:       body.residence.line2,
            city:        city,
            state:       employee.residence_state,
            postal_code: postal_code
          }
        })
      })
      providerEmployeeId = created.id as string

      const { error: setErr } = await supabaseAdmin.rpc('payroll_set_provider_employee_id', {
        p_employee_id: body.employee_id,
        p_provider_employee_id: providerEmployeeId
      })
      if (setErr) {
        console.error('[payroll-sync-employee] Failed to persist provider_employee_id after Check employee creation:', setErr)
        return Response.json({
          error: 'Check employee was created but could not be saved locally — contact support with employee id ' + providerEmployeeId
        }, { status: 500, headers: cors })
      }
    }

    // ── Step 2: generate a fresh Employee Onboard link — always, every
    //    call, since these are one-time links. This is where the employee
    //    themselves enters SSN, bank account, payment method, and W-4 /
    //    state withholding elections directly with Check — none of that
    //    ever touches LedgiProof's database. ────────────────────────────
    const onboard = await checkFetch(`/employees/${providerEmployeeId}/onboard`, { method: 'POST' })

    return Response.json({
      success:              true,
      provider_employee_id: providerEmployeeId,
      onboard_url:          onboard.url
    }, { headers: cors })

  } catch (err) {
    console.error('[payroll-sync-employee] Unexpected error:', err)
    return Response.json({ error: safeMessage(err, 'Failed to sync the employee') }, { status: 500, headers: cors })
  }
})
