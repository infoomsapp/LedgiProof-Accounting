// PATH: src/services/plaid.service.ts
// Client-side service that calls Plaid-related Edge Functions.
// The PLAID_SECRET never touches this file — it lives in Supabase Vault.
//
// Compatible with both:
//   openPlaidLink('org-id')
//   openPlaidLink({ orgId, clientId, initiatedBy, authorizedBy })
//
// This lets LedgiProof support both:
//   - internal workspace staff flows
//   - client portal flows

import { supabase } from '../lib/supabase'
import { assertQuota, QuotaExceededError } from './quota.service'

// ── Plaid Link script loader (CDN) ────────────────────────────────────────

declare global {
  interface Window {
    Plaid: {
      create: (config: PlaidLinkConfig) => PlaidLinkHandler
    }
  }
}

interface PlaidLinkConfig {
  token: string
  onSuccess: (public_token: string, metadata: PlaidMetadata) => void
  onExit: (err: PlaidError | null, metadata: any) => void
  onLoad?: () => void
  onEvent?: (eventName: string, metadata: any) => void
}

interface PlaidLinkHandler {
  open: () => void
  exit: (options?: { force?: boolean }) => void
}

interface PlaidMetadata {
  institution: { institution_id: string; name: string }
  accounts: Array<{
    id: string
    name: string
    mask: string
    type: string
    subtype: string
  }>
  link_session_id: string
}

interface PlaidError {
  error_code: string
  error_message: string
}

export interface PlaidOpenContext {
  orgId: string
  clientId?: string | null
  initiatedBy?: 'staff' | 'client_portal'
  authorizedBy?: string | null
}

export interface BankConnectionFilters {
  orgId: string
  clientId?: string | null
}

let plaidScriptLoaded = false

async function loadPlaidScript(): Promise<void> {
  if (plaidScriptLoaded || window.Plaid) {
    plaidScriptLoaded = true
    return
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    script.async = true
    script.onload = () => {
      plaidScriptLoaded = true
      resolve()
    }
    script.onerror = () => reject(new Error('Failed to load Plaid Link script'))
    document.head.appendChild(script)
  })
}

function normalizeOpenContext(input: string | PlaidOpenContext): PlaidOpenContext {
  if (typeof input === 'string') {
    return {
      orgId: input,
      clientId: null,
      initiatedBy: 'staff',
      authorizedBy: null
    }
  }

  return {
    orgId: input.orgId,
    clientId: input.clientId ?? null,
    initiatedBy: input.initiatedBy ?? 'staff',
    authorizedBy: input.authorizedBy ?? null
  }
}

// ── Step 1: Get a link_token from our Edge Function ───────────────────────

export async function getLinkToken(): Promise<string> {
  const {
    data: { session }
  } = await supabase.auth.getSession()

  if (!session) throw new Error('Not authenticated')

  const res = await supabase.functions.invoke('plaid-create-link-token', {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })

  if (res.error) throw new Error(res.error.message)

  const data = res.data as { link_token?: string; error?: string }

  if (data.error) throw new Error(data.error)
  if (!data.link_token) throw new Error('No link_token received')

  return data.link_token
}

// ── Step 2+3: Open Plaid Link → exchange token ────────────────────────────

export async function openPlaidLink(
  input: string | PlaidOpenContext
): Promise<{
  institution: string
  accounts: number
  connections: any[]
}> {
  const ctx = normalizeOpenContext(input)

  // 🔒 PRE-FLIGHT QUOTA CHECK — must run before the widget appears, so
  // users at cap see a clear "upgrade" message instead of getting through
  // Plaid only to fail at exchange.
  const check = await assertQuota(ctx.orgId, 'plaid_connections', 1)
  if (!check.allowed) {
    throw new QuotaExceededError('plaid_connections', check)
  }

  await loadPlaidScript()
  const linkToken = await getLinkToken()

  return new Promise((resolve, reject) => {
    const handler = window.Plaid.create({
      token: linkToken,

      onSuccess: async (public_token, metadata) => {
        try {
          const {
            data: { session }
          } = await supabase.auth.getSession()

          if (!session) throw new Error('Session expired')

          const res = await supabase.functions.invoke('plaid-exchange', {
            body: {
              public_token,
              org_id: ctx.orgId,
              client_id: ctx.clientId,
              initiated_by: ctx.initiatedBy,
              authorized_by: ctx.authorizedBy,
              metadata
            },
            headers: { Authorization: `Bearer ${session.access_token}` }
          })

          if (res.error) throw new Error(res.error.message)

          const data = res.data as {
            success: boolean
            connections: any[]
            institution: string
            accounts: number
            error?: string
          }

          if (data.error) throw new Error(data.error)

          resolve({
            institution: data.institution,
            accounts: data.accounts,
            connections: data.connections
          })
        } catch (err) {
          reject(err)
        }
      },

      onExit: (err, _metadata) => {
        if (err) {
          reject(new Error(err.error_message ?? 'Plaid Link exited with error'))
        } else {
          reject(new Error('CANCELLED'))
        }
      }
    })

    handler.open()
  })
}

// ── Step 4: Sync transactions from all connected banks ────────────────────

export async function syncTransactions(
  orgId: string,
  connectionId?: string
): Promise<{ added: number; removed: number; errors?: string[] }> {
  const {
    data: { session }
  } = await supabase.auth.getSession()

  if (!session) throw new Error('Not authenticated')

  const res = await supabase.functions.invoke('plaid-sync', {
    body: { org_id: orgId, connection_id: connectionId },
    headers: { Authorization: `Bearer ${session.access_token}` }
  })

  if (res.error) throw new Error(res.error.message)

  const data = res.data as {
    success: boolean
    added: number
    removed: number
    errors?: string[]
  }

  return {
    added: data.added ?? 0,
    removed: data.removed ?? 0,
    ...(data.errors !== undefined ? { errors: data.errors } : {})
  }
}

// ── Load bank connections for display ────────────────────────────────────

export async function getBankConnections(
  input: string | BankConnectionFilters
) {
  const filters: BankConnectionFilters =
    typeof input === 'string'
      ? { orgId: input, clientId: null }
      : { orgId: input.orgId, clientId: input.clientId ?? null }

  let q = supabase
    .from('bank_connections')
    .select('*')
    .eq('org_id', filters.orgId)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })

  if (filters.clientId) {
    q = q.eq('client_id', filters.clientId)
  }

  const { data, error } = await q

  if (error) throw new Error(error.message)
  return data ?? []
}

// ── Disconnect a bank account ────────────────────────────────────────────

export async function disconnectBank(connectionId: string, orgId: string) {
  const { error } = await supabase
    .from('bank_connections')
    .update({ is_active: false })
    .eq('id', connectionId)
    .eq('org_id', orgId)

  if (error) throw new Error(error.message)
}
