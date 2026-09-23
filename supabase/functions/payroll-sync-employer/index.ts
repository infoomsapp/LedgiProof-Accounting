// PATH: supabase/functions/payroll-sync-employer/index.ts
//
// Creates the Check company + workplace for an org's payroll employer
// profile, and generates a Check Onboard link for the employer's
// signatory to finish compliance setup (legal address, signatory,
// federal/state tax parameters, filing authorization forms, bank account
// + debit authorization) on CHECK'S OWN hosted UI.
//
// Deliberately does NOT try to collect/POST legal_address, signatory,
// tax parameters, or filing authorization ourselves — per Check's docs
// (docs.checkhq.com/docs/company-enrollment), that's a large compliance
// surface (KYB, Federal Form 8655, state-specific filing authorization
// forms, bank account verification) that Check's Company Onboard flow
// exists specifically so partners don't have to rebuild. Same principle
// already applied to employee SSN/bank data: keep regulated PII and
// compliance surface on Check's side, not ours.
//
// Verified against Check's live API reference:
//   POST /companies                    (minimal shell — legal_name, pay_frequency)
//   POST /companies/{id}/onboard       (returns a one-time hosted onboarding URL)
//   POST /workplaces                   (company, address)
//
// Deploy: supabase functions deploy payroll-sync-employer

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'

const CHECK_ENV      = Deno.env.get('CHECK_ENV') ?? 'sandbox'
const CHECK_BASE_URL = CHECK_ENV === 'production'
  ? 'https://api.checkhq.com'
  : 'https://sandbox.checkhq.com'
const CHECK_API_KEY  = Deno.env.get('CHECK_API_KEY')

const WRITE_ROLES = ['owner', 'admin']

interface WorkplaceAddress {
  line1:       string
  line2?:      string
  city:        string
  state:       string
  postal_code: string
}

interface SyncRequestBody {
  org_id:            string
  signer_name:       string
  signer_title:      string
  signer_email:      string
  workplace_name?:   string
  workplace_address: WorkplaceAddress
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
    if (!body?.org_id || !body?.signer_name || !body?.signer_title || !body?.signer_email || !body?.workplace_address) {
      return Response.json({
        error: 'org_id, signer_name, signer_title, signer_email, and workplace_address are all required'
      }, { status: 400, headers: cors })
    }
    const { line1, city, state, postal_code } = body.workplace_address
    if (!line1 || !city || !state || !postal_code) {
      return Response.json({ error: 'workplace_address requires line1, city, state, postal_code' }, { status: 400, headers: cors })
    }

    // ── Authorization: owner/admin on this org, or super_admin ──────────
    const { data: membership } = await supabaseUser
      .from('organization_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', body.org_id)
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

    // ── Load current sync state (user-facing RPC, re-checks authorize()) ─
    const { data: employer, error: employerErr } = await supabaseUser.rpc('payroll_get_employer_for_sync', { p_org_id: body.org_id })
    if (employerErr) {
      return Response.json({ error: safeMessage(employerErr, 'Failed to look up the employer') }, { status: 400, headers: cors })
    }

    let providerCompanyId = employer.provider_company_id as string | null
    let providerWorkplaceId = employer.provider_workplace_id as string | null

    // ── Step 1: create the Check company shell if it doesn't exist yet ──
    if (!providerCompanyId) {
      const company = await checkFetch('/companies', {
        method: 'POST',
        body: JSON.stringify({
          legal_name:     employer.legal_name,
          email:          body.signer_email,
          pay_frequency:  employer.pay_frequency
        })
      })
      providerCompanyId = company.id as string

      const { error: setCompanyErr } = await supabaseAdmin.rpc('payroll_set_provider_company_id', {
        p_org_id: body.org_id,
        p_provider_company_id: providerCompanyId
      })
      if (setCompanyErr) {
        console.error('[payroll-sync-employer] Failed to persist provider_company_id after Check company creation:', setCompanyErr)
        return Response.json({
          error: 'Check company was created but could not be saved locally — contact support with company id ' + providerCompanyId
        }, { status: 500, headers: cors })
      }
    }

    // ── Step 2: create the workplace if it doesn't exist yet ────────────
    if (!providerWorkplaceId) {
      const workplace = await checkFetch('/workplaces', {
        method: 'POST',
        body: JSON.stringify({
          company: providerCompanyId,
          name:    body.workplace_name ?? employer.legal_name,
          address: {
            line1:       line1,
            line2:       body.workplace_address.line2,
            city:        city,
            state:       state,
            postal_code: postal_code
          }
        })
      })
      providerWorkplaceId = workplace.id as string

      const { error: setWorkplaceErr } = await supabaseAdmin.rpc('payroll_set_provider_workplace_id', {
        p_org_id: body.org_id,
        p_provider_workplace_id: providerWorkplaceId
      })
      if (setWorkplaceErr) {
        console.error('[payroll-sync-employer] Failed to persist provider_workplace_id after Check workplace creation:', setWorkplaceErr)
        return Response.json({
          error: 'Check workplace was created but could not be saved locally — contact support with workplace id ' + providerWorkplaceId
        }, { status: 500, headers: cors })
      }
    }

    // ── Step 3: generate a fresh Company Onboard link — always, every
    //    call, since these are one-time links and the employer may need
    //    to resume/re-enter the hosted flow across multiple sessions ────
    const onboard = await checkFetch(`/companies/${providerCompanyId}/onboard`, {
      method: 'POST',
      body: JSON.stringify({
        signer_name:  body.signer_name,
        signer_title: body.signer_title,
        email:        body.signer_email
      })
    })

    return Response.json({
      success:               true,
      provider_company_id:    providerCompanyId,
      provider_workplace_id:  providerWorkplaceId,
      onboard_url:            onboard.url
    }, { headers: cors })

  } catch (err) {
    console.error('[payroll-sync-employer] Unexpected error:', err)
    return Response.json({ error: safeMessage(err, 'Failed to sync the employer') }, { status: 500, headers: cors })
  }
})
