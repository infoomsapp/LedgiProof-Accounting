// PATH: supabase/functions/cgc-evaluate/index.ts
//
// CGC Core proxy — forwards governance evaluation requests to the remote
// CGC Core endpoint using the server-side API key (never exposed to the client).
//
// The client sends the pre-built form fields; this function adds the
// Authorization header from Deno.env.get('CGC_API_KEY') before forwarding.
//
// Falls back gracefully: if CGC Core is unreachable or returns an error,
// the client's embedded governance engine handles the fallback locally.

import { createClient }  from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CGC_ENDPOINT         = Deno.env.get('CGC_ENDPOINT') ?? ''
const CGC_API_KEY          = Deno.env.get('CGC_API_KEY')  ?? ''
const CGC_TIMEOUT_MS       = 8000

interface RequestBody {
  org_id:       string
  action:       string
  input_data:   Record<string, unknown>
  user_email:   string
  data_domains: string[]
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
    // 1. Verify the caller is authenticated
    const auth = req.headers.get('Authorization')
    if (!auth) return respond({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: auth } }
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return respond({ error: 'Unauthorized' }, 401)

    // 2. Parse and validate body
    const body: RequestBody = await req.json()
    if (!body.org_id || !body.action || !body.input_data) {
      return respond({ error: 'Missing required fields: org_id, action, input_data' }, 400)
    }

    // 3. Verify caller is a member of the org
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('org_id', body.org_id)
      .maybeSingle()

    if (!membership) return respond({ error: 'Not a member of this organization' }, 403)

    // 4. CGC Core is required — if not configured, tell the client to use embedded
    if (!CGC_ENDPOINT || !CGC_API_KEY) {
      return respond({ error: 'CGC_ENDPOINT or CGC_API_KEY not configured', use_embedded: true }, 503)
    }

    // 5. Forward to CGC Core with server-side API key
    const form = new URLSearchParams()
    form.set('org_id',       body.org_id)
    form.set('action',       body.action)
    form.set('input_data',   JSON.stringify(body.input_data))
    form.set('user_email',   body.user_email ?? 'service@ledgiproof')
    form.set('data_domains', JSON.stringify(body.data_domains ?? []))

    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), CGC_TIMEOUT_MS)

    let cgcRes: Response
    try {
      cgcRes = await fetch(`${CGC_ENDPOINT}/governance/decision`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${CGC_API_KEY}`
        },
        body:   form.toString(),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!cgcRes.ok) {
      const text = await cgcRes.text()
      return respond({ error: `CGC Core error: ${cgcRes.status}`, detail: text, use_embedded: true }, 502)
    }

    const data = await cgcRes.json()
    return respond(data, 200)

  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return respond({ error: 'CGC Core timeout', use_embedded: true }, 504)
    }
    console.error('[cgc-evaluate] error:', err)
    return respond({ error: err?.message ?? 'Unknown error', use_embedded: true }, 500)
  }
})
