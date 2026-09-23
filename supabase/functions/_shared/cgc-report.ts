// PATH: supabase/functions/_shared/cgc-report.ts
//
// Fire-and-forget visibility report to CGC Core's real governance pipeline
// for security-sensitive actions that never otherwise reach it (invitation
// sends today; the same pattern extends to any future sensitive write path).
// This is NOT a gate — it must never fail or meaningfully slow down the
// real action it's reporting on. Bounded await with a timeout (mirrors
// cgc-evaluate's own already-proven pattern) rather than an unproven
// fire-and-forget primitive; every error is swallowed.
//
// Reuses the same CGC_ENDPOINT/CGC_API_KEY secrets cgc-evaluate already
// uses — project-scoped, already reachable from any edge function, no new
// secret provisioning needed.

const CGC_TIMEOUT_MS = 8000

export async function reportToGovernance(params: {
  org_id: string
  action: string
  input_data: Record<string, unknown>
  user_email: string
}): Promise<void> {
  const endpoint = Deno.env.get('CGC_ENDPOINT')
  const apiKey = Deno.env.get('CGC_API_KEY')
  if (!endpoint || !apiKey) return // not configured — no-op, never block the caller

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CGC_TIMEOUT_MS)

  try {
    const form = new URLSearchParams()
    form.set('org_id', params.org_id)
    form.set('action', params.action)
    form.set('input_data', JSON.stringify(params.input_data))
    form.set('user_email', params.user_email)
    // 'security' is not a real tag anywhere in CGC Core's AREA_DATA_MAPPINGS
    // (app/modules/prefilter/PreFilter.py) -- it silently counted as zero
    // real sensitive domains, landing every invitation report at LOW
    // sensitivity regardless of content. 'RESTRICTED' is a real DEFAULT-area
    // tag and an honest description of an access-granting invitation
    // (email + role + a live invitation token). area is set explicitly to
    // 'DEFAULT' rather than relying on the endpoint's own undocumented
    // default for an omitted field.
    form.set('data_domains', JSON.stringify(['RESTRICTED']))
    form.set('area', 'DEFAULT')
    form.set('app_source', 'ledgiproof')

    await fetch(`${endpoint}/governance/decision`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: controller.signal,
    })
  } catch (err) {
    console.warn('[cgc-report] visibility report failed (non-fatal):', err)
  } finally {
    clearTimeout(timeout)
  }
}
