/**
 * Demo-only password hashing (PBKDF2-SHA256 via Web Crypto).
 * NOT production-secure authentication — there is no backend issuing or
 * validating credentials. Never store or transmit plaintext passwords.
 */

const ITERATIONS = 100_000
const PREFIX = 'pbkdf2'

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromB64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    keyMaterial,
    256
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const bits = await derive(password, salt, ITERATIONS)
  return `${PREFIX}$${ITERATIONS}$${toB64(salt.buffer)}$${toB64(bits)}`
}

export function isPbkdf2Hash(stored: string): boolean {
  return stored.startsWith(`${PREFIX}$`)
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isPbkdf2Hash(stored)) {
    // Legacy demo hash (reversible base64) — verify once, never create new.
    return legacyVerify(password, stored)
  }
  const [, iterStr, saltB64, hashB64] = stored.split('$')
  const iterations = Number(iterStr)
  if (!Number.isFinite(iterations) || !saltB64 || !hashB64) return false
  const salt = fromB64(saltB64)
  const expected = fromB64(hashB64)
  const actual = new Uint8Array(await derive(password, salt, iterations))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

/** Legacy encoding kept only so existing demo accounts can sign in once. */
export function legacyEncode(password: string): string {
  return btoa(unescape(encodeURIComponent(`cpos:${password}`)))
}

function legacyVerify(password: string, stored: string): boolean {
  try {
    return legacyEncode(password) === stored
  } catch {
    return false
  }
}
