// PATH: supabase/functions/report-error/index.ts
//
// Client error-report proxy — forwards frontend crash reports (uncaught
// exceptions, unhandled promise rejections, React render errors) to CGC
// Core's /monitor/error endpoint using the server-side API key.
//
// Deliberately requires NO signed-in user (unlike cgc-evaluate): errors on
// the login screen or before a session exists are exactly the ones worth
// catching, so this only needs the app's anon key (sent automatically by
// supabase.functions.invoke()), not an authenticated session.
//
// Never fails loudly to the caller — error reporting must not itself
// become a source of errors in the app.

import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'

const CGC_ENDPOINT = Deno.env.get('CGC_ENDPOINT') ?? ''
const CGC_API_KEY  = Deno.env.get('CGC_API_KEY')  ?? ''

const ALLOWED_APP_SOURCES = new Set(['ledgiproof', 'ledgiproof-tax-pro'])

interface ErrorReportBody {
  app_source:  string
  environment?: string
  severity?:   string
  message:     string
  stack?:      string
  url?:        string
  user_agent?: string
  context?:    Record<string, unknown>
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' }
    })

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const body: ErrorReportBody = await req.json()

    if (!body.message || typeof body.message !== 'string') {
      return respond({ accepted: false, reason: 'Missing required field: message' }, 400)
    }
    if (!ALLOWED_APP_SOURCES.has(body.app_source)) {
      return respond({ accepted: false, reason: 'Invalid app_source' }, 400)
    }

    if (!CGC_ENDPOINT || !CGC_API_KEY) {
      // Monitoring not configured for this environment — drop silently, not an error.
      return respond({ accepted: false, reason: 'monitoring_not_configured' }, 200)
    }

    const payload = {
      app_source:  body.app_source,
      environment: body.environment ?? 'production',
      severity:    body.severity ?? 'error',
      message:     body.message.slice(0, 2000),
      stack:       (body.stack ?? '').slice(0, 4000),
      url:         body.url ?? null,
      user_agent:  body.user_agent ?? null,
      context:     body.context ?? {}
    }

    const controller = new AbortController()
    // 10s, not 5s: Vercel cold starts on CGC Core (heavy module init -- SCM/KMS,
    // TCO, ComplianceEngine, etc.) can comfortably exceed 5s on the first call
    // after idle. Confirmed live: a 5s timeout dropped the very first report.
    const timeout    = setTimeout(() => controller.abort(), 10000)

    let cgcRes: Response
    try {
      cgcRes = await fetch(`${CGC_ENDPOINT}/monitor/error`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${CGC_API_KEY}`
        },
        body:   JSON.stringify(payload),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!cgcRes.ok) {
      const text = await cgcRes.text()
      console.warn(`[report-error] CGC Core returned ${cgcRes.status}: ${text}`)
      return respond({ accepted: false, reason: `CGC Core error ${cgcRes.status}` }, 200)
    }

    const data = await cgcRes.json()
    return respond({ accepted: true, ...data }, 200)

  } catch (err: any) {
    console.error('[report-error] error:', err)
    // Swallow — a broken monitoring pipe must never surface to the caller.
    return respond({ accepted: false, reason: safeMessage(err, 'unknown error') }, 200)
  }
})
