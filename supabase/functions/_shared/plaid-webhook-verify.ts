// PATH: supabase/functions/_shared/plaid-webhook-verify.ts
//
// Verifies that a webhook really came from Plaid, following Plaid's documented
// scheme: every webhook carries a `Plaid-Verification` header holding a JWT
// signed with ES256. The JWT header names a key id; the matching public key
// (a JWK) is fetched from Plaid's /webhook_verification_key/get. A webhook is
// accepted only when
//   1. the JWT header is ES256 and names a key id,
//   2. the signature checks out against that key,
//   3. the JWT was issued in the last 5 minutes (stops replays), and
//   4. its `request_body_sha256` claim equals the SHA-256 of the raw body
//      (stops a valid header being reused with a different body).
// Anything else is rejected, so nobody can make us run syncs by posting to the
// public URL.
//
// Pure WebCrypto, no Deno-only APIs, so it is unit-tested under Node as well.

const MAX_AGE_SECONDS = 5 * 60

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  return bytesToHex(new Uint8Array(digest))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Reads the key id out of the (still unverified) JWT header. */
export function readKeyId(jwt: string): string | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]!)))
    if (header?.alg !== 'ES256' || typeof header?.kid !== 'string') return null
    return header.kid
  } catch {
    return null
  }
}

export type VerifyResult = { ok: true } | { ok: false; reason: string }

/**
 * [jwk] is the public key Plaid returned for the JWT's key id. [nowSeconds]
 * is injectable for tests.
 */
export async function verifyPlaidWebhook(
  jwt: string,
  rawBody: string,
  jwk: JsonWebKey,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<VerifyResult> {
  const parts = jwt.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' }
  if (readKeyId(jwt) === null) return { ok: false, reason: 'unsupported token header' }

  let valid = false
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      // Typed as BufferSource explicitly: newer TypeScript distinguishes
      // ArrayBuffer- from SharedArrayBuffer-backed arrays and rejects a plain
      // Uint8Array here even though it is fine at runtime.
      b64urlToBytes(parts[2]!) as unknown as BufferSource,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    )
  } catch {
    return { ok: false, reason: 'bad key or signature' }
  }
  if (!valid) return { ok: false, reason: 'signature mismatch' }

  let claims: { iat?: number; request_body_sha256?: string }
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]!)))
  } catch {
    return { ok: false, reason: 'malformed claims' }
  }

  if (typeof claims.iat !== 'number') return { ok: false, reason: 'missing iat' }
  if (nowSeconds - claims.iat > MAX_AGE_SECONDS) return { ok: false, reason: 'token too old' }
  if (claims.iat - nowSeconds > 60) return { ok: false, reason: 'token from the future' }

  const bodyHash = await sha256Hex(rawBody)
  if (typeof claims.request_body_sha256 !== 'string' ||
      !constantTimeEqual(claims.request_body_sha256.toLowerCase(), bodyHash)) {
    return { ok: false, reason: 'body does not match' }
  }
  return { ok: true }
}
