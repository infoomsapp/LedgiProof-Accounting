// PATH: supabase/functions/invoice-scheduler/index.ts
//
// Daily invoice emails that nobody has to remember to send. Called by pg_cron
// (never by a browser), authenticated by a shared secret kept in Vault, so
// verify_jwt is OFF.
//
//   mode "initial" -- a recurring schedule with auto-send generated an invoice
//                     already marked sent, but its SQL generator cannot email.
//                     This sends that first email.
//   mode "all"     -- "initial", plus payment reminders for every firm that
//                     turned them on (invoice_reminder_settings).
//
// Nothing is ever sent twice: each email is CLAIMED first by inserting into
// invoice_email_log (unique per invoice/kind/offset) and only then sent; if the
// send fails the claim is released so the next run retries.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  daysPastDue, localDate, pickReminder, reminderLead, reminderSubject, wasAutoSent,
  type ReminderKind, type ReminderSettings,
} from '../_shared/invoice-reminder-logic.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_ORIGIN   = 'https://app.ledgiproof.com'
const MAX_EMAILS_PER_RUN = 300
const OPEN_STATUSES = ['sent', 'viewed', 'partial', 'overdue']

type Row = {
  id: string; org_id: string; invoice_number: string; total: number; balance_due: number | null
  currency: string | null; due_date: string | null; status: string; public_token: string | null
  created_at: string; sent_at: string | null
  clients: { display_name: string | null; company_name: string | null; email: string | null } | null
  organizations: { name: string | null; logo_url: string | null; brand_color: string | null } | null
}

const SELECT = `id, org_id, invoice_number, total, balance_due, currency, due_date, status,
  public_token, created_at, sent_at,
  clients(display_name, company_name, email),
  organizations(name, logo_url, brand_color)`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = (n: number, cur: string) => `${Number(n).toFixed(2)} ${cur}`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: ok } = await admin.rpc('verify_scheduler_secret', {
    p: req.headers.get('x-scheduler-secret') ?? '',
  })
  if (ok !== true) return new Response('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({})) as { mode?: string }
  const mode = body.mode === 'initial' ? 'initial' : 'all'
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.error('[invoice-scheduler] RESEND_API_KEY not set')
    return Response.json({ error: 'Email service not configured' }, { status: 500 })
  }

  const budget = { left: MAX_EMAILS_PER_RUN }
  const result = { initial: 0, reminders: 0, skipped: 0, failed: 0 }

  try {
    await sendInitial(admin, resendKey, budget, result)
    if (mode === 'all') await sendReminders(admin, resendKey, budget, result)
  } catch (err) {
    console.error('[invoice-scheduler] unexpected error', err)
    return Response.json({ error: 'Scheduler failed', ...result }, { status: 500 })
  }
  console.log('[invoice-scheduler]', mode, JSON.stringify(result))
  return Response.json({ ok: true, mode, ...result })
})

// deno-lint-ignore no-explicit-any
async function claim(admin: any, r: Row, kind: string, offset: number, to: string): Promise<boolean> {
  const { error } = await admin.from('invoice_email_log').insert({
    invoice_id: r.id, org_id: r.org_id, kind, day_offset: offset, sent_to: to,
  })
  if (!error) return true
  if (error.code !== '23505') console.error('[invoice-scheduler] claim failed', error.message)
  return false
}

// deno-lint-ignore no-explicit-any
async function release(admin: any, r: Row, kind: string, offset: number) {
  await admin.from('invoice_email_log').delete()
    .eq('invoice_id', r.id).eq('kind', kind).eq('day_offset', offset)
}

// deno-lint-ignore no-explicit-any
async function sendInitial(admin: any, resendKey: string, budget: { left: number }, out: Record<string, number>) {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString()
  const { data, error } = await admin.from('invoices').select(SELECT)
    .not('recurring_id', 'is', null).not('public_token', 'is', null)
    .in('status', OPEN_STATUSES).gte('created_at', since).limit(500)
  if (error) throw error

  const rows = ((data ?? []) as unknown as Row[]).filter(r => wasAutoSent(r.created_at, r.sent_at))
  for (const r of rows) {
    if (budget.left <= 0) return
    const to = r.clients?.email?.trim()
    if (!to) { out.skipped++; continue }
    if (!(await claim(admin, r, 'initial', 0, to))) continue

    const firm = r.organizations?.name || 'Your bookkeeper'
    const sent = await sendEmail(resendKey, r, to, {
      subject: `Invoice ${r.invoice_number} from ${firm}`,
      lead: `${firm} sent you invoice ${r.invoice_number}.`,
    })
    budget.left--
    if (sent) out.initial++; else { out.failed++; await release(admin, r, 'initial', 0) }
    await sleep(150)
  }
}

// deno-lint-ignore no-explicit-any
async function sendReminders(admin: any, resendKey: string, budget: { left: number }, out: Record<string, number>) {
  const { data: settingsRows, error } = await admin.from('invoice_reminder_settings')
    .select('org_id, days_before, on_due, overdue_days').eq('enabled', true)
  if (error) throw error

  const today = localDate(new Date())
  for (const s of (settingsRows ?? []) as Array<ReminderSettings & { org_id: string }>) {
    if (budget.left <= 0) return
    const { data, error: invErr } = await admin.from('invoices').select(SELECT)
      .eq('org_id', s.org_id).in('status', OPEN_STATUSES)
      .not('public_token', 'is', null).not('due_date', 'is', null)
      .gt('balance_due', 0).limit(500)
    if (invErr) { console.error('[invoice-scheduler] load failed', invErr.message); continue }
    const invoices = (data ?? []) as unknown as Row[]
    if (invoices.length === 0) continue

    const { data: logs } = await admin.from('invoice_email_log').select('invoice_id, kind, day_offset')
      .in('invoice_id', invoices.map(i => i.id))
    const sentBy = new Map<string, Set<string>>()
    for (const l of (logs ?? []) as Array<{ invoice_id: string; kind: string; day_offset: number }>) {
      if (!sentBy.has(l.invoice_id)) sentBy.set(l.invoice_id, new Set())
      sentBy.get(l.invoice_id)!.add(`${l.kind}:${l.day_offset}`)
    }

    for (const r of invoices) {
      if (budget.left <= 0) return
      const pastDue = daysPastDue(r.due_date!, today)
      const pick = pickReminder(pastDue, s, sentBy.get(r.id) ?? new Set())
      if (!pick) continue
      const to = r.clients?.email?.trim()
      if (!to) { out.skipped++; continue }
      if (!(await claim(admin, r, pick.kind, pick.day_offset, to))) continue

      const firm = r.organizations?.name || 'Your bookkeeper'
      const sent = await sendEmail(resendKey, r, to, {
        subject: reminderSubject(r.invoice_number, firm, pick.kind as ReminderKind, pastDue),
        lead: reminderLead(pick.kind as ReminderKind, pastDue, firm),
      })
      budget.left--
      if (sent) out.reminders++; else { out.failed++; await release(admin, r, pick.kind, pick.day_offset) }
      await sleep(150)
    }
  }
}

async function sendEmail(
  resendKey: string, r: Row, to: string, c: { subject: string; lead: string },
): Promise<boolean> {
  const firm   = r.organizations?.name || 'Your bookkeeper'
  const accent = /^#[0-9a-fA-F]{6}$/.test(r.organizations?.brand_color ?? '') ? r.organizations!.brand_color! : '#3b82f6'
  const logo   = (r.organizations?.logo_url ?? '').startsWith('https://') ? r.organizations!.logo_url! : null
  const client = r.clients?.company_name || r.clients?.display_name || 'there'
  const cur    = r.currency ?? 'USD'
  const amount = money(r.balance_due ?? r.total, cur)
  const due    = r.due_date
    ? new Date(`${r.due_date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : null
  const url = `${APP_ORIGIN}/i/${encodeURIComponent(r.public_token!)}`

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#0b0d14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0b0d14;padding:48px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#12141f;border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;">
<tr><td style="padding:28px 32px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
${logo ? `<img src="${esc(logo)}" alt="" style="max-height:32px;display:block;margin-bottom:8px;">` : ''}
<span style="font-size:18px;font-weight:700;color:#ffffff;">${esc(firm)}</span></td></tr>
<tr><td style="padding:32px 32px 28px;">
<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#ffffff;">Hi ${esc(client)},</p>
<p style="margin:0 0 20px;font-size:14px;color:#9ca3af;line-height:1.65;">${esc(c.lead)}</p>
<p style="margin:0 0 6px;font-size:14px;color:#9ca3af;">Invoice <strong style="color:#d1d5db;">${esc(r.invoice_number)}</strong> &middot; Amount due <strong style="color:#d1d5db;">${esc(amount)}</strong></p>
${due ? `<p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Due <strong style="color:#9ca3af;">${esc(due)}</strong></p>` : '<div style="height:18px"></div>'}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;"><tr><td style="background-color:${accent};border-radius:8px;">
<a href="${esc(url)}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">View &amp; pay invoice &rarr;</a></td></tr></table>
<p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;word-break:break-all;">Button not working? Copy and paste this link into your browser:<br><a href="${esc(url)}" style="color:#3b82f6;">${esc(url)}</a></p>
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid rgba(255,255,255,0.05);"><p style="margin:0;font-size:12px;color:#4b5563;line-height:1.7;text-align:center;">Sent via LedgiProof on behalf of ${esc(firm)}. If you have already paid, please ignore this message.</p></td></tr>
</table></td></tr></table></body></html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'LedgiProof <accounts@ledgiproof.com>', to: [to], subject: c.subject, html }),
    })
    if (!res.ok) {
      console.error('[invoice-scheduler] Resend error', res.status, (await res.text()).slice(0, 200))
      return false
    }
    return true
  } catch (e) {
    console.error('[invoice-scheduler] Resend request failed', e instanceof Error ? e.message : 'unknown')
    return false
  }
}
