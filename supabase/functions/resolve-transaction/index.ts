// PATH: supabase/functions/resolve-transaction/index.ts
//
// Resolves a transaction's semaphore state from an explicit caller action.
//
// ── Resolution semantics ─────────────────────────────────────────────────────
//   'approve'  → green  — client confirms "this transaction is mine / correct"
//                         Moves to the professional review queue (ready for
//                         the accountant/bookkeeper to certify and close).
//   'certify'  → blue   — accountant/bookkeeper certifies and closes the
//                         transaction. FINAL STATE. ORG MEMBER ONLY.
//                         (owner/admin/accountant/approver)
//   'clarify'  → amber  — additional information needed; still under review
//   'reject'   → red    — transaction is wrong / not mine / disputed
//
// ── IMPORTANT: No keyword inference ─────────────────────────────────────────
//   The `resolution` field is REQUIRED and must be one of the four values
//   above. Text-free classification ("yes" → approve, "correct" → approve)
//   was removed because it is trivially manipulable and produces false
//   positives from natural language (e.g. "I said yes but I meant no",
//   "correct me if I'm wrong"). The caller is responsible for mapping user
//   intent to a structured resolution before invoking this function.
//
// ── Security model ───────────────────────────────────────────────────────────
//   1. Caller must be authenticated (Authorization header, verified user).
//   2. Caller must be able to SELECT this transaction via RLS.
//   3. Org-member callers must hold a WRITE_ROLE (owner/admin/accountant/approver).
//   4. 'certify' is additionally restricted to org members — clients may not
//      certify; only the professional handling the account may do so.
//   5. actor_id for the audit trail is always the verified user.id.
//
// Deploy: supabase functions deploy resolve-transaction

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

// ── Hash-chain helper ─────────────────────────────────────────────────────────
async function sha256Text(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input ?? '')
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function buildAuditHash(params: {
  previousHash:       string | null
  transactionId:      string
  transactionVersion: number
  eventType:          string
  timestamp:          string
  actorId:            string
}): Promise<string> {
  return sha256Text(JSON.stringify(params))
}

type Resolution    = 'approve' | 'certify' | 'clarify' | 'reject'
type AuditEventType = 'approved' | 'rejected' | 'semaphore_changed'

const VALID_RESOLUTIONS: Resolution[] = ['approve', 'certify', 'clarify', 'reject']
const WRITE_ROLES = ['owner', 'admin', 'accountant', 'approver']

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' }
    })

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return j({ error: 'Unauthorized' }, 401)

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) return j({ error: 'Unauthorized' }, 401)

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null)
    if (!body) return j({ error: 'Invalid JSON body' }, 400)

    const {
      transaction_id,
      resolution: rawResolution,
      message = ''
    } = body as {
      transaction_id?: string
      resolution?:     string
      // Optional — used only for audit metadata. Not used to infer resolution.
      message?:        string
    }

    if (!transaction_id || typeof transaction_id !== 'string') {
      return j({ error: 'transaction_id required' }, 400)
    }

    // resolution is required — no fallback inference
    if (!rawResolution || !VALID_RESOLUTIONS.includes(rawResolution as Resolution)) {
      return j({ error: `resolution required: must be one of ${VALID_RESOLUTIONS.join(' | ')}` }, 400)
    }

    const resolution = rawResolution as Resolution

    // ── Load transaction through USER-scoped client (RLS guard) ───────────────
    const { data: tx, error: txErr } = await supabaseUser
      .from('transactions')
      .select('id, org_id, client_id, transaction_group_id, version, semaphore, review_status')
      .eq('id', transaction_id)
      .single()

    if (txErr || !tx) return j({ error: 'Transaction not found' }, 404)

    // ── Org membership check ──────────────────────────────────────────────────
    const { data: membership } = await supabaseUser
      .from('organization_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', tx.org_id)
      .eq('is_active', true)
      .maybeSingle()

    const isOrgMember = !!membership
    const memberRole  = membership?.role as string | undefined

    // Org members must hold a WRITE_ROLE
    if (isOrgMember && !WRITE_ROLES.includes(memberRole ?? '')) {
      return j({ error: 'Your role cannot resolve transactions' }, 403)
    }

    // 'certify' is restricted to org members — clients cannot certify
    if (resolution === 'certify' && !isOrgMember) {
      return j({ error: 'Only firm members may certify transactions' }, 403)
    }

    // ── Map resolution → state ────────────────────────────────────────────────
    // All structured resolutions carry confidence 95 — the caller has
    // explicitly expressed intent rather than having it inferred from text.
    const CONFIDENCE = 95

    let newSemaphore:    string
    let newReviewStatus: string
    let auditEventType:  AuditEventType

    switch (resolution) {
      case 'approve':
        // Client confirms the transaction is theirs. Moves to professional
        // review queue (green). The accountant/bookkeeper will then certify
        // and close it (blue).
        newSemaphore    = 'green'
        newReviewStatus = 'answered'
        auditEventType  = 'semaphore_changed'
        break
      case 'certify':
        // Accountant/bookkeeper certified and closed. FINAL STATE (blue).
        newSemaphore    = 'blue'
        newReviewStatus = 'confirmed'
        auditEventType  = 'approved'
        break
      case 'reject':
        newSemaphore    = 'red'
        newReviewStatus = 'rejected'
        auditEventType  = 'rejected'
        break
      case 'clarify':
      default:
        newSemaphore    = 'amber'
        newReviewStatus = 'answered'
        auditEventType  = 'semaphore_changed'
        break
    }

    const trimmedMessage = (typeof message === 'string' ? message : '').trim().slice(0, 500)

    // ── Update transaction ────────────────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from('transactions')
      .update({
        semaphore:        newSemaphore,
        review_status:    newReviewStatus,
        confidence_score: CONFIDENCE,
        ai_reason: trimmedMessage
          ? `Resolved via ${resolution}: "${trimmedMessage.slice(0, 200)}"`
          : `Resolved via ${resolution}`
      })
      .eq('id', transaction_id)

    if (updateErr) return j({ error: updateErr.message }, 500)

    // ── Audit entry ───────────────────────────────────────────────────────────
    const { data: lastEntry } = await supabaseAdmin
      .from('audit_events')
      .select('entry_hash')
      .eq('org_id', tx.org_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const previousHash = lastEntry?.entry_hash ?? null
    const now          = new Date().toISOString()

    const entryHash = await buildAuditHash({
      previousHash,
      transactionId:      tx.id,
      transactionVersion: tx.version,
      eventType:          auditEventType,
      timestamp:          now,
      actorId:            user.id
    })

    const { error: auditErr } = await supabaseAdmin.from('audit_events').insert({
      org_id:               tx.org_id,
      transaction_id:       tx.id,
      transaction_group_id: tx.transaction_group_id,
      transaction_version:  tx.version,
      event_type:           auditEventType,
      actor_id:             user.id,
      previous_hash:        previousHash,
      entry_hash:           entryHash,
      metadata: {
        resolution,
        confidence:     CONFIDENCE,
        message:        trimmedMessage || null,
        prev_semaphore: tx.semaphore,
        certified_by_org_member: isOrgMember,
        actor_role:     memberRole ?? 'client'
      }
    })

    if (auditErr) {
      console.error('[resolve-transaction] Audit insert failed:', auditErr)
    }

    return j({
      success:      true,
      resolution,
      confidence:   CONFIDENCE,
      newSemaphore
    })

  } catch (err) {
    console.error('[resolve-transaction] Unexpected error:', err)
    return j({ error: String(err) }, 500)
  }
})
