// PATH: supabase/functions/send-staff-invitation/index.ts
//
// Sends a branded staff activation email via Resend when an owner/admin
// invites a new team member to their LedgiProof workspace.
//
// SECURITY: this function used to accept to_email/activation_url/org_name/
// role directly from the request body with no check that they corresponded
// to any real invitation the caller was authorized to send — any signed-in
// user (any org, any role) could make LedgiProof's own trusted domain send
// an arbitrarily-branded "invitation" to any email address with any link, a
// phishing relay. Fixed: the caller now only supplies invitation_id; every
// other field is looked up server-side from the real invitations row, using
// a Supabase client scoped to the CALLER's own JWT (not the service role) —
// RLS (`invitations_select`: is_org_member(org_id) OR invited_by=auth.uid())
// then does the actual authorization, the same policy the frontend's own
// reads already rely on. A caller with no access to that invitation's org
// (and who isn't the one who created it) gets zero rows back.
//
// Requires a valid JWT (caller must be authenticated).
// Reads RESEND_API_KEY from Supabase secrets.
//
// Deploy: supabase functions deploy send-staff-invitation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { reportToGovernance } from '../_shared/cgc-report.ts'
import { safeMessage } from '../_shared/errors.ts'

const ROLE_LABEL: Record<string, string> = {
  owner:      'Owner',
  admin:      'Administrator',
  accountant: 'Accountant',
  auditor:    'Auditor',
  approver:   'Approver',
  readonly:   'Read-only viewer',
}

const ALLOWED_ORIGINS = new Set([
  'https://app.ledgiproof.com',
  'https://ledgiproof.com',
  'http://localhost:5173',
  'http://localhost:4173',
])

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' }
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return j({ error: 'Missing Authorization header' }, 401)

    const body = await req.json().catch(() => null)
    const invitationId: string | undefined = body?.invitation_id
    if (!invitationId) return j({ error: 'Missing required field: invitation_id' }, 400)

    // Scoped to the CALLER's own JWT — RLS (invitations_select) is what
    // actually authorizes this lookup, not any check written here.
    const callerDb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await callerDb.auth.getUser()
    if (!user) return j({ error: 'Unauthorized' }, 401)

    // 10 sends per hour per caller — generous for real onboarding, a backstop
    // against using this function to spam Resend.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const allowed = await checkRateLimit(supabaseAdmin, `invite:${user.id}`, 10, 60 * 60)
    if (!allowed) return j({ error: 'Too many invitations sent — please try again later' }, 429)

    const { data: inv, error: invErr } = await callerDb
      .from('invitations')
      .select('email, role, token, status, expires_at, invited_by, org_id, organizations(name), profiles!invitations_invited_by_fkey(display_name)')
      .eq('id', invitationId)
      .eq('status', 'pending')
      .maybeSingle()

    if (invErr || !inv) {
      return j({ error: 'Invitation not found, not pending, or you do not have access to it' }, 404)
    }

    const origin = req.headers.get('Origin') ?? ''
    const safeOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.ledgiproof.com'
    const activationUrl = `${safeOrigin}/staff-activate/${inv.token}`

    const orgRow     = inv.organizations as unknown as { name: string | null } | null
    const inviterRow = inv.profiles as unknown as { display_name: string | null } | null
    const orgName     = orgRow?.name || 'your workspace'
    const roleLabel    = ROLE_LABEL[inv.role] ?? inv.role
    const invitedByName = inviterRow?.display_name ?? undefined

    const expiresDate = inv.expires_at
      ? new Date(inv.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '7 days from now'

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('[send-staff-invitation] RESEND_API_KEY not set')
      return j({ error: 'Email service not configured' }, 500)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        from:    'LedgiProof <support@ledgiproof.com>',
        to:      [inv.email],
        subject: `${orgName} invited you to join LedgiProof`,
        html:    buildEmail({
          to_email: inv.email, activation_url: activationUrl, org_name: orgName,
          role_label: roleLabel, invited_by_name: invitedByName, expires_date: expiresDate
        })
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[send-staff-invitation] Resend error:', res.status, errText)
      return j({ error: 'Failed to send invitation email' }, 500)
    }

    // Fire-and-forget visibility report — CGC Core has zero record of
    // invitation sends today. Never gates the response either way.
    reportToGovernance({
      org_id: inv.org_id,
      action: 'staff_invitation.send',
      input_data: { invitation_id: invitationId, role: inv.role },
      user_email: user.email ?? 'unknown@ledgiproof',
    }).catch(() => {})

    return j({ success: true })

  } catch (err) {
    console.error('[send-staff-invitation] Unexpected error:', err)
    return j({ error: safeMessage(err, 'Failed to send the invitation') }, 500)
  }
})

// ── Email template ────────────────────────────────────────────────────────────

function buildEmail(p: {
  to_email:         string
  activation_url:   string
  org_name:         string
  role_label:       string
  invited_by_name?: string
  expires_date:     string
}): string {
  const safeUrl     = p.activation_url.replace(/"/g, '&quot;')
  const safeOrg     = p.org_name.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeEmail   = p.to_email.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeRole    = p.role_label.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeExpires = p.expires_date.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeInviter = p.invited_by_name
    ? p.invited_by_name.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : null

  const inviterLine = safeInviter
    ? `<strong style="color:#d1d5db;">${safeInviter}</strong> at `
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You're invited to join ${safeOrg} on LedgiProof</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0d14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#0b0d14;padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:520px;background:#12141f;border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-right:4px;"><div style="width:8px;height:8px;border-radius:50%;background:#3b82f6;"></div></td>
                        <td style="padding-right:4px;"><div style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div></td>
                        <td style="padding-right:4px;"><div style="width:8px;height:8px;border-radius:50%;background:#f59e0b;"></div></td>
                        <td><div style="width:8px;height:8px;border-radius:50%;background:#ef4444;"></div></td>
                      </tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">LedgiProof</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 28px;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#ffffff;line-height:1.3;">
                You're invited to join the team
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.65;">
                ${inviterLine}<strong style="color:#d1d5db;">${safeOrg}</strong> has invited
                <strong style="color:#d1d5db;">${safeEmail}</strong> to join their
                workspace on LedgiProof as a <strong style="color:#a78bfa;">${safeRole}</strong>.
              </p>

              <!-- Role pill -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:#1a1d2e;border:1px solid rgba(167,139,250,0.2);border-radius:8px;
                            padding:12px 16px;margin-bottom:24px;width:100%;box-sizing:border-box;">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Your role</p>
                    <p style="margin:0;font-size:14px;font-weight:600;color:#a78bfa;">${safeRole}</p>
                  </td>
                </tr>
              </table>

              <!-- What happens note -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:#1a1d2e;border:1px solid rgba(59,130,246,0.15);border-radius:8px;
                            padding:12px 16px;margin-bottom:24px;width:100%;box-sizing:border-box;">
                <tr>
                  <td style="font-size:13px;color:#6b7280;line-height:1.6;">
                    &#8203; Clicking the button will let you set your name and password.
                    Your account will be created with the role shown above —
                    no plan selection required.
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#3b82f6;border-radius:8px;">
                    <a href="${safeUrl}"
                       style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;
                              color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                      Activate your account &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:#1a1d2e;border:1px solid rgba(255,255,255,0.06);border-radius:8px;
                            padding:14px 16px;margin-bottom:24px;width:100%;box-sizing:border-box;">
                <tr>
                  <td style="font-size:13px;color:#6b7280;line-height:1.6;">
                    &#8203; This invitation expires on <strong style="color:#9ca3af;">${safeExpires}</strong>.
                    If you weren't expecting this invitation, you can safely ignore this email.
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;word-break:break-all;">
                Button not working? Copy and paste this link into your browser:<br>
                <a href="${safeUrl}" style="color:#3b82f6;">${safeUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.7;text-align:center;">
                LedgiProof — Professional accounting software<br>
                Questions? Email us at
                <a href="mailto:support@ledgiproof.com"
                   style="color:#6b7280;text-decoration:none;">support@ledgiproof.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
