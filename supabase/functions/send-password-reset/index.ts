// PATH: supabase/functions/send-password-reset/index.ts
//
// Public edge function — no JWT required (user is not logged in).
// 1. Validates the email address.
// 2. Calls supabase.auth.admin.generateLink({ type: 'recovery', … })
//    to produce a signed reset URL (token never exposed to the client).
// 3. Sends a branded LedgiProof email via Resend.
//
// Security notes:
//   · Always returns { success: true } even if the email is not registered
//     (prevents email enumeration).
//   · redirectTo is derived from the request Origin header and must be in
//     ALLOWED_REDIRECT_ORIGINS — never taken from the request body.
//   · RESEND_API_KEY is a Supabase secret (never in client code).
//
// Deploy: supabase functions deploy send-password-reset

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { safeMessage } from '../_shared/errors.ts'

const ALLOWED_REDIRECT_ORIGINS = new Set([
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
    const body = await req.json().catch(() => null)
    const email: string | undefined = body?.email

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return j({ error: 'Valid email required' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 3 requests per 15 minutes per email — same "always return success" story
    // as an unregistered email, so this can't be used to distinguish anything either.
    const allowed = await checkRateLimit(supabaseAdmin, `password-reset:${email.trim().toLowerCase()}`, 3, 15 * 60)
    if (!allowed) {
      return j({ success: true })
    }

    // Derive redirectTo from Origin (validated against allowlist)
    const origin = req.headers.get('Origin') ?? ''
    const safeOrigin = ALLOWED_REDIRECT_ORIGINS.has(origin)
      ? origin
      : 'https://app.ledgiproof.com'
    const redirectTo = `${safeOrigin}/reset-password`

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim().toLowerCase(),
      options: { redirectTo }
    })

    if (error || !data?.properties?.action_link) {
      // Intentional silent fail — never reveal whether the email exists.
      console.error('[send-password-reset] generateLink:', error?.message ?? 'no action_link')
      return j({ success: true })
    }

    const resetLink = data.properties.action_link
    const resendKey = Deno.env.get('RESEND_API_KEY')

    if (!resendKey) {
      console.error('[send-password-reset] RESEND_API_KEY secret not set')
      return j({ error: 'Email service not configured' }, 500)
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'LedgiProof <support@ledgiproof.com>',
        to:   [email],
        subject: 'Reset your LedgiProof password',
        html: buildEmailHtml(resetLink, email)
      })
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('[send-password-reset] Resend error:', resendRes.status, errText)
      return j({ error: 'Failed to send email' }, 500)
    }

    return j({ success: true })

  } catch (err) {
    console.error('[send-password-reset] Unexpected error:', err)
    return j({ error: safeMessage(err, 'Failed to send the reset email') }, 500)
  }
})

// ── Email template ────────────────────────────────────────────────────────────

function buildEmailHtml(resetLink: string, toEmail: string): string {
  const safeLink = resetLink.replace(/"/g, '&quot;')
  // toEmail is the caller-submitted "email" -- the format regex upstream
  // allows <, >, and other HTML-special chars (it only excludes whitespace
  // and @), so this must be escaped before going into the HTML body, same
  // as every interpolated field in send-client-invitation's template.
  const safeEmail = toEmail.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset your LedgiProof password</title>
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
                    <!-- Semaphore dots -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-right:4px;">
                          <div style="width:8px;height:8px;border-radius:50%;background:#3b82f6;"></div>
                        </td>
                        <td style="padding-right:4px;">
                          <div style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div>
                        </td>
                        <td style="padding-right:4px;">
                          <div style="width:8px;height:8px;border-radius:50%;background:#f59e0b;"></div>
                        </td>
                        <td>
                          <div style="width:8px;height:8px;border-radius:50%;background:#ef4444;"></div>
                        </td>
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
                Reset your password
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.65;">
                We received a request to reset the password for the LedgiProof account
                associated with <strong style="color:#d1d5db;">${safeEmail}</strong>.
                Click the button below to choose a new password.
              </p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#3b82f6;border-radius:8px;">
                    <a href="${safeLink}"
                       style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;
                              color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                      Reset password &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Warnings -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:#1a1d2e;border:1px solid rgba(255,255,255,0.06);border-radius:8px;
                            padding:14px 16px;margin-bottom:24px;width:100%;">
                <tr>
                  <td style="font-size:13px;color:#6b7280;line-height:1.6;">
                    &#8203; This link expires in <strong style="color:#9ca3af;">1 hour</strong>.
                    If you didn't request a password reset, you can safely ignore this email —
                    your password will remain unchanged.
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;word-break:break-all;">
                Button not working? Copy and paste this link into your browser:<br>
                <a href="${safeLink}" style="color:#3b82f6;">${safeLink}</a>
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
