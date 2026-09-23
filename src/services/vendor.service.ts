// PATH: src/services/vendor.service.ts
//
// 1099 Fase 1 — Vendor layer service.
//
// El vendor es el PAGADO (payee) dentro de los libros de un cliente contable.
// Distinto del `clients` (cuyos libros son) y del customer de facturación.
// Este servicio maneja CRUD + la elegibilidad 1099 sugerida + el enlace de una
// transacción a su vendor. La acumulación anual del 1099 vive en un RPC (Fase 3).

import { db } from '../lib/supabase'
import { lookupPattern } from './learning.service'
import type { Database } from '../types/database.types'
import { dbError } from '../lib/errors'

export type Vendor       = Database['public']['Tables']['vendors']['Row']
export type VendorInsert = Database['public']['Tables']['vendors']['Insert']
export type VendorUpdate = Database['public']['Tables']['vendors']['Update']

export type VendorTaxClassification =
  Database['public']['Enums']['vendor_tax_classification']
export type VendorW9Status = Database['public']['Enums']['vendor_w9_status']

// ── Elegibilidad 1099 (regla IRS) ──────────────────────────────────────────
//
// Regla general: se emite 1099-NEC/MISC a individuos, sole props, partnerships
// y LLCs no-corporativas. Las corporaciones (C/S) están EXENTAS, con dos
// excepciones que sí se reportan siempre:
//   · Honorarios de abogados (attorney fees) — aunque el bufete sea corp.
//   · Pagos médicos/salud — no cubierto aquí en v1.
//
// Esto es SÓLO una sugerencia; el humano puede forzar `is_1099_eligible`.
export function suggested1099Eligibility(
  classification: VendorTaxClassification | null | undefined,
  isAttorney = false
): boolean {
  if (isAttorney) return true
  switch (classification) {
    case 'c_corp':
    case 's_corp':
      return false
    // individual, sole_prop, partnership, llc, trust_estate, other → reportable.
    // null/undefined (clasificación desconocida) → por precaución, reportable
    // (mejor pedir W-9 de más que omitir un 1099 obligatorio).
    default:
      return true
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export interface ListVendorsOptions {
  clientId?:      string | null
  includeInactive?: boolean
}

export async function listVendors(
  orgId: string,
  opts: ListVendorsOptions = {}
): Promise<Vendor[]> {
  let q = db.from('vendors').select('*').eq('org_id', orgId)
  if (opts.clientId !== undefined) {
    q = opts.clientId === null ? q.is('client_id', null) : q.eq('client_id', opts.clientId)
  }
  if (!opts.includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q.order('legal_name')
  if (error) throw dbError(error, 'Failed to load vendors')
  return data ?? []
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const { data, error } = await db.from('vendors').select('*').eq('id', id).maybeSingle()
  if (error) throw dbError(error, 'Failed to load the vendor')
  return data
}

export async function createVendor(input: VendorInsert): Promise<Vendor> {
  // Si el caller no fijó elegibilidad explícita, la derivamos de la clasificación.
  const payload: VendorInsert = {
    ...input,
    ...(input.is_1099_eligible === undefined
      ? { is_1099_eligible: suggested1099Eligibility(input.tax_classification ?? null, input.is_attorney ?? false) }
      : {})
  }
  const { data, error } = await db.from('vendors').insert(payload).select().single()
  if (error) throw dbError(error, 'Failed to create the vendor')
  return data
}

export async function updateVendor(id: string, patch: VendorUpdate): Promise<Vendor> {
  const { data, error } = await db.from('vendors').update(patch).eq('id', id).select().single()
  if (error) throw dbError(error, 'Failed to update the vendor')
  return data
}

/** Soft-delete: nunca borramos vendors con historial de pagos. */
export async function deactivateVendor(id: string): Promise<void> {
  const { error } = await db.from('vendors').update({ is_active: false }).eq('id', id)
  if (error) throw dbError(error, 'Failed to deactivate the vendor')
}

// ── Matching / enlace transacción → vendor ──────────────────────────────────

/**
 * Sugiere vendors candidatos para un `merchant_name` crudo del feed bancario.
 * Match simple por nombre (case-insensitive, contains en ambos sentidos).
 * El fuzzy avanzado + auto-fijado vía reglas se implementa en el paso de
 * normalización (learning.service, Fase 1 continuación).
 */
export async function suggestVendorsForMerchant(
  orgId: string,
  merchantName: string,
  clientId?: string | null
): Promise<Vendor[]> {
  const q = merchantName.trim()
  if (!q) return []
  let query = db.from('vendors').select('*').eq('org_id', orgId).eq('is_active', true)
  if (clientId !== undefined && clientId !== null) query = query.eq('client_id', clientId)
  query = query.or(`legal_name.ilike.%${q}%,dba_name.ilike.%${q}%`)
  const { data, error } = await query.limit(10)
  if (error) throw dbError(error, 'Failed to load vendor suggestions')
  return data ?? []
}

/** Enlaza una transacción a su vendor (payee). */
export async function assignVendorToTransaction(
  transactionId: string,
  vendorId: string | null
): Promise<void> {
  const { error } = await db
    .from('transactions')
    .update({ vendor_id: vendorId })
    .eq('id', transactionId)
  if (error) throw dbError(error, 'Failed to assign the vendor')
}

// ── Resolución automática vía aprendizaje ──────────────────────────────────
//
// Usa los patrones aprendidos (user_patterns.vendor_id) para sugerir el vendor
// de una transacción entrante. El flujo de ingest llama a esto; si hay un
// patrón aprendido con confianza, auto-asigna sin intervención humana.

export interface ResolvedVendor {
  vendorId: string
  boost:    number
}

/** Sugiere el vendor aprendido para una descripción/merchant, si existe. */
export async function resolveLearnedVendor(input: {
  orgId:       string
  description: string
  amount?:     number
}): Promise<ResolvedVendor | null> {
  const p = await lookupPattern(input)
  if (p?.vendorId) return { vendorId: p.vendorId, boost: p.boost }
  return null
}

/**
 * Hook de ingest: intenta auto-asignar el vendor aprendido a una transacción.
 * Devuelve el vendorId asignado, o null si no hubo patrón. No lanza — la
 * clasificación no debe romperse si el aprendizaje falla.
 */
export async function autoAssignLearnedVendor(tx: {
  id:            string
  org_id:        string
  description:   string | null
  merchant_name: string | null
}): Promise<string | null> {
  const src = tx.merchant_name ?? tx.description
  if (!src) return null
  try {
    const resolved = await resolveLearnedVendor({ orgId: tx.org_id, description: src })
    if (!resolved) return null
    await assignVendorToTransaction(tx.id, resolved.vendorId)
    return resolved.vendorId
  } catch {
    return null
  }
}
