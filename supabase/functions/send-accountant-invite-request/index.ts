// PATH: supabase/functions/send-accountant-invite-request/index.ts
//
// Sends an email asking a named accountant to add the requester as a client
// on LedgiProof. This is a referral, not an access grant: a solo user has no
// mechanism to grant themselves org membership to anyone else, so the only
// honest thing this can do is ask the accountant to initiate the real,
// existing flow (AddClientDialog + client-portal invitation) from their side.
//
// SECURITY: same pattern as send-client-invitation -- the caller supplies
// only request_id; every other field is looked up server-side from the real
// accountant_invite_requests row, using a Supabase client scoped to the
// CALLER's own JWT. RLS (is_org_member(org_id)) is what actually authorizes
// the lookup, not any check written here. A caller with no membership in
// that request's org gets zero rows back.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'

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
    const requestId: string | undefined = body?.request_id
    if (!requestId) return j({ error: 'Missing required field: request_id' }, 400)

    const callerDb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await callerDb.auth.getUser()
    if (!user) return j({ error: 'Unauthorized' }, 401)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const allowed = await checkRateLimit(supabaseAdmin, `accountant-invite:${user.id}`, 5, 60 * 60)
    if (!allowed) return j({ error: 'Too many requests sent — please try again later' }, 429)

    const { data: reqRow, error: reqErr } = await callerDb
      .from('accountant_invite_requests')
      .select('accountant_email, accountant_name, note, status, org_id, organizations(name)')
      .eq('id', requestId)
      .eq('status', 'pending')
      .maybeSingle()

    if (reqErr || !reqRow) {
      return j({ error: 'Request not found, already sent, or you do not have access to it' }, 404)
    }

    const orgRow = reqRow.organizations as unknown as { name: string | null } | null
    const requesterName = orgRow?.name || user.email || 'A LedgiProof user'
    const requesterEmail = user.email ?? ''
    const accountantName = (reqRow.accountant_name as string | null) || 'there'

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('[send-accountant-invite-request] RESEND_API_KEY not set')
      return j({ error: 'Email service not configured' }, 500)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        from:    'LedgiProof <accounts@ledgiproof.com>',
        to:      [reqRow.accountant_email as string],
        reply_to: requesterEmail || undefined,
        subject: `${requesterName} would like you to manage their books on LedgiProof`,
        html:    buildRequestEmail({
          accountant_name: accountantName,
          requester_name:  requesterName,
          requester_email: requesterEmail,
          note:            (reqRow.note as string | null) ?? undefined,
        })
      })
    })

    const nowIso = new Date().toISOString()

    if (!res.ok) {
      const errText = await res.text()
      console.error('[send-accountant-invite-request] Resend error:', res.status, errText)
      await supabaseAdmin
        .from('accountant_invite_requests')
        .update({ status: 'failed' })
        .eq('id', requestId)
      return j({ error: 'Failed to send the request email' }, 500)
    }

    await supabaseAdmin
      .from('accountant_invite_requests')
      .update({ status: 'sent', sent_at: nowIso })
      .eq('id', requestId)

    return j({ success: true })

  } catch (err) {
    console.error('[send-accountant-invite-request] Unexpected error:', err)
    return j({ error: safeMessage(err, 'Failed to send the request') }, 500)
  }
})

function buildRequestEmail(p: {
  accountant_name: string
  requester_name:  string
  requester_email: string
  note?:           string
}): string {
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeAccountant = esc(p.accountant_name)
  const safeRequester  = esc(p.requester_name)
  const safeEmail      = esc(p.requester_email)
  const noteBlock = p.note
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
             style="background:#1a1d2e;border:1px solid rgba(255,255,255,0.06);border-radius:8px;
                    padding:14px 16px;margin-bottom:24px;width:100%;">
         <tr><td style="font-size:13px;color:#9ca3af;line-height:1.6;">"${esc(p.note)}"</td></tr>
       </table>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Someone wants you as their accountant on LedgiProof</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0d14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#0b0d14;padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:520px;background:#12141f;border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">LedgiProof</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 28px;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#ffffff;line-height:1.3;">
                Hi ${safeAccountant},
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.65;">
                <strong style="color:#d1d5db;">${safeRequester}</strong>
                (${safeEmail}) is using LedgiProof to track their books and would like
                you to manage their account as their accountant.
              </p>
              ${noteBlock}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:#3b82f6;border-radius:8px;">
                    <a href="https://app.ledgiproof.com/signup"
                       style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;
                              color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                      Set up your firm on LedgiProof &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                Once you have a firm workspace, add ${safeEmail} as a client from your
                dashboard and LedgiProof will invite them to your client portal.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.7;text-align:center;">
                LedgiProof — Professional accounting software<br>
                Questions? Email us at
                <a href="mailto:accounts@ledgiproof.com" style="color:#6b7280;text-decoration:none;">accounts@ledgiproof.com</a>
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
