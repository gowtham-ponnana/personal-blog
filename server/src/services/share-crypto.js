const crypto = require('crypto')

// Crypto for private share links, writer side. The reader side lives in
// client/src/lib/share-crypto.js and MUST stay byte-compatible with this file.
//
// Why this exists: share snapshots are committed to a public repo. Storing them
// as plaintext at content/shared/<token>.json meant anyone browsing the repo on
// github.com could read both the token and the draft, without ever needing the
// link. So the repo now only ever holds an opaque blob.
//
// The share token is the only secret. Two independent values are derived from
// it with domain separation, so the public filename leaks nothing about the key:
//
//   fileId = base64url(SHA-256("sharefile:v1:" + token))   ← public, the filename
//   key    =           SHA-256("sharekey:v1:"  + token)    ← secret, AES-256-GCM
//
// Both are one-way: seeing a filename in the repo does not get you the token,
// and therefore does not get you the key. The token itself is 128 bits of CSPRNG
// output, so it cannot be guessed either.
//
// Bumping the derivation prefixes invalidates every existing link, which is why
// they carry a version tag.
//
// The envelope carries one plaintext field, `exp`, mirroring the expiry that is
// also sealed inside the ciphertext. Unattended automation (the hourly prune
// workflow) has no token and so cannot read the sealed copy, but it still has
// to know when a blob is due for deletion. `exp` leaks only a timestamp about
// an otherwise opaque blob — nothing about the post.
//
// The sealed copy stays authoritative for rendering: it is authenticated, so it
// cannot be edited to extend a link's life, whereas `exp` is unauthenticated
// and only ever decides when a file gets pruned.//
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

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest()
}

/** Public filename for a token — safe to commit, reveals nothing. */
function deriveFileId(token) {
  return sha256(ID_PREFIX + token).toString('base64url')
}

function deriveKey(token) {
  return sha256(KEY_PREFIX + token)
}

/**
 * Encrypt a snapshot object into the envelope that gets committed.
 * AES-256-GCM: the auth tag is appended to the ciphertext, which is the layout
 * WebCrypto's decrypt() expects on the reader side.
 */
function encryptSnapshot(token, payload) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(token), iv)
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ])

  return {
    v: ENVELOPE_VERSION,
    // Mirrors payload.expiresAt so the prune workflow can act without a token.
    exp: payload.expiresAt || null,
    iv: iv.toString('base64'),
    ct: Buffer.concat([body, cipher.getAuthTag()]).toString('base64'),
  }
}

/**
 * Inverse of encryptSnapshot. The admin server never needs this in normal
 * operation — it exists so the round trip can be tested against the browser
 * implementation. Throws if the token is wrong or the blob was tampered with.
 */
function decryptSnapshot(token, envelope) {
  if (!envelope || !READABLE_VERSIONS.has(envelope.v)) {
    throw new Error(`Unsupported share envelope version: ${envelope && envelope.v}`)
  }

  const raw = Buffer.from(envelope.ct, 'base64')
  const body = raw.subarray(0, raw.length - 16)
  const tag = raw.subarray(raw.length - 16)

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(token),
    Buffer.from(envelope.iv, 'base64')
  )
  decipher.setAuthTag(tag)

  return JSON.parse(
    Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  )
}

module.exports = { deriveFileId, encryptSnapshot, decryptSnapshot, ENVELOPE_VERSION }
