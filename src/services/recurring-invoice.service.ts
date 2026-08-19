// PATH: src/services/recurring-invoice.service.ts
//
// Recurring billing (facturación recurrente). A schedule + line-item template
// that auto-generates invoices on a cadence. Generation runs daily via pg_cron
// (cron_generate_all_recurring_invoices) and on demand via "Generate now"
// (generate_due_recurring_invoices). Generated invoices reuse the exact same
// path as manual ones (next_invoice_number + compute_invoice_totals), so they
// are indistinguishable — and each carries recurring_id for traceability.
//
// Sales-tax ready: every template line has tax_rate, so the future external
// sales-tax API only needs to override tax_rate at generation time.

import { db } from '../lib/supabase'
import type { InvoiceItemType } from '../types/database.types'

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
export type RecurringStatus    = 'active' | 'paused' | 'ended'

export interface RecurringInvoice {
  id:                    string
  org_id:                string
  client_id:             string
  title:                 string | null
  notes:                 string | null
  footer:                string | null
  terms:                 string | null
  currency:              string
  frequency:             RecurringFrequency
  start_date:            string
  next_run_date:         string
  end_date:              string | null
  max_occurrences:       number | null
  occurrences_generated: number
  net_days:              number
  auto_send:             boolean
  status:                RecurringStatus
  last_generated_at:     string | null
  last_invoice_id:       string | null
  created_by:            string | null
  created_at:            string
  updated_at:            string
}

export interface RecurringInvoiceItem {
  id:           string
  recurring_id: string
  org_id:       string
  sort_order:   number
  item_type:    InvoiceItemType
  description:  string
  quantity:     number
  unit_price:   number
  discount_pct: number
  tax_rate:     number
}

export interface RecurringInvoiceWithClient extends RecurringInvoice {
  clients?: { display_name: string; email: string | null } | null
}

export type RecurringItemDraft = Pick<RecurringInvoiceItem,
  'item_type' | 'description' | 'quantity' | 'unit_price' | 'discount_pct' | 'tax_rate'>

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getRecurringInvoices(orgId: string): Promise<RecurringInvoiceWithClient[]> {
  const { data, error } = await db
    .from('recurring_invoices')
    .select('*, clients(display_name, email)')
    .eq('org_id', orgId)
    .order('next_run_date')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as RecurringInvoiceWithClient[]
}

export async function getRecurringItems(recurringId: string): Promise<RecurringInvoiceItem[]> {
  const { data, error } = await db
    .from('recurring_invoice_items')
    .select('*')
    .eq('recurring_id', recurringId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as RecurringInvoiceItem[]
}

// ── Write ─────────────────────────────────────────────────────────────────────

export interface RecurringInput {
  orgId:           string
  clientId:        string
  userId:          string
  title?:          string | null
  notes?:          string | null
  terms?:          string | null
  footer?:         string | null
  currency?:       string
  frequency:       RecurringFrequency
  startDate:       string          // also seeds next_run_date
  netDays?:        number
  autoSend?:       boolean
  endDate?:        string | null
  maxOccurrences?: number | null
}

export async function createRecurringInvoice(
  input: RecurringInput,
  items: RecurringItemDraft[]
): Promise<RecurringInvoice> {
  const { data, error } = await db.from('recurring_invoices').insert({
    org_id:          input.orgId,
    client_id:       input.clientId,
    created_by:      input.userId,
    title:           input.title  ?? null,
    notes:           input.notes  ?? null,
    terms:           input.terms  ?? null,
    footer:          input.footer ?? null,
    currency:        input.currency ?? 'USD',
    frequency:       input.frequency,
    start_date:      input.startDate,
    next_run_date:   input.startDate,
    net_days:        input.netDays ?? 30,
    auto_send:       input.autoSend ?? false,
    end_date:        input.endDate ?? null,
    max_occurrences: input.maxOccurrences ?? null
  }).select().single()
  if (error) throw new Error(error.message)

  const rec = data as RecurringInvoice
  await replaceRecurringItems(rec.id, input.orgId, items)
  return rec
}

export async function replaceRecurringItems(
  recurringId: string,
  orgId:       string,
  items:       RecurringItemDraft[]
): Promise<void> {
  await db.from('recurring_invoice_items').delete().eq('recurring_id', recurringId)
  if (items.length === 0) return
  const rows = items.map((it, i) => ({
    recurring_id: recurringId,
    org_id:       orgId,
    sort_order:   i,
    item_type:    it.item_type,
    description:  it.description,
    quantity:     it.quantity,
    unit_price:   it.unit_price,
    discount_pct: it.discount_pct,
    tax_rate:     it.tax_rate
  }))
  const { error } = await db.from('recurring_invoice_items').insert(rows)
  if (error) throw new Error(error.message)
}

export async function setRecurringStatus(id: string, status: RecurringStatus): Promise<void> {
  const { error } = await db.from('recurring_invoices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteRecurringInvoice(id: string): Promise<void> {
  const { error } = await db.from('recurring_invoices').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Runs the due-now generator for this org (the "Generate now" button). */
export async function generateDueRecurringInvoices(orgId: string): Promise<number> {
  const { data, error } = await db.rpc('generate_due_recurring_invoices', { p_org_id: orgId })
  if (error) throw new Error(error.message)
  const res = data as unknown as { generated?: number; error?: string }
  if (res?.error) throw new Error(res.error)
  return res?.generated ?? 0
}

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly:    'Weekly',
  biweekly:  'Every 2 weeks',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  yearly:    'Yearly'
}
