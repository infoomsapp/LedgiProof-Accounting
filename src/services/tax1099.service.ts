// PATH: src/services/tax1099.service.ts
//
// 1099 Fase 3 — Acumulador. Lee el worksheet ya computado por el RPC
// rpc_1099_worksheet (regla "No Backend Logic in Dashboards": la UI no suma
// nada; solo pinta este DTO). Box 1 = pagos reportables sobre tx verificadas.

import { db } from '../lib/supabase'

export type Worksheet1099Readiness =
  | 'ready'            // elegible + W-9 + TIN + sin tx pendientes + ≥ $600 → imprimir
  | 'blocked'         // falta W-9/TIN, o hay tx sin verificar / método desconocido
  | 'below_threshold' // todo verificado pero < $600 (no obligatorio)
  | 'not_1099'        // vendor no elegible (corp sin ser abogado)

export type Worksheet1099Reason =
  | 'missing_w9'
  | 'unverified_transactions'
  | 'unknown_payment_method'
  | 'below_threshold'

export interface Worksheet1099Row {
  vendor_id:          string
  legal_name:         string
  tax_classification: string | null
  is_1099_eligible:   boolean
  w9_status:          string
  default_1099_box:   string | null
  has_tin:            boolean
  box1:               number
  reportable_count:   number
  excluded_count:     number
  review_count:       number
  unverified_count:   number
  meets_threshold:    boolean
  readiness:          Worksheet1099Readiness
  reasons:            Worksheet1099Reason[]
}

export async function get1099Worksheet(
  orgId:    string,
  taxYear:  number,
  clientId?: string | null
): Promise<Worksheet1099Row[]> {
  const { data, error } = await db.rpc('rpc_1099_worksheet', {
    p_org_id:   orgId,
    p_tax_year: taxYear,
    ...(clientId ? { p_client_id: clientId } : {})
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Worksheet1099Row[]
}

// ── Fase 5 — Datos completos para el Copy B / export (TIN descifrado) ────────

export interface Recipient1099 {
  tax_year: number
  payer: {
    name: string | null; tin: string | null
    address_line1: string | null; city: string | null; state: string | null; postal_code: string | null
  }
  recipient: {
    legal_name: string; tin: string | null; tin_type: string | null
    address_line1: string | null; city: string | null; state: string | null; postal_code: string | null
    box: string
  }
  box1: number
  backup_withholding: boolean
}

/** Trae los datos completos de un 1099 (incluye TIN descifrado — gated en el RPC). */
export async function get1099Recipient(vendorId: string, taxYear: number): Promise<Recipient1099> {
  const { data, error } = await db.rpc('get_1099_recipient', {
    p_vendor_id: vendorId,
    p_tax_year:  taxYear
  })
  if (error) throw new Error(error.message)
  return data as unknown as Recipient1099
}

// ── Fase 5 — Export CSV para proveedor de e-file / IRIS ──────────────────────
//
// No transmitimos al IRS nosotros: exportamos un CSV genérico que un proveedor
// (Tax1099, Track1099) o IRIS acepta. Solo incluye vendors 'ready'.

const csvCell = (v: string | number | null | undefined) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Construye el CSV de e-file a partir de los datos de cada recipient 'ready'. */
export function build1099EfileCsv(taxYear: number, rows: Recipient1099[]): string {
  const header = [
    'tax_year', 'form', 'box',
    'payer_name', 'payer_tin',
    'recipient_name', 'recipient_tin', 'recipient_tin_type',
    'recipient_address', 'recipient_city', 'recipient_state', 'recipient_zip',
    'box1_nonemployee_comp', 'backup_withholding'
  ]
  const lines = rows.map(r => [
    taxYear, '1099-NEC', r.recipient.box,
    r.payer.name, r.payer.tin,
    r.recipient.legal_name, r.recipient.tin, r.recipient.tin_type,
    r.recipient.address_line1, r.recipient.city, r.recipient.state, r.recipient.postal_code,
    Number(r.box1).toFixed(2), r.backup_withholding ? 'Y' : 'N'
  ].map(csvCell).join(','))
  return [header.join(','), ...lines].join('\n')
}
