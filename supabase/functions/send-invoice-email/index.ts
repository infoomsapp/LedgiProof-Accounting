// PATH: supabase/functions/send-invoice-email/index.ts
//
// Emails a client their invoice's public pay link. Closes the last manual
// step in "send an invoice": before this, markInvoiceSent() only generated
// the link and the accountant had to copy-paste it somewhere themselves.
//
// SECURITY: same pattern as send-client-invitation -- the caller supplies
// only invoice_id; every other field (client email, org name/branding, the
// public_token) is looked up server-side from the real invoices row, using
// a Supabase client scoped to the CALLER's own JWT. RLS (is_org_member(org_id)
// on invoices) is what actually authorizes the lookup, not any check written
// here. A caller with no membership in that invoice's org gets zero rows back.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'

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
    const invoiceId: string | undefined = body?.invoice_id
    if (!invoiceId) return j({ error: 'Missing required field: invoice_id' }, 400)

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
    const allowed = await checkRateLimit(supabaseAdmin, `invoice-email:${user.id}`, 20, 60 * 60)
    if (!allowed) return j({ error: 'Too many invoice emails sent — please try again later' }, 429)

    const { data: inv, error: invErr } = await callerDb
      .from('invoices')
      .select(`
        invoice_number, total, currency, due_date, status, public_token, org_id,
        clients(display_name, company_name, email),
        organizations(name, logo_url, brand_color)
      `)
      .eq('id', invoiceId)
      .maybeSingle()

    if (invErr || !inv) {
      return j({ error: 'Invoice not found or you do not have access to it' }, 404)
    }
    if (inv.status === 'void') {
      return j({ error: 'This invoice has been voided' }, 400)
    }
    if (!inv.public_token) {
      return j({ error: 'This invoice has no payment link yet — send it first' }, 400)
    }

    const clientRow = inv.clients as unknown as { display_name: string | null; company_name: string | null; email: string | null } | null
    const orgRow    = inv.organizations as unknown as { name: string | null; logo_url: string | null; brand_color: string | null } | null

    if (!clientRow?.email) {
      return j({ error: 'This client has no email address on file' }, 400)
    }

    const origin = req.headers.get('Origin') ?? ''
    const safeOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.ledgiproof.com'
    const payUrl = `${safeOrigin}/i/${inv.public_token}`

    const clientName = clientRow.company_name || clientRow.display_name || 'there'
    const firmName    = orgRow?.name || 'Your bookkeeper'
    const accent       = orgRow?.brand_color || '#3b82f6'
    const dueDate = inv.due_date
      ? new Date(inv.due_date as string).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('[send-invoice-email] RESEND_API_KEY not set')
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
        to:      [clientRow.email],
        subject: `Invoice ${inv.invoice_number} from ${firmName}`,
        html:    buildInvoiceEmail({
          client_name:     clientName,
          firm_name:       firmName,
          invoice_number:  inv.invoice_number as string,
          total:           `${Number(inv.total).toFixed(2)} ${(inv.currency as string) ?? 'USD'}`,
          due_date:        dueDate,
          pay_url:         payUrl,
          accent,
          logo_url:        orgRow?.logo_url ?? null,
        })
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[send-invoice-email] Resend error:', res.status, errText)
      return j({ error: 'Failed to send the invoice email' }, 500)
    }

    return j({ success: true })

  } catch (err) {
    console.error('[send-invoice-email] Unexpected error:', err)
    return j({ error: safeMessage(err, 'Failed to send the invoice') }, 500)
  }
})

function buildInvoiceEmail(p: {
  client_name:    string
  firm_name:      string
  invoice_number: string
  total:          string
  due_date:       string | null
  pay_url:        string
  accent:         string
  logo_url:       string | null
}): string {
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeClient  = esc(p.client_name)
  const safeFirm    = esc(p.firm_name)
  const safeNumber  = esc(p.invoice_number)
  const safeUrl     = p.pay_url.replace(/"/g, '&quot;')
  const dueBlock = p.due_date
    ? `<p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Due <strong style="color:#9ca3af;">${esc(p.due_date)}</strong></p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invoice ${safeNumber}</title>
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
              ${p.logo_url ? `<img src="${p.logo_url.replace(/"/g, '&quot;')}" alt="" style="max-height:32px;display:block;margin-bottom:8px;">` : ''}
              <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${safeFirm}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 28px;">
              <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#ffffff;line-height:1.3;">
                Hi ${safeClient},
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#9ca3af;line-height:1.65;">
                ${safeFirm} sent you invoice <strong style="color:#d1d5db;">${safeNumber}</strong>
                for <strong style="color:#d1d5db;">${esc(p.total)}</strong>.
              </p>
              ${dueBlock}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td style="background-color:${p.accent};border-radius:8px;">
                    <a href="${safeUrl}"
                       style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;
                              color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
                      View &amp; pay invoice &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;word-break:break-all;">
                Button not working? Copy and paste this link into your browser:<br>
                <a href="${safeUrl}" style="color:#3b82f6;">${safeUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid rgba(255,255,255,0.05);">
              <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.7;text-align:center;">
                Sent via LedgiProof on behalf of ${safeFirm}
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
