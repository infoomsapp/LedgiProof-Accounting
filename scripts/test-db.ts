#!/usr/bin/env tsx
// ── scripts/test-db.ts ─────────────────────────────────────
// PRODUCTION READY — LedgiProof DB Health Check

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import type { Database } from '../src/types/database.types'

config({ path: resolve(process.cwd(), '.env') })

// 🔥 CORREGIDO: usar variables backend
const rawUrl = process.env.SUPABASE_URL
const rawKey = process.env.SUPABASE_ANON_KEY

if (!rawUrl || !rawKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in env')
}

// Narrowed, non-optional copies — the guard above only narrows `rawUrl`/
// `rawKey` within this module-scope block; `main()` below is a separate
// closure and TS can't see through the guard into it, so it kept reporting
// 'url' is possibly 'undefined' even though the throw makes that provably
// impossible by the time main() runs.
const url: string = rawUrl
const key: string = rawKey

const db = createClient<Database>(url, key)
// ── Helpers ────────────────────────────────────────────────

let passed = 0
let failed = 0

function ok(label: string) {
  console.log(`  ✅  ${label}`)
  passed++
}

function fail(label: string, detail?: string) {
  console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`)
  failed++
}

// ── Checks ─────────────────────────────────────────────────

// 1. Connection
async function checkConnection() {
  console.log('\n📡 Connection')

  const { data, error } = await db.from('organizations').select('id').limit(1)

  if (error) {
    fail('Supabase connection', error.message)
    return
  }

  ok('Supabase reachable')
}

// 2. Tables
async function checkTables() {
  console.log('\n🗂️ Tables')

  // db.from(t) with `t` typed as the full table-name union makes the
  // Postgrest query builder's generic overload resolution blow up
  // (TS2589 — "Type instantiation is excessively deep"), a known
  // supabase-js pain point when .from() is called with a union type
  // inside a loop. This is a one-off existence check, not real typed
  // data access, so we fall back to the untyped base client just for
  // this call — `tables` above is still checked against the real
  // Database type, so a renamed/mistyped table name still fails to compile.
  const untypedDb = db as SupabaseClient

  for (const t of tables) {
    const { error } = await untypedDb.from(t).select('*').limit(0)

    if (error) {
      fail(t, error.message)
    } else {
      ok(t)
    }
  }
}

const tables: (keyof Database['public']['Tables'])[] = [
  'organizations',
  'profiles',
  'organization_memberships',
  'bank_imports',
  'accounts',
  'rule_definitions',
  'transactions',
  'journal_entries',
  'rule_evaluations',
  'audit_events'
]

// 3. Rules
async function checkSeedRules() {
  console.log('\n🧠 Brain — seeded rules')

  const expected = [
    'dup_check',
    'threshold_check',
    'velocity_check',
    'missing_document',
    'budget_variance',
    'new_counterparty'
  ]

  const { data, error } = await db
    .from('rule_definitions')
    .select('rule_id, priority')
    .is('org_id', null)
    .eq('is_active', true)
    .order('priority')

  if (error) {
    fail('Load rules', error.message)
    return
  }

  const ids = data?.map(r => r.rule_id) ?? []

  for (const id of expected) {
    if (ids.includes(id)) ok(id)
    else fail(id, 'missing')
  }

  ok(`Rules loaded (${ids.length})`)
}

// 4. View
async function checkView() {
  console.log('\n👁️ Views')

  const { error } = await db
    .from('v_journal_balance_by_transaction')
    .select('*')
    .limit(0)

  if (error) fail('View missing', error.message)
  else ok('View OK')
}

// 5. Append-only (FIX REAL)
async function checkAppendOnly() {
  console.log('\n🔐 Immutability')

  // Primero insertamos un registro dummy
  const { data, error: insertError } = await db
    .from('audit_events')
    .insert({
      org_id: crypto.randomUUID(),
      transaction_id: crypto.randomUUID(),
      transaction_group_id: crypto.randomUUID(),
      transaction_version: 1,
      event_type: 'created',
      entry_hash: 'a'.repeat(64)
    })
    .select()
    .single()

  if (insertError || !data) {
    fail('Insert test event', insertError?.message)
    return
  }

  // Intentar UPDATE (debe fallar)
  const { error: updateError } = await db
    .from('audit_events')
    .update({ actor_role: 'hack' })
    .eq('id', data.id)

  if (updateError) {
    ok('UPDATE blocked (append-only OK)')
  } else {
    fail('UPDATE allowed (SECURITY ISSUE)')
  }

  // Intentar DELETE (debe fallar)
  const { error: deleteError } = await db
    .from('audit_events')
    .delete()
    .eq('id', data.id)

  if (deleteError) {
    ok('DELETE blocked (append-only OK)')
  } else {
    fail('DELETE allowed (SECURITY ISSUE)')
  }
}

// ── Runner ────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════╗')
  console.log('║   LedgiProof — DB Health Check      ║')
  console.log('╚══════════════════════════════════════╝')

  console.log(`\n  URL: ${url.replace(/https:\/\/(.{6}).*/, 'https://$1******')}`)

  await checkConnection()
  await checkTables()
  await checkSeedRules()
  await checkView()
  await checkAppendOnly()

  console.log('\n──────────────────────────────────────')
  console.log(`  Results: ${passed} passed · ${failed} failed`)

  if (failed > 0) {
    console.log('\n⚠️ Fix issues before continuing\n')
    process.exit(1)
  } else {
    console.log('\n🚀 Database ready for production\n')
  }
}

main().catch(err => {
  console.error('\n💥 Unexpected error:', err)
  process.exit(1)
})
