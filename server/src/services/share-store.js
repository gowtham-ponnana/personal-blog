const path = require('path')
const fs = require('fs')
const { deriveFileId } = require('./share-crypto')

// Owns the two halves of a share link on disk:
//
//   content/shared/<fileId>.json   committed, encrypted, public
//   content/shares-index.json      gitignored, local, maps token -> fileId/slug
//
// Both the share routes and the publish flow need to revoke links, so the file
// layout and the revocation rules live here rather than being duplicated.
//
// A share link dies on whichever comes first:
//   1. its expiry passes                  — pruneExpired(), also enforced hourly in CI
//   2. the post it previews goes live     — revokeSharesForSlugs(), at publish time
//   3. it is revoked by hand              — the Revoke button
//
// Rule 2 exists because a share link is a preview of something unpublished. Once
// the post is on the blog there is nothing private left to gate, and leaving the
// link alive would serve a stale snapshot forever, at a URL that never appears
// in the site's own navigation.

const REPO_ROOT = path.join(__dirname, '..', '..', '..')
const SHARES_DIR = path.join(REPO_ROOT, 'content', 'shared')
const INDEX_FILE = path.join(REPO_ROOT, 'content', 'shares-index.json')

function blobPath(fileId) {
  return path.join(SHARES_DIR, `${fileId}.json`)
}

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('Error reading shares index:', err)
    return []
  }
}

function writeIndex(entries) {
  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true })
  fs.writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2))
}

function writeBlob(fileId, envelope) {
  fs.mkdirSync(SHARES_DIR, { recursive: true })
  fs.writeFileSync(blobPath(fileId), JSON.stringify(envelope))
}

function deleteBlob(fileId) {
  const file = blobPath(fileId)
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

/**
 * Drop every share whose entry matches `predicate`, deleting its blob and its
 * index entry. Returns the removed entries so the caller can log or commit.
 */
function removeWhere(predicate) {
  const entries = readIndex()
  const removed = entries.filter(predicate)
  if (removed.length === 0) return []

  for (const entry of removed) {
    // Tolerate an index written before fileId was recorded.
    deleteBlob(entry.fileId || deriveFileId(entry.token))
  }
  writeIndex(entries.filter((entry) => !removed.includes(entry)))
  return removed
}

/**
 * Rule 2: kill the previews for posts that just went live.
 * Called on every publish transition, so it also cleans up any link that should
 * have been revoked by an earlier publish but was not.
 */
function revokeSharesForSlugs(slugs) {
  const targets = new Set(slugs)
  return removeWhere((entry) => targets.has(entry.slug))
}

/** Rule 1, local half: drop anything already past its expiry. */
function pruneExpired(now = Date.now()) {
  return removeWhere(
    (entry) => entry.expiresAt && new Date(entry.expiresAt).getTime() < now
  )
}

module.exports = {
  SHARES_DIR,
  INDEX_FILE,
  blobPath,
  readIndex,
  writeIndex,
  writeBlob,
  deleteBlob,
  removeWhere,
  revokeSharesForSlugs,
  pruneExpired,
}
