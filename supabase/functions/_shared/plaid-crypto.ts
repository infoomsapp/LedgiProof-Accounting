// PATH: supabase/functions/_shared/plaid-crypto.ts
//
// Application-level encryption for Plaid access_token values stored in
// bank_connections. Deliberately NOT using Postgres pgcrypto — the key must
// never be reachable from the database itself, so a DB compromise alone
// isn't enough to decrypt tokens. Key lives only as the PLAID_TOKEN_ENCRYPTION_KEY
// Edge Function secret.
//
// Format stored in the DB: base64(iv) + ':' + base64(ciphertext), AES-GCM
// with a random 12-byte IV per encryption.

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get('PLAID_TOKEN_ENCRYPTION_KEY')
  if (!raw) throw new Error('PLAID_TOKEN_ENCRYPTION_KEY secret not set')
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

export async function encryptToken(plain: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain)
  )
  return `${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`
}

export async function decryptToken(stored: string): Promise<string> {
  const [ivB64, cipherB64] = stored.split(':')
  if (!ivB64 || !cipherB64) throw new Error('Malformed encrypted token')
  const key = await getKey()
  const plainBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) },
    key,
    fromBase64(cipherB64)
  )
  return new TextDecoder().decode(plainBytes)
}
