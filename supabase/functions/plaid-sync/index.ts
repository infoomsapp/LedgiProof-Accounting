// PATH: supabase/functions/plaid-sync/index.ts
// Step 3 of 3.
// Pulls new transactions from Plaid using /transactions/sync (cursor-based).
// Saves them as LedgiProof transactions (amber: not in the books yet) and
// hands them to auto_categorize_transactions() -- the same engine For review
// uses. Plaid's own category is kept in metadata as a SEED for suggestions;
// it never posts anything by itself. Pending lines are skipped: Plaid replaces
// them with the posted version later.
// Uses cursor so only NEW transactions are fetched on each call.
//
// 🐛 Real bugs fixed during consolidation into supabase/functions/ (was
// previously living in a typo'd, unbuilt supabase/funtions/ folder):
//   1. This file used to contain TWO full duplicate `serve(...)` handlers
//      concatenated end to end (an old draft left appended after a rewrite).
//      Deploying it would register two handlers in one script — broken.
//      Only the newer, more complete version (with account-code mapping +
//      auto journal-entry posting) is kept here.
//   2. (Removed 2026-09-28) the auto-posted journal entries: categorization
//      now happens in auto_categorize_transactions(), see below.
//
// Deploy: supabase functions deploy plaid-sync
// Call: POST with { org_id, connection_id? } — omit connection_id to sync all

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'
import { decryptToken } from '../_shared/plaid-crypto.ts'

const PLAID_BASE: Record<string, string> = {
  sandbox:     'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production:  'https://production.plaid.com'
}

// Categorization is not done here. It used to be: a fixed Plaid-category ->
// account-code map posted journal lines straight into the ledger and a score
// heuristic painted them blue (verified) with nobody looking -- transfers
// booked as revenue, card spend against checking, invoice payments counted
// twice. Now every bank line goes through auto_categorize_transactions(),
// which only posts what is certain (a confirmed rule, a merchant confirmed
// three times, an exact unique match) and leaves the rest in For review.

// Length-independent string compare, so checking the service key does not leak
// how many leading characters matched.
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

// ── Hashing (mirrors create-transaction / src/lib/hash.ts) ────────────────────
// transactions.raw_hash is NOT NULL and part of the unique key
// (org_id, raw_hash), and nothing in the database fills it in. This function
// used to insert bank rows without it, so every sync failed at the insert and
// no bank transaction was ever saved. The recipe (and the key ORDER inside the
// JSON, which changes the hash) is exactly create-transaction's buildRawHash.
async function sha256Text(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input ?? ''))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

function buildRawHash(p: {
  orgId: string; amount: number; currency: string; reference: string | null
  transactionDate: string; source: string
}): Promise<string> {
  return sha256Text(JSON.stringify(p))
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Internal call from plaid-webhook ─────────────────────────────────────
    // When Plaid tells us new transactions are available there is no logged-in
    // user, so plaid-webhook calls this function with the service-role key as
    // the bearer token. That key is a secret only server code holds, so an
    // exact match proves the call is ours. Everything below the auth block is
    // unchanged; an internal call skips only the user lookup and the
    // membership check (there is no user), and stamps each new transaction
    // with the user who connected the bank instead of a caller.
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const isInternal = constantTimeEqual(authHeader, `Bearer ${serviceKey}`)

    let callerId: string | null = null
    if (!isInternal) {
      const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
      if (authErr || !user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })
      }
      callerId = user.id
    }

    const { org_id, connection_id, client_id: body_client_id } = await req.json() as {
      org_id: string; connection_id?: string; client_id?: string | null
    }

    if (!org_id) {
      return Response.json({ error: 'org_id required' }, { status: 400, headers: cors })
    }

    // ── Verify caller belongs to this org (service-role client below has no RLS) ──
    if (!isInternal) {
      const { data: membership } = await supabaseUser
        .from('organization_memberships')
        .select('id')
        .eq('user_id', callerId!)
        .eq('org_id', org_id)
        .eq('is_active', true)
        .single()

      if (!membership) {
        return Response.json({ error: 'Not a member of this organization' }, { status: 403, headers: cors })
      }
    }

    // ── Verify body_client_id (if supplied) actually belongs to this org ──
    // Previously trusted the client-supplied value outright; a caller could
    // attach synced transactions to any client_id, including one in another org.
    if (body_client_id) {
      const { data: clientRow } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('id', body_client_id)
        .eq('org_id', org_id)
        .maybeSingle()

      if (!clientRow) {
        return Response.json({ error: 'client_id does not belong to this organization' }, { status: 400, headers: cors })
      }
    }

    // Load bank connections
    let q = supabaseAdmin
      .from('bank_connections').select('*')
      .eq('org_id', org_id).eq('is_active', true).eq('provider', 'plaid')

    if (connection_id) q = q.eq('id', connection_id)
    const { data: connections } = await q

    if (!connections?.length) {
      return Response.json({ error: 'No active bank connections found' }, { status: 404, headers: cors })
    }

    // 🆕 1099 Fase 2 — map each Plaid account_id → its account_type, so every
    // synced transaction gets the right payment_method (a Plaid Item can hold
    // both a checking account and a credit card). Built from ALL of the org's
    // active connections, not just the one being synced.
    const { data: allConns } = await supabaseAdmin
      .from('bank_connections')
      .select('account_id, account_type')
      .eq('org_id', org_id).eq('is_active', true).eq('provider', 'plaid')
    const acctTypeById = new Map<string, string | null>(
      (allConns ?? []).map((c: any) => [c.account_id, c.account_type])
    )

    // 🆕 1099 Fase 1 parity — Plaid inserts bypass createTransaction, so we
    // resolve the learned merchant→vendor mapping here too (otherwise Plaid
    // transactions would never auto-assign a payee). Load the org's confirmed
    // vendor patterns once, then match each transaction's name against them.
    const { data: vendorPatterns } = await supabaseAdmin
      .from('user_patterns')
      .select('keyword, merchant_name, vendor_id, match_count')
      .eq('org_id', org_id)
      .not('vendor_id', 'is', null)
      .order('match_count', { ascending: false })

    const normalizeMerchant = (name: string) =>
      name.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)

    const resolveVendorId = (name: string | null | undefined): string | null => {
      if (!name || !vendorPatterns?.length) return null
      const hay = normalizeMerchant(name)
      // Patterns are pre-sorted by match_count desc, so first hit wins.
      for (const p of vendorPatterns as any[]) {
        const kw = (p.keyword ?? '').toLowerCase().trim()
        const mn = (p.merchant_name ?? '').toLowerCase().trim()
        if ((kw && hay.includes(kw)) || (mn && hay.includes(mn))) return p.vendor_id
      }
      return null
    }

    const plaidEnv = Deno.env.get('PLAID_ENV') ?? 'sandbox'
    const baseUrl  = PLAID_BASE[plaidEnv]

    let totalAdded   = 0
    let totalRemoved = 0
    let totalAutoPosted = 0
    const errors: string[] = []
    const processed  = new Set<string>()

    for (const conn of connections) {
      if (processed.has(conn.plaid_item_id)) continue
      processed.add(conn.plaid_item_id)

      try {
        let cursor = conn.plaid_cursor ?? ''
        let hasMore = true
        const added: any[] = []
        const removed: any[] = []
        const accessToken = await decryptToken(conn.plaid_access_token)

        while (hasMore) {
          const syncRes = await fetch(`${baseUrl}/transactions/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id:    Deno.env.get('PLAID_CLIENT_ID')!,
              secret:       Deno.env.get('PLAID_SECRET')!,
              access_token: accessToken,
              cursor:       cursor || undefined,
              count:        100
            })
          })

          const syncData = await syncRes.json()
          if (!syncRes.ok || syncData.error_code) {
            if (['ITEM_LOGIN_REQUIRED','ITEM_NOT_FOUND'].includes(syncData.error_code)) {
              await supabaseAdmin.from('bank_connections')
                .update({ sync_status: 'consent_expired', sync_error: syncData.error_message })
                .eq('id', conn.id)
            }
            throw new Error(syncData.error_message ?? 'Plaid sync failed')
          }

          added.push(...syncData.added)
          removed.push(...syncData.removed)
          cursor  = syncData.next_cursor
          hasMore = syncData.has_more
        }

        // Pending lines are not imported: Plaid removes them and sends the
        // posted version, which is the one that belongs in the books.
        const postedLines = added.filter((t: any) => !t.pending)

        if (postedLines.length > 0) {
          // Chain continuity, same as create-transaction: the last audit hash
          // this organization recorded.
          const { data: lastAudit } = await supabaseAdmin
            .from('audit_events')
            .select('entry_hash')
            .eq('org_id', org_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const previousHash = lastAudit?.entry_hash ?? null

          const txInserts = await Promise.all(postedLines.map(async (plaidTx: any) => {
            const amount   = -plaidTx.amount
            const category = plaidTx.personal_finance_category?.primary ?? null

            // 🆕 1099 Fase 2 — derive the payment instrument from the funding
            // account this transaction belongs to (credit card → excluded from
            // 1099-NEC). Falls back to the connection's type, then 'unknown'.
            const payment_method = paymentMethodFromAccountType(
              acctTypeById.get(plaidTx.account_id) ?? conn.account_type
            )

            const currency = plaidTx.iso_currency_code ?? 'USD'
            const rawHash = await buildRawHash({
              orgId: org_id, amount, currency,
              reference: plaidTx.transaction_id, transactionDate: plaidTx.date, source: 'bank_api'
            })

            return {
              org_id,
              raw_hash:         rawHash,
              previous_hash:    previousHash,
              // 🆕 Sprint 5: client scope.
              //   1st choice: explicit client_id from the request body
              //   2nd choice: client_id bound to the bank_connection (set at connect time)
              //   3rd choice: null (legacy / self mode)
              client_id:        body_client_id ?? conn.client_id ?? null,
              source:           'bank_api',
              amount,
              currency,
              reference:        plaidTx.transaction_id,
              description:      plaidTx.name,
              merchant_name:    plaidTx.merchant_name ?? null,
              transaction_date: plaidTx.date,
              payment_method,                          // 🆕 1099 Fase 2
              vendor_id:        resolveVendorId(plaidTx.merchant_name ?? plaidTx.name), // 🆕 1099 Fase 1 parity
              // No rules run on bank lines: nothing flagged. The colour is
              // derived by the database (amber until it is in the books).
              risk_status:      'green',
              version:          1,
              is_current:       true,
              created_by:       callerId ?? conn.connected_by,
              metadata: {
                plaid_transaction_id: plaidTx.transaction_id,
                plaid_category:       category,          // seed for suggestions
                plaid_account_id:     plaidTx.account_id,
                plaid_pending:        false,
                merchant_name:        plaidTx.merchant_name
              }
            }
          }))

          // The unique key is (org_id, raw_hash) -- there is no unique index on
          // (org_id, reference), so the old onConflict target made Postgres
          // reject the whole statement (42P10). ignoreDuplicates makes a row
          // Plaid re-sends a no-op instead of overwriting a review someone
          // already did; .select() then returns only the rows that are NEW.
          const { data: inserted, error: txErr } = await supabaseAdmin
            .from('transactions')
            .upsert(txInserts, { onConflict: 'org_id,raw_hash', ignoreDuplicates: true })
            .select('id')

          if (txErr) throw new Error(`Transaction insert failed: ${safeMessage(txErr, 'database error')}`)

          // Post what is certain; everything else waits in For review.
          const newIds = (inserted ?? []).map((t: any) => t.id)
          if (newIds.length > 0) {
            const { data: auto, error: autoErr } = await supabaseAdmin.rpc('auto_categorize_transactions', {
              p_org_id:          org_id,
              p_transaction_ids: newIds,
              p_actor:           callerId ?? conn.connected_by
            })
            if (autoErr) {
              // The lines are saved and sit in For review; say so instead of hiding it.
              errors.push(`${conn.institution_name}: automatic categorization failed (${safeMessage(autoErr, 'database error')}); the transactions are waiting in For review`)
            } else {
              totalAutoPosted += ((auto as any)?.posted ?? []).length
            }
          }

          totalAdded += postedLines.length
        }

        if (removed.length > 0) {
          // Retiring a line reverses its journal lines in the database; one
          // matched to an invoice or bill is refused (LV008) and reported.
          for (const rm of removed) {
            const { error: rmErr } = await supabaseAdmin.from('transactions')
              .update({ is_current: false })
              .eq('org_id', org_id).eq('reference', rm.transaction_id).eq('is_current', true)
            if (rmErr) errors.push(`${conn.institution_name}: the bank withdrew a transaction LedgiProof could not remove (${safeMessage(rmErr, 'database error')})`)
          }
          totalRemoved += removed.length
        }

        await supabaseAdmin.from('bank_connections').update({
          plaid_cursor:   cursor,
          last_synced_at: new Date().toISOString(),
          sync_status:    'ok',
          sync_error:     null
        })
        .eq('plaid_item_id', conn.plaid_item_id).eq('org_id', org_id)

      } catch (err: any) {
        const msg = safeMessage(err, 'Sync failed')
        errors.push(`${conn.institution_name}: ${msg}`)
        await supabaseAdmin.from('bank_connections')
          .update({ sync_status: 'error', sync_error: msg })
          .eq('id', conn.id)
      }
    }

    return Response.json({
      success: errors.length === 0,
      added:   totalAdded, removed: totalRemoved, auto_categorized: totalAutoPosted,
      synced:  connections.length,
      errors:  errors.length > 0 ? errors : undefined
    }, { headers: cors })

  } catch (err) {
    console.error('[plaid-sync] Unexpected error:', err)
    return Response.json({ error: safeMessage(err, 'Failed to sync transactions') }, { status: 500, headers: cors })
  }
})
