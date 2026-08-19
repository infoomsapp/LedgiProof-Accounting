// PATH: supabase/functions/send-client-invitation/index.ts
//
// Sends a branded portal invitation email to a client contact.
// Called by the frontend after create_client_portal_invitation RPC succeeds.
//
// Requires a valid JWT (bookkeeper must be authenticated).
// Reads RESEND_API_KEY from Supabase secrets.

import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' }
    })

  try {
    const body = await req.json().catch(() => null)
    const {
      to_email,
      invitation_url,
      client_name,
      firm_name,
      role,
      expires_at
    }: {
      to_email:       string
      invitation_url: string
      client_name:    string
      firm_name:      string
      role:           string
      expires_at:     string
    } = body ?? {}

    if (!to_email || !invitation_url || !client_name || !firm_name) {
      return j({ error: 'Missing required fields: to_email, invitation_url, client_name, firm_name' }, 400)
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to_email)) {
      return j({ error: 'Invalid email address' }, 400)
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('[send-client-invitation] RESEND_API_KEY not set')
      return j({ error: 'Email service not configured' }, 500)
    }

    const roleLabel = role === 'client_owner'
      ? 'Owner'
      : role === 'client_contact'
      ? 'Contact'
      : 'Viewer'

    const expiresDate = expires_at
      ? new Date(expires_at).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric'
        })
      : '7 days from now'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        from:    'LedgiProof <accounts@ledgiproof.com>',
        to:      [to_email],
        subject: `${firm_name} invited you to LedgiProof`,
        html:    buildInvitationEmail({ to_email, invitation_url, client_name, firm_name, role_label: roleLabel, expires_date: expiresDate })
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[send-client-invitation] Resend error:', res.status, errText)
      return j({ error: 'Failed to send invitation email' }, 500)
    }

    return j({ success: true })

  } catch (err) {
    console.error('[send-client-invitation] Unexpected error:', err)
    return j({ error: String(err) }, 500)
  }
})

// ── Email template ────────────────────────────────────────────────────────────

function buildInvitationEmail(p: {
  to_email:       string
  invitation_url: string
  client_name:    string
  firm_name:      string
  role_label:     string
  expires_date:   string
}): string {
  const safeUrl     = p.invitation_url.replace(/"/g, '&quot;')
  const safeName    = p.client_name.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeFirm    = p.firm_name.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeEmail   = p.to_email.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeRole    = p.role_label.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeExpires = p.expires_date.replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You're invited to LedgiProof</title>
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
                You've been invited to the client portal
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.65;">
                <strong style="color:#d1d5db;">${safeFirm}</strong> has invited
                <strong style="color:#d1d5db;">${safeEmail}</strong> to access the
                <strong style="color:#d1d5db;">${safeName}</strong> account on LedgiProof
                as a <strong style="color:#a78bfa;">${safeRole}</strong>.
              </p>

              <!-- Role pill -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:#1a1d2e;border:1px solid rgba(167,139,250,0.2);border-radius:8px;
                            padding:12px 16px;margin-bottom:24px;width:100%;">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Your access level</p>
                    <p style="margin:0;font-size:14px;font-weight:600;color:#a78bfa;">${safeRole}</p>
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
                      Accept invitation &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:#1a1d2e;border:1px solid rgba(255,255,255,0.06);border-radius:8px;
                            padding:14px 16px;margin-bottom:24px;width:100%;">
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
                <a href="mailto:accounts@ledgiproof.com"
                   style="color:#6b7280;text-decoration:none;">accounts@ledgiproof.com</a>
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
