// PATH: src/services/consent.service.ts
// Records user consents to the DB for compliance audit trail.
//
// NOTE: The DB tables and RPCs for full consent recording will be created
// in Entrega 3 (migration v18_privacy_compliance.sql).
//
// Until then, these helpers attempt to call the RPCs and fail silently if
// they don't exist yet. Once v18 is applied, recording becomes effective
// without any code changes.

import { db } from '../lib/supabase'

// Document versions — bump these when you publish a new version of any doc.
// The DB stores which version the user accepted; if you change a policy
// materially, users will be re-prompted.
export const CONSENT_VERSIONS = {
  privacy_policy: '2026-05-02',
  terms_of_service: '2026-05-02',
  plaid_disclosure: '2026-05-02',
  cookies_policy:   '2026-05-02',
  dpa:              '2026-05-02'
} as const

export type ConsentDocument = keyof typeof CONSENT_VERSIONS

// ── Record a consent ───────────────────────────────────────────────────────

export async function recordConsent(
  userId:   string,
  document: ConsentDocument,
  channel:  'signup' | 'plaid_link' | 'settings' | 're-acceptance' = 'signup'
): Promise<{ ok: boolean; error?: string }> {
  const version = CONSENT_VERSIONS[document]

  try {
    const { error } = await db.rpc('record_consent', {
      p_user_id:  userId,
      p_document: document,
      p_version:  version,
      p_channel:  channel
    })

    if (error) {
      // RPC doesn't exist yet (pre-v18) — log warning but don't block UX
      console.warn('[consent] record_consent RPC not yet available:', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err: any) {
    console.warn('[consent] failed to record:', err?.message)
    return { ok: false, error: err?.message }
  }
}

// ── Convenience: record signup consents (Terms + Privacy together) ─────────

export async function recordSignupConsents(userId: string): Promise<void> {
  // Fire-and-forget; do not block signup flow if these fail
  await Promise.all([
    recordConsent(userId, 'terms_of_service', 'signup'),
    recordConsent(userId, 'privacy_policy',   'signup')
  ])
}

// ── Convenience: record Plaid disclosure acceptance ─────────────────────────

export async function recordPlaidConsent(userId: string): Promise<void> {
  await recordConsent(userId, 'plaid_disclosure', 'plaid_link')
}

// ── Check if user has accepted current version of a document ──────────────

export async function hasAcceptedCurrent(
  userId:   string,
  document: ConsentDocument
): Promise<boolean> {
  const currentVersion = CONSENT_VERSIONS[document]

  try {
    const { data, error } = await db
      .from('consent_records')
      .select('version')
      .eq('user_id',  userId)
      .eq('document', document)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return false  // table doesn't exist yet, assume not accepted
    if (!data) return false
    return data.version === currentVersion
  } catch {
    return false
  }
}