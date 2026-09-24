// PATH: src/services/invoice.service.ts
import { db } from '../lib/supabase'
import type {
  Client, Invoice, InvoiceItem, InvoicePayment, InvoiceStatus, Database
} from '../types/database.types'
import { dbError } from '../lib/errors'

type ClientInsert = Database['public']['Tables']['clients']['Insert']

// ── Clients ───────────────────────────────────────────────────────────────────

/**
 * Thrown by createClient/updateClient when the email would collide with
 * another ACTIVE client in the same org (case-insensitive). Matches the DB's
 * own `clients_unique_email_per_org_active` partial unique index — this is
 * the friendly, pre-flight version of that constraint, not a replacement
 * for it (the DB is still the source of truth; see the 23505 catch below
 * for the race-condition backstop).
 */
export class DuplicateClientEmailError extends Error {
  constructor(
    public readonly email: string,
    public readonly existingClientId: string,
    public readonly existingClientName: string
  ) {
    super(`A client with email "${email}" already exists in this organization (${existingClientName}).`)
    this.name = 'DuplicateClientEmailError'
  }
}

/** Returns the active client in this org whose email matches (case-insensitive), if any. */
async function findActiveClientByEmail(
  orgId: string,
  email: string,
  excludeClientId?: string
): Promise<{ id: string; display_name: string } | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  const { data, error } = await db
    .from('clients')
    .select('id, display_name, email')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .not('email', 'is', null)
  if (error) throw dbError(error, 'Failed to check the client email')

  const match = (data ?? []).find(c =>
    c.id !== excludeClientId && (c.email ?? '').trim().toLowerCase() === normalized
  )
  return match ? { id: match.id, display_name: match.display_name } : null
}

/** Translates the DB's unique-index violation into the same friendly error the pre-check throws. */
function rethrowIfDuplicateEmail(error: { code?: string; message: string }, email: string | null | undefined): never {
  if (error.code === '23505' && error.message.includes('clients_unique_email_per_org_active')) {
    throw new DuplicateClientEmailError(email ?? '', '', 'another client in this organization')
  }
  throw dbError(error, 'Failed to save the client')
}

export async function getClients(orgId: string): Promise<Client[]> {
  const { data, error } = await db
    .from('clients')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('display_name')
  if (error) throw dbError(error, 'Failed to load clients')
  return (data ?? []) as Client[]
}

export async function createClient(
  input: Omit<ClientInsert, 'id' | 'created_at' | 'updated_at'>
): Promise<Client> {
  if (input.email) {
    const dupe = await findActiveClientByEmail(input.org_id, input.email)
    if (dupe) throw new DuplicateClientEmailError(input.email, dupe.id, dupe.display_name)
  }

  const { data, error } = await db
    .from('clients').insert(input).select().single()
  if (error) rethrowIfDuplicateEmail(error, input.email)
  return data as Client
}

export async function updateClient(
  id: string,
  input: Partial<Omit<Client, 'id' | 'org_id' | 'created_at' | 'updated_at'>>,
  /** Required to run the duplicate-email pre-check; omit only for updates that never touch email. */
  orgId?: string
): Promise<Client> {
  if (orgId && typeof input.email === 'string' && input.email.trim() !== '') {
    const dupe = await findActiveClientByEmail(orgId, input.email, id)
    if (dupe) throw new DuplicateClientEmailError(input.email, dupe.id, dupe.display_name)
  }

  const { data, error } = await db
    .from('clients').update(input).eq('id', id).select().single()
  if (error) rethrowIfDuplicateEmail(error, input.email)
  return data as Client
}

/**
 * Soft-delete a client (sets is_active = false).
 *
 * Constitution: clients are NEVER hard-deleted because invoices, estimates,
 * and transactions reference them. Soft-delete preserves audit trail while
 * removing them from active dropdowns and the default client list.
 *
 * Re-activate by calling updateClient(id, { is_active: true }).
 */
export async function deactivateClient(id: string): Promise<void> {
  const { error } = await db
    .from('clients')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw dbError(error, 'Failed to deactivate the client')
}

/**
 * Counts how many invoices and estimates reference this client.
 * Used by the UI to warn the user before deactivating a client with history.
 */
export async function getClientUsageCount(clientId: string): Promise<{
  invoices:  number
  estimates: number
}> {
  const [invRes, estRes] = await Promise.all([
    db.from('invoices')  .select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    db.from('estimates') .select('id', { count: 'exact', head: true }).eq('client_id', clientId)
  ])

  if (invRes.error) throw dbError(invRes.error, 'Failed to check whether the client is in use')
  if (estRes.error) throw dbError(estRes.error, 'Failed to check whether the client is in use')

  return {
    invoices:  invRes.count  ?? 0,
    estimates: estRes.count  ?? 0
  }
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export type InvoiceWithClient = Invoice & { clients: Pick<Client, 'display_name' | 'company_name' | 'email'> }

// Overloads: legacy positional form + new options form.
// Legacy: getInvoices(orgId, status?) — preserved for backward compat.
// New:    getInvoices(orgId, { status, clientId })
export function getInvoices(orgId: string, status?: InvoiceStatus): Promise<InvoiceWithClient[]>
export function getInvoices(orgId: string, options: { status?: InvoiceStatus; clientId?: string | null }): Promise<InvoiceWithClient[]>
export async function getInvoices(
  orgId: string,
  arg2?: InvoiceStatus | { status?: InvoiceStatus; clientId?: string | null }
): Promise<InvoiceWithClient[]> {
  // Normalize the second argument into an options object
  const options =
    typeof arg2 === 'string' || arg2 === undefined
      ? { status: arg2 as InvoiceStatus | undefined, clientId: null }
      : arg2

  let q = db
    .from('invoices')
    .select('*, clients(display_name, company_name, email)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (options.status)   q = q.eq('status', options.status)
  // 🆕 Client Switcher Sprint 3 — Scope filter (only applied when set).
  if (options.clientId) q = q.eq('client_id', options.clientId)

  const { data, error } = await q
  if (error) throw dbError(error, 'Failed to load invoices')
  return (data ?? []) as InvoiceWithClient[]
}

/**
 * Solo — invoices vencidas (past due + con saldo). Surfacea en el dashboard
 * para dar seguimiento al flujo de caja. No envía email (no hay infra de
 * correo aquí); el solo actúa desde /invoices.
 */
export async function getOverdueInvoices(orgId: string): Promise<InvoiceWithClient[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await db
    .from('invoices')
    .select('*, clients(display_name, company_name, email)')
    .eq('org_id', orgId)
    .lt('due_date', today)
    .gt('balance_due', 0)
    .in('status', ['sent', 'viewed', 'partial', 'overdue'])
    .order('due_date', { ascending: true })
  if (error) throw dbError(error, 'Failed to load overdue invoices')
  return (data ?? []) as InvoiceWithClient[]
}

export async function getInvoice(
  id: string, orgId: string
): Promise<InvoiceWithClient & { items: InvoiceItem[]; payments: InvoicePayment[] }> {
  const [inv, items, payments] = await Promise.all([
    db.from('invoices')
      .select('*, clients(*)')
      .eq('id', id).eq('org_id', orgId).single(),
    db.from('invoice_items')
      .select('*').eq('invoice_id', id).order('sort_order'),
    db.from('invoice_payments')
      .select('*').eq('invoice_id', id).order('payment_date')
  ])
  if (inv.error) throw dbError(inv.error, 'Failed to load the invoice')
  return {
    ...inv.data,
    items:    (items.data   ?? []) as InvoiceItem[],
    payments: (payments.data ?? []) as InvoicePayment[]
  } as any
}

export async function createInvoice(input: {
  orgId:             string
  clientId:          string
  userId:            string
  dueDate:           string
  title?:            string
  notes?:            string
  footer?:           string
  terms?:            string
  /** Defaults to 'USD'. Pass client.default_currency when available. */
  currency?:         string
}): Promise<Invoice> {
  const { data: numData } = await db.rpc('next_invoice_number', { p_org_id: input.orgId })

  const currency = input.currency ?? 'USD'

  // Snapshot the FX rate for non-USD invoices so P&G can be computed at payment time.
  // `as any` cast removed once `supabase gen types typescript` includes fx_rate_at_creation.
  let fxRateAtCreation: number | null = null
  if (currency !== 'USD') {
    const { snapshotFxRate } = await import('./exchange-rate.service')
    fxRateAtCreation = await snapshotFxRate(currency)
  }

  const { data, error } = await (db.from('invoices') as any).insert({
    org_id:               input.orgId,
    client_id:            input.clientId,
    invoice_number:       numData as string,
    due_date:             input.dueDate,
    title:                input.title  ?? null,
    notes:                input.notes  ?? null,
    footer:               input.footer ?? null,
    terms:                input.terms  ?? null,
    currency,
    fx_rate_at_creation:  fxRateAtCreation,
    status:               'draft',
    created_by:           input.userId
  }).select().single()

  if (error) throw dbError(error, 'Failed to create the invoice')
  return data as Invoice
}

export async function updateInvoice(
  id: string,
  input: Partial<Pick<Invoice,
    'title' | 'notes' | 'footer' | 'terms' |
    'due_date' | 'issue_date' | 'currency' | 'status' |
    'sent_at' | 'sent_to' | 'viewed_at'
  >>
): Promise<Invoice> {
  const { data, error } = await db
    .from('invoices').update(input).eq('id', id).select().single()
  if (error) throw dbError(error, 'Failed to update the invoice')
  return data as Invoice
}

// ── Público / envío ──────────────────────────────────────────────────────────

export function buildPublicInvoiceUrl(token: string): string {
  return `${window.location.origin}/i/${token}`
}

export interface PublicInvoicePayload {
  invoice: Invoice & Record<string, any>
  items:   any[]
  org:     { id: string; name: string | null } & Record<string, any>
  client:  { id: string; name: string | null; email: string | null }
}

/** Público (token): trae la invoice + items + org + client para la página /i/:token. */
export async function getInvoiceByPublicToken(token: string, trackView = true): Promise<PublicInvoicePayload> {
  const { data, error } = await db.rpc('get_invoice_by_public_token', {
    p_token: token, p_track_view: trackView
  })
  if (error) throw dbError(error, 'Failed to load the invoice')
  return data as unknown as PublicInvoicePayload
}

/**
 * Marca la invoice como enviada: genera el public_token (si falta), fija
 * status='sent' y sent_at. Devuelve el link público para compartir.
 */
export async function markInvoiceSent(id: string): Promise<{ token: string; url: string }> {
  const { data: existing } = await db
    .from('invoices').select('public_token').eq('id', id).maybeSingle()
  const token = existing?.public_token ?? crypto.randomUUID().replace(/-/g, '')
  const { error } = await db
    .from('invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString(), public_token: token })
    .eq('id', id)
  if (error) throw dbError(error, 'Failed to mark the invoice as sent')
  return { token, url: buildPublicInvoiceUrl(token) }
}

/**
 * Emails the client their invoice's pay link (send-invoice-email edge fn).
 * Separate call from markInvoiceSent() on purpose: marking sent must
 * succeed even if the email fails to go out (network blip, no RESEND key
 * configured yet) -- the accountant still gets the link back either way and
 * can share it manually, same fallback the UI already had before this
 * existed.
 */
export async function sendInvoiceEmail(invoiceId: string): Promise<void> {
  const { data, error } = await db.functions.invoke('send-invoice-email', {
    body: { invoice_id: invoiceId }
  })
  if (error) throw dbError(error, 'Failed to email the invoice')
  const result = data as { error?: string } | null
  if (result?.error) throw new Error(result.error)
}

export async function voidInvoice(id: string): Promise<void> {
  const { error } = await db
    .from('invoices').update({ status: 'void' }).eq('id', id)
  if (error) throw dbError(error, 'Failed to void the invoice')
}

// ── Invoice items ─────────────────────────────────────────────────────────────

export async function upsertItems(
  invoiceId: string,
  orgId:     string,
  items:     Array<Omit<InvoiceItem, 'id' | 'invoice_id' | 'org_id' | 'created_at' |
               'line_subtotal' | 'line_discount' | 'line_tax' | 'line_total'>>
): Promise<InvoiceItem[]> {
  // Delete existing and re-insert (simpler than tracking edits)
  await db.from('invoice_items').delete().eq('invoice_id', invoiceId)

  if (items.length === 0) {
    await db.rpc('compute_invoice_totals', { p_invoice_id: invoiceId })
    return []
  }

  const inserts = items.map((item, i) => ({
    ...item,
    invoice_id: invoiceId,
    org_id:     orgId,
    sort_order: i
  }))

  const { data, error } = await db
    .from('invoice_items').insert(inserts).select()
  if (error) throw dbError(error, 'Failed to save the invoice items')

  // Recompute totals
  await db.rpc('compute_invoice_totals', { p_invoice_id: invoiceId })

  return (data ?? []) as InvoiceItem[]
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function recordPayment(input: {
  invoiceId:   string
  orgId:       string
  userId:      string
  amount:      number
  paymentDate: string
  method?:     string
  reference?:  string
  notes?:      string
}): Promise<InvoicePayment> {
  const { data, error } = await db.from('invoice_payments').insert({
    invoice_id:   input.invoiceId,
    org_id:       input.orgId,
    amount:       input.amount,
    payment_date: input.paymentDate,
    method:       input.method    ?? null,
    reference:    input.reference ?? null,
    notes:        input.notes     ?? null,
    recorded_by:  input.userId
  }).select().single()

  if (error) throw dbError(error, 'Failed to record the payment')

  // Recompute totals (status auto-updates to paid/partial)
  await db.rpc('compute_invoice_totals', { p_invoice_id: input.invoiceId })

  return data as InvoicePayment
}

// ── Dashboard summary ─────────────────────────────────────────────────────────

export async function getInvoiceSummary(orgId: string) {
  const { data, error } = await db
    .from('invoices')
    .select('status, total, balance_due, amount_paid')
    .eq('org_id', orgId)
    .neq('status', 'void')

  if (error) throw dbError(error, 'Failed to load the invoice summary')
  const rows = (data ?? []) as Pick<Invoice, 'status' | 'total' | 'balance_due' | 'amount_paid'>[]

  return {
    total_invoiced: rows.reduce((s, r) => s + r.total, 0),
    total_paid:     rows.reduce((s, r) => s + r.amount_paid, 0),
    total_overdue:  rows.filter(r => r.status === 'overdue').reduce((s, r) => s + r.balance_due, 0),
    total_outstanding: rows.filter(r => !['paid','void'].includes(r.status)).reduce((s, r) => s + r.balance_due, 0),
    count_by_status: rows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
  }
}
