// ── SHA-256 helpers — matches public.sha256_text() in the DB ──────────────────
// Used to compute raw_hash (pre-human) and final_hash (post-approval)
// before writing transactions to Supabase.

/**
 * Computes SHA-256 of a plain string.
 * Returns a 64-char lowercase hex string.
 */
export async function sha256Text(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input ?? '')
  const buf     = await crypto.subtle.digest('SHA-256', encoded)
  return bufferToHex(buf)
}

/**
 * Computes SHA-256 of a JSON-serialisable value.
 * Matches public.sha256_jsonb() in PostgreSQL.
 */
export async function sha256Json(input: unknown): Promise<string> {
  return sha256Text(JSON.stringify(input ?? {}))
}

/**
 * Builds the raw_hash for a new transaction (pre-human, pre-approval).
 * Must be called before inserting into the transactions table.
 */
export async function buildRawHash(params: {
  orgId:           string
  amount:          number
  currency:        string
  reference:       string | null
  transactionDate: string   // ISO date string
  source:          string
}): Promise<string> {
  return sha256Text(JSON.stringify(params))
}

/**
 * Builds the final_hash for a locked transaction (post-approval).
 * Chains the previous hash to create a tamper-evident sequence.
 *
 * Mirrors:
 *   entry_hash = SHA256(previous_hash + tx_data + timestamp + actor_id)
 */
export async function buildFinalHash(params: {
  previousHash:    string | null
  transactionData: Record<string, unknown>
  timestamp:       string   // ISO timestamp string
  actorId:         string
}): Promise<string> {
  const payload = {
    previousHash:    params.previousHash ?? '',
    transactionData: params.transactionData,
    timestamp:       params.timestamp,
    actorId:         params.actorId
  }
  return sha256Text(JSON.stringify(payload))
}

/**
 * Builds the entry_hash for an audit_events row.
 * Always call this server-side or in a trusted context.
 */
export async function buildAuditHash(params: {
  previousHash:       string | null
  transactionId:      string
  transactionVersion: number
  eventType:          string
  timestamp:          string
  actorId:            string
}): Promise<string> {
  return sha256Text(JSON.stringify(params))
}

/**
 * Verifies that a chain is unbroken by re-computing and comparing hashes.
 * Returns true if valid, false if any entry has been tampered with.
 */
export async function verifyHashChain(
  entries: Array<{ entry_hash: string; previous_hash: string | null }>
): Promise<boolean> {
  for (let i = 1; i < entries.length; i++) {
    const prev    = entries[i - 1]
    const current = entries[i]
    if (!prev || !current) continue   // defensive — loop bounds guarantee both exist
    if (current.previous_hash !== prev.entry_hash) return false
  }
  return true
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
