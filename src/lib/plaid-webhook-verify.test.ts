// The Plaid webhook is a public URL: this is the only thing standing between it
// and anyone who wants to make us run bank syncs. It must accept Plaid's real
// scheme and reject everything else.

import { describe, it, expect } from 'vitest'
import { readKeyId, verifyPlaidWebhook } from '../../supabase/functions/_shared/plaid-webhook-verify'

const enc = new TextEncoder()
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? enc.encode(b) : new Uint8Array(b)
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
const sha256Hex = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))), x => x.toString(16).padStart(2, '0')).join('')

async function keypair() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return { priv: kp.privateKey, jwk: await crypto.subtle.exportKey('jwk', kp.publicKey) }
}

async function sign(priv: CryptoKey, body: string, over: { iat?: number; alg?: string; kid?: string | null; bodyHash?: string } = {}) {
  const header: Record<string, unknown> = { alg: over.alg ?? 'ES256', typ: 'JWT' }
  if (over.kid !== null) header.kid = over.kid ?? 'key-1'
  const claims = { iat: over.iat ?? 1_000_000, request_body_sha256: over.bodyHash ?? await sha256Hex(body) }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, enc.encode(signingInput))
  return `${signingInput}.${b64url(sig)}`
}

const body = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'item-1' })
const NOW = 1_000_000 + 30

describe('verifyPlaidWebhook', () => {
  it('accepts a correctly signed, fresh webhook with a matching body', async () => {
    const { priv, jwk } = await keypair()
    const jwt = await sign(priv, body)
    expect(await verifyPlaidWebhook(jwt, body, jwk, NOW)).toEqual({ ok: true })
  })

  it('rejects when the body was changed after signing', async () => {
    const { priv, jwk } = await keypair()
    const jwt = await sign(priv, body)
    const r = await verifyPlaidWebhook(jwt, body.replace('item-1', 'item-2'), jwk, NOW)
    expect(r.ok).toBe(false)
  })

  it('rejects a token older than 5 minutes (replay)', async () => {
    const { priv, jwk } = await keypair()
    const jwt = await sign(priv, body)
    const r = await verifyPlaidWebhook(jwt, body, jwk, 1_000_000 + 301)
    expect(r).toEqual({ ok: false, reason: 'token too old' })
  })

  it('rejects a token from the future', async () => {
    const { priv, jwk } = await keypair()
    const jwt = await sign(priv, body, { iat: NOW + 3600 })
    expect((await verifyPlaidWebhook(jwt, body, jwk, NOW)).ok).toBe(false)
  })

  it('rejects a signature made by a different key', async () => {
    const a = await keypair()
    const b = await keypair()
    const jwt = await sign(a.priv, body)
    expect(await verifyPlaidWebhook(jwt, body, b.jwk, NOW)).toEqual({ ok: false, reason: 'signature mismatch' })
  })

  it('rejects tampered claims even with a valid-looking header and signature', async () => {
    const { priv, jwk } = await keypair()
    const jwt = await sign(priv, body)
    const [h, , s] = jwt.split('.')
    const forged = `${h}.${b64url(JSON.stringify({ iat: NOW, request_body_sha256: await sha256Hex(body) }))}.${s}`
    expect((await verifyPlaidWebhook(forged, body, jwk, NOW)).ok).toBe(false)
  })

  it('rejects a claimed body hash that does not match, even if properly signed', async () => {
    const { priv, jwk } = await keypair()
    const jwt = await sign(priv, body, { bodyHash: 'a'.repeat(64) })
    expect(await verifyPlaidWebhook(jwt, body, jwk, NOW)).toEqual({ ok: false, reason: 'body does not match' })
  })

  it('rejects non-ES256 tokens and tokens without a key id', async () => {
    const { priv, jwk } = await keypair()
    expect((await verifyPlaidWebhook(await sign(priv, body, { alg: 'HS256' }), body, jwk, NOW)).ok).toBe(false)
    expect((await verifyPlaidWebhook(await sign(priv, body, { kid: null }), body, jwk, NOW)).ok).toBe(false)
  })

  it('rejects garbage', async () => {
    const { jwk } = await keypair()
    expect((await verifyPlaidWebhook('not-a-jwt', body, jwk, NOW)).ok).toBe(false)
    expect((await verifyPlaidWebhook('a.b.c', body, jwk, NOW)).ok).toBe(false)
  })
})

describe('readKeyId', () => {
  it('reads the kid from an ES256 header and nothing else', async () => {
    const { priv } = await keypair()
    expect(readKeyId(await sign(priv, body, { kid: 'abc' }))).toBe('abc')
    expect(readKeyId('garbage')).toBeNull()
  })
})
