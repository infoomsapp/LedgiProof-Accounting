// PATH: supabase/functions/resolve-transaction/index.ts
//
// Records an explicit caller action on a transaction. The semaphore colour is
// never written here -- the database derives it (semaphore_v2.sql):
//   blue verified by a person · green in the books, ready to verify ·
//   amber needs eyes (not in the books, or flagged) · red problem/rejected.
//
// ── Resolution semantics ─────────────────────────────────────────────────────
//   'approve'  — client confirms "this is mine / correct": the question is
//                answered (review_status 'answered'). It does not verify.
//   'certify'  — the professional verifies it: verify_transactions(), the
//                same path as Verify in the app (refused, LV005, if it is not
//                categorized yet). ORG MEMBER ONLY.
//   'clarify'  — more information given; still under review ('answered').
//   'reject'   — wrong / not mine / disputed ('rejected' → red).
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
import { safeMessage } from '../_shared/errors.ts'

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

    const trimmedMessage = (typeof message === 'string' ? message : '').trim().slice(0, 500)

    // ── Certify = Verify, through the one verification path ──────────────────
    // Runs as the caller (their JWT), so the database checks their role and
    // records them as the verifier; it also writes the audit entry.
    if (resolution === 'certify') {
      const { data: res, error: vErr } = await supabaseUser.rpc('verify_transactions', {
        p_org_id:          tx.org_id,
        p_transaction_ids: [tx.id]
      })
      if (vErr) return j({ error: safeMessage(vErr, 'Failed to verify the transaction') }, 400)
      const failed = (res as any)?.failed?.[0]
      if (failed) return j({ error: failed.error, code: failed.code }, 409)
      const { data: after } = await supabaseAdmin
        .from('transactions').select('semaphore').eq('id', tx.id).single()
      return j({ success: true, resolution, newSemaphore: after?.semaphore ?? null })
    }

    let newReviewStatus: string
    let auditEventType:  AuditEventType

    switch (resolution) {
      case 'approve':
        newReviewStatus = 'answered'
        auditEventType  = 'semaphore_changed'
        break
      case 'reject':
        newReviewStatus = 'rejected'
        auditEventType  = 'rejected'
        break
      case 'clarify':
      default:
        newReviewStatus = 'answered'
        auditEventType  = 'semaphore_changed'
        break
    }

    // ── Update transaction (the colour follows from review_status) ────────────
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('transactions')
      .update({
        review_status: newReviewStatus,
        ai_reason: trimmedMessage
          ? `Resolved via ${resolution}: "${trimmedMessage.slice(0, 200)}"`
          : `Resolved via ${resolution}`
      })
      .eq('id', transaction_id)
      .select('semaphore')
      .single()

    if (updateErr) return j({ error: safeMessage(updateErr, 'Failed to update the transaction') }, 500)
    const newSemaphore = updated?.semaphore ?? null

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
        message:        trimmedMessage || null,
        prev_semaphore: tx.semaphore,
        new_semaphore:  newSemaphore,
        by_org_member:  isOrgMember,
        actor_role:     memberRole ?? 'client'
      }
    })

    if (auditErr) {
      console.error('[resolve-transaction] Audit insert failed:', auditErr)
    }

    return j({
      success:      true,
      resolution,
      newSemaphore
    })

  } catch (err) {
    console.error('[resolve-transaction] Unexpected error:', err)
    return j({ error: safeMessage(err, 'Failed to resolve the transaction') }, 500)
  }
})
