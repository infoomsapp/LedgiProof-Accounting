// PATH: supabase/functions/suggest-categories/index.ts
//
// AI step of the "For review" inbox (phase 2 of the frictionless flow).
// get_review_queue() already suggests a category from rules, what this
// workspace has learned, vendor defaults and well-known merchants. This fills
// in whatever is still blank: the transactions the frontend sends here are
// the ones with no suggestion at all.
//
//   POST { org_id, client_id?, transaction_ids: string[] (<= 25) }
//   ->   { suggestions: [{ transaction_id, account_id, confidence }] }
//
// Never posts anything -- it only proposes; the user confirms in one click
// through post_reviewed_transactions(). Everything is read through the
// caller's own JWT, so RLS decides which transactions and accounts exist.
// The model only ever picks from this workspace's own leaf accounts (sent as
// short ids and mapped back); an answer outside that list is dropped.
//
// Deploy: supabase functions deploy suggest-categories

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { getCorsHeaders } from '../_shared/cors.ts'
import { safeMessage } from '../_shared/errors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MAX_TRANSACTIONS  = 25

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

const SYSTEM_PROMPT =
  'You categorize bank transactions for small-business bookkeeping (US GAAP, Schedule C). ' +
  'For each transaction, pick the single best account from the chart of accounts provided, ' +
  'using its id exactly as given. Money out (negative amount) goes to an expense account; ' +
  'money in (positive amount) goes to an income account unless it is clearly something else. ' +
  'If none of the accounts is a reasonable fit, return null for that transaction rather than guessing. ' +
  'confidence is 0-100: how sure a bookkeeper would be that this is the right account.'

// Structured output: the response is guaranteed to match this shape.
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          transaction: { type: 'string' },
          account:     { type: ['string', 'null'] },
          confidence:  { type: 'integer' },
        },
        required: ['transaction', 'account', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const

interface Tx      { id: string; description: string | null; merchant_name: string | null; amount: number; transaction_date: string }
interface Account { id: string; code: string; name: string; type: string }

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return respond({ error: 'Unauthorized' }, 401)

    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await db.auth.getUser()
    if (!user) return respond({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => null) as
      { org_id?: string; client_id?: string | null; transaction_ids?: string[] } | null
    const orgId    = body?.org_id
    const clientId = body?.client_id ?? null
    const ids      = (body?.transaction_ids ?? []).slice(0, MAX_TRANSACTIONS)
    if (!orgId || ids.length === 0) return respond({ suggestions: [] })

    // Cost guard: at most 60 AI batches per workspace per hour.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    if (!(await checkRateLimit(admin, `suggest-categories:${orgId}`, 60, 3600))) {
      return respond({ suggestions: [], rate_limited: true })
    }

    // Read as the caller: RLS decides what exists for them.
    let txQuery = db.from('transactions')
      .select('id, description, merchant_name, amount, transaction_date')
      .eq('org_id', orgId)
      .in('id', ids)
    txQuery = clientId ? txQuery.eq('client_id', clientId) : txQuery.is('client_id', null)
    const { data: txs, error: txErr } = await txQuery
    if (txErr) return respond({ error: safeMessage(txErr, 'Could not load the transactions') }, 500)
    if (!txs?.length) return respond({ suggestions: [] })

    let acctQuery = db.from('accounts')
      .select('id, code, name, type, parent_id')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .in('type', ['income', 'expense'])
    acctQuery = clientId ? acctQuery.eq('client_id', clientId) : acctQuery.is('client_id', null)
    const { data: allAccounts, error: acctErr } = await acctQuery
    if (acctErr) return respond({ error: safeMessage(acctErr, 'Could not load the chart of accounts') }, 500)

    // Leaf accounts only -- a heading with children is never a category.
    const parents  = new Set((allAccounts ?? []).map(a => a.parent_id).filter(Boolean))
    const accounts = (allAccounts ?? []).filter(a => !parents.has(a.id)) as Account[]
    if (accounts.length === 0) return respond({ suggestions: [] })

    // Short ids keep the prompt small and make any invented id obviously invalid.
    const acctById = new Map(accounts.map((a, i) => [`a${i + 1}`, a]))
    const txById   = new Map((txs as Tx[]).map((t, i) => [`t${i + 1}`, t]))

    const chart = [...acctById].map(([k, a]) => `${k} | ${a.type} | ${a.code} ${a.name}`).join('\n')
    const lines = [...txById].map(([k, t]) =>
      `${k} | ${t.transaction_date} | ${Number(t.amount).toFixed(2)} | ${t.merchant_name ?? t.description ?? ''}`
    ).join('\n')

    const response = await anthropic.beta.messages.create({
      model:      'claude-opus-5',
      max_tokens: 8000,
      betas:      ['server-side-fallback-2026-07-01'],
      fallbacks:  'default',
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content:
          `Chart of accounts (id | type | code name):\n${chart}\n\n` +
          `Transactions (id | date | amount | description):\n${lines}`,
      }],
    })

    // A decline is not an error for the user: they just categorize by hand.
    if (response.stop_reason === 'refusal') return respond({ suggestions: [] })

    const text = response.content.find(b => b.type === 'text')
    if (!text || text.type !== 'text') return respond({ suggestions: [] })
    const parsed = JSON.parse(text.text) as
      { suggestions: { transaction: string; account: string | null; confidence: number }[] }

    const suggestions = parsed.suggestions.flatMap(s => {
      const tx   = txById.get(s.transaction)
      const acct = s.account ? acctById.get(s.account) : undefined
      if (!tx || !acct) return []
      // Same sign rule the posting RPC applies: money out -> expense, in -> income.
      if ((Number(tx.amount) < 0) !== (acct.type === 'expense')) return []
      return [{
        transaction_id: tx.id,
        account_id:     acct.id,
        account_code:   acct.code,
        account_name:   acct.name,
        confidence:     Math.max(0, Math.min(100, Math.round(s.confidence))),
      }]
    })

    return respond({ suggestions })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.APIConnectionError) {
      return respond({ suggestions: [], unavailable: true })
    }
    console.error('[suggest-categories]', err)
    return respond({ error: safeMessage(err, 'Could not suggest categories') }, 500)
  }
})
