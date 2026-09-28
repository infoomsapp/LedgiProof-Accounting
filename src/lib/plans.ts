// PATH: src/lib/plans.ts
//
// The ONE place the app describes its plans.
//   · What a plan INCLUDES (limits, features) is never written here: it comes
//     from plan_features in the database -- the same rows the server enforces
//     (plan_limits_server.sql). getFeatureMatrix() reads them (anon-readable,
//     so the public pricing page uses it too).
//   · What the database doesn't hold -- names, prices (Stripe), trial length,
//     taglines, the upgrade path, human labels for feature keys -- lives here,
//     and every screen (pricing, billing, sign-up, choose plan, upgrade modal,
//     admin revenue) imports it instead of keeping its own copy.

import { db } from './supabase'
import type { SubscriptionPlan } from '../types/database.types'

export type PaidPlan = Exclude<SubscriptionPlan, 'enterprise'>
export const PAID_PLANS: PaidPlan[] = ['starter', 'entrepreneur', 'bookkeeper', 'accountant']

export interface PlanInfo {
  name:      string
  /** Monthly price in USD; null = custom. */
  price:     number | null
  /** Free trial length, as complete_account_setup() grants it. */
  trialDays: number | null
  tagline:   string
  segment:   'self_employed' | 'firm' | null
}

export const PLAN_CATALOG: Record<SubscriptionPlan, PlanInfo> = {
  starter:      { name: 'Starter',      price: 9.99,  trialDays: 30, segment: 'self_employed', tagline: 'Get started — first month on us' },
  entrepreneur: { name: 'Entrepreneur', price: 19.99, trialDays: 15, segment: 'self_employed', tagline: 'For self-employed and freelancers' },
  bookkeeper:   { name: 'Bookkeeper',   price: 59.99, trialDays: 15, segment: 'firm',          tagline: 'For independent bookkeepers' },
  accountant:   { name: 'Accountant',   price: 69.99, trialDays: 15, segment: 'firm',          tagline: 'For accounting & CPA firms' },
  enterprise:   { name: 'Enterprise',   price: null,  trialDays: null, segment: null,          tagline: 'Custom' },
}

export const PLAN_UPGRADE_PATH: Record<SubscriptionPlan, SubscriptionPlan | null> = {
  starter:      'entrepreneur',
  entrepreneur: 'bookkeeper',
  bookkeeper:   'accountant',
  accountant:   'enterprise',
  enterprise:   null,
}

export function priceLabel(plan: SubscriptionPlan): string {
  const p = PLAN_CATALOG[plan].price
  return p == null ? 'Custom' : `$${p.toFixed(2)}`
}

export function trialLabel(plan: SubscriptionPlan): string | null {
  const d = PLAN_CATALOG[plan].trialDays
  return d ? `${d}-day free trial` : null
}

/** Human labels for plan_features keys (the real keys, nothing else). */
export const FEATURE_LABELS: Record<string, { one: string; many: string }> = {
  clients:           { one: 'client',              many: 'clients' },
  team_members:      { one: 'person on the team',  many: 'people on the team' },
  plaid_connections: { one: 'bank connection',     many: 'bank connections' },
  transactions:      { one: 'transaction / month', many: 'transactions / month' },
  receipts_per_mo:   { one: 'receipt / month',     many: 'receipts / month' },
  mileage_trips:     { one: 'mileage trip / month', many: 'mileage trips / month' },
  invoices:          { one: 'invoice / month',     many: 'invoices / month' },
  ai_queries:        { one: 'AI query / month',    many: 'AI queries / month' },
  storage_mb:        { one: 'MB of storage',       many: 'MB of storage' },
  reconciliation:    { one: 'Bank reconciliation', many: 'Bank reconciliation' },
  reports_export:    { one: 'Report export',       many: 'Report export' },
  schedule_c_export: { one: 'Schedule C export',   many: 'Schedule C export' },
  time_tracking:     { one: 'Time tracking',       many: 'Time tracking' },
  bill_tracking:     { one: 'Bills & accounts payable', many: 'Bills & accounts payable' },
  payroll:           { one: 'Payroll',             many: 'Payroll' },
  multi_client:      { one: 'Multi-client workspace & client portal', many: 'Multi-client workspace & client portal' },
  journal_entries:   { one: 'Manual journal entries', many: 'Manual journal entries' },
  period_closing:    { one: 'Period closing',      many: 'Period closing' },
  approval_workflow: { one: 'Approval workflow',   many: 'Approval workflow' },
  tax_forms:         { one: 'Tax forms',           many: 'Tax forms' },
  api_access:        { one: 'API access',          many: 'API access' },
  white_label:       { one: 'White-label invoicing', many: 'White-label invoicing' },
}

/** Features that are counts (limits); every other key is on/off. */
export const COUNTED_FEATURES = [
  'clients', 'team_members', 'plaid_connections', 'transactions',
  'receipts_per_mo', 'mileage_trips', 'invoices', 'ai_queries', 'storage_mb',
] as const

/** plan -> feature_key -> limit (-1 unlimited, 0 not included). */
export type FeatureMatrix = Record<string, Record<string, number>>

export async function getFeatureMatrix(): Promise<FeatureMatrix> {
  const { data, error } = await db.from('plan_features').select('plan, feature_key, limit_value, is_enabled')
  if (error) throw new Error('Could not load plan details')
  const m: FeatureMatrix = {}
  for (const r of data ?? []) {
    ;(m[r.plan] ??= {})[r.feature_key] = r.is_enabled ? r.limit_value : 0
  }
  return m
}

/** "25 clients", "Unlimited AI queries / month", "2 GB of storage"… or null when not included. */
export function describeLimit(key: string, limit: number | undefined): string | null {
  if (limit == null || limit === 0) return null
  const label = FEATURE_LABELS[key]
  if (!label) return null
  if (!(COUNTED_FEATURES as readonly string[]).includes(key)) return label.one
  if (key === 'storage_mb') {
    return limit === -1 ? 'Unlimited storage' : limit >= 1000 ? `${limit / 1000} GB of storage` : `${limit} MB of storage`
  }
  if (limit === -1) return `Unlimited ${label.many}`
  return `${limit.toLocaleString('en-US')} ${limit === 1 ? label.one : label.many}`
}

/** The bullet list for a plan card, straight from its plan_features row. */
export function planHighlights(features: Record<string, number> | undefined): string[] {
  if (!features) return []
  const order = [
    ...COUNTED_FEATURES,
    'multi_client', 'reconciliation', 'bill_tracking', 'time_tracking', 'schedule_c_export',
    'payroll', 'journal_entries', 'period_closing', 'approval_workflow', 'tax_forms',
    'white_label', 'api_access', 'reports_export',
  ]
  return order.map(k => describeLimit(k, features[k])).filter((s): s is string => !!s)
}
