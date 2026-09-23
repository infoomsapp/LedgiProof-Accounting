// PATH: src/services/w9.service.ts
//
// 1099 Fase 4 — Solicitud y captura de W-9.
//   · requestW9      → marca el vendor como 'requested', genera un token y
//                      devuelve el link público para enviarle al contratista.
//   · getW9Request   → (público) contexto mínimo de la solicitud por token.
//   · submitW9       → (público) el vendor envía su W-9; el vendor pasa a
//                      w9_status='on_file' y se recomputa su elegibilidad 1099.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'

// ── Firma (autenticado) ──────────────────────────────────────────────────────

export function buildW9Url(token: string): string {
  return `${window.location.origin}/w9/${token}`
}

/** Genera (o reusa) el token de solicitud y marca el vendor como 'requested'. */
export async function requestW9(vendorId: string): Promise<{ token: string; url: string }> {
  // Reuse an existing token if present, else create one.
  const { data: existing } = await db
    .from('vendors')
    .select('w9_request_token')
    .eq('id', vendorId)
    .maybeSingle()

  const token = existing?.w9_request_token ?? crypto.randomUUID().replace(/-/g, '')

  const { error } = await db
    .from('vendors')
    .update({
      w9_status:        'requested',
      w9_request_token: token,
      w9_requested_at:  new Date().toISOString()
    })
    .eq('id', vendorId)
  if (error) throw dbError(error, 'Failed to send the W-9 request')

  return { token, url: buildW9Url(token) }
}

// ── Público (token) ──────────────────────────────────────────────────────────

export interface W9RequestContext {
  vendor_id:          string
  legal_name:         string
  already_submitted:  boolean
}

export async function getW9Request(token: string): Promise<W9RequestContext> {
  const { data, error } = await db.rpc('get_w9_request', { p_token: token })
  if (error) throw dbError(error, 'Failed to load the W-9 request')
  return data as unknown as W9RequestContext
}

export interface SubmitW9Input {
  token:               string
  legalName:           string
  taxClassification:   string
  tin:                 string
  tinType:             'ssn' | 'ein'
  addressLine1?:       string
  city?:               string
  state?:              string
  postalCode?:         string
  certName:            string
  backupWithholding?:  boolean
}

export async function submitW9(input: SubmitW9Input): Promise<void> {
  const { error } = await db.rpc('submit_w9', {
    p_token:              input.token,
    p_legal_name:         input.legalName,
    p_tax_classification: input.taxClassification,
    p_tin:                input.tin,
    p_tin_type:           input.tinType,
    ...(input.addressLine1 ? { p_address_line1: input.addressLine1 } : {}),
    ...(input.city         ? { p_city: input.city } : {}),
    ...(input.state        ? { p_state: input.state } : {}),
    ...(input.postalCode   ? { p_postal_code: input.postalCode } : {}),
    p_cert_name:          input.certName,
    p_backup_withholding: input.backupWithholding ?? false
  })
  if (error) throw dbError(error, 'Failed to submit the W-9')
}
