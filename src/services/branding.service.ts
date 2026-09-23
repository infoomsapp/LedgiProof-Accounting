// PATH: src/services/branding.service.ts
//
// Facturación paso 5 — Branding de documentos (logo, color, términos, footer,
// instrucciones de pago). Se guarda en la org y se usa en invoices/estimates
// y en las páginas públicas. El logo vive en el bucket público org-branding.

import { db } from '../lib/supabase'
import { dbError } from '../lib/errors'

export interface Branding {
  logo_url:             string | null
  brand_color:          string | null
  invoice_footer:       string | null
  invoice_terms:        string | null
  payment_instructions: string | null
}

const BRANDING_COLS = 'logo_url, brand_color, invoice_footer, invoice_terms, payment_instructions'

export async function getBranding(orgId: string): Promise<Branding> {
  const { data, error } = await db
    .from('organizations')
    .select(BRANDING_COLS)
    .eq('id', orgId)
    .single()
  if (error) throw dbError(error, 'Failed to load branding settings')
  return data as Branding
}

export async function updateBranding(orgId: string, patch: Partial<Branding>): Promise<void> {
  const { error } = await db.from('organizations').update(patch).eq('id', orgId)
  if (error) throw dbError(error, 'Failed to save branding settings')
}

/**
 * Sube el logo al bucket público org-branding en {org_id}/logo.<ext>, guarda la
 * URL pública en la org y la devuelve. Reemplaza el logo previo (upsert).
 */
export async function uploadLogo(orgId: string, file: File): Promise<string> {
  const ext  = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${orgId}/logo.${ext}`
  const { error: upErr } = await db.storage
    .from('org-branding')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) throw dbError(upErr, 'Failed to upload the logo')

  const { data } = db.storage.from('org-branding').getPublicUrl(path)
  // Cache-bust para que el nuevo logo se vea al instante.
  const url = `${data.publicUrl}?v=${Date.now()}`
  await updateBranding(orgId, { logo_url: url })
  return url
}
