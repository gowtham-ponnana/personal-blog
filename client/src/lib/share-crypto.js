// Crypto for private share links, reader side. Byte-compatible counterpart of
// server/src/services/share-crypto.js — read the comment there for the design.
//
// The share token arrives in the URL fragment and never leaves the browser:
// it is turned into the public filename to fetch, and into the AES-256-GCM key
// that decrypts what comes back. Everything here needs a secure context, which
// the live site has (HTTPS is enforced on Pages).//
// Two envelope versions exist in the wild. They are cryptographically identical
// — v2 only adds the plaintext `exp` — so both are readable, and we always
// write the current one. A v1 blob therefore keeps working; it just cannot be
// time-pruned by CI, which has no `exp` to read. Its sealed expiry still gates
// rendering, the publish rule still ends it, and the admin server still prunes
// it locally from the index.

const ID_PREFIX = 'sharefile:v1:'
const KEY_PREFIX = 'sharekey:v1:'
const ENVELOPE_VERSION = 2
const READABLE_VERSIONS = new Set([1, 2])

async function sha256Bytes(text) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  )
  return new Uint8Array(digest)
}

function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Public filename for a token — must match the server's deriveFileId. */
export async function deriveFileId(token) {
  return toBase64Url(await sha256Bytes(ID_PREFIX + token))
}

/**
 * Decrypt a committed envelope back into the snapshot object.
 *
 * Note the envelope's plaintext `exp` field is deliberately ignored: it exists
 * for the unattended prune workflow, is unauthenticated, and must never be what
 * decides whether a reader sees the post. The authoritative expiry is the
 * `expiresAt` sealed inside the ciphertext, which GCM protects from edits.
 * Throws if the token is wrong or the blob was tampered with — GCM
 * authenticates, so a bad token fails loudly rather than yielding garbage.
 */
export async function decryptSnapshot(token, envelope) {
  if (!envelope || !READABLE_VERSIONS.has(envelope.v)) {
    throw new Error(`Unsupported share envelope version: ${envelope && envelope.v}`)
  }

  const key = await crypto.subtle.importKey(
    'raw',
    await sha256Bytes(KEY_PREFIX + token),
    'AES-GCM',
    false,
    ['decrypt']
  )

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
    key,
    fromBase64(envelope.ct)
  )

  return JSON.parse(new TextDecoder().decode(plaintext))
}
