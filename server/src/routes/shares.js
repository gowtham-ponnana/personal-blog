const express = require('express')
const jwt = require('../utils/jwt')
const { commitAndPush } = require('../services/git')
const { deriveFileId, encryptSnapshot } = require('../services/share-crypto')
const store = require('../services/share-store')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const router = express.Router()

// Share links are git-committed snapshots served statically by GitHub Pages —
// same "git as content bus" pattern as publishing, no KV, no serverless.
//
// The repo is public, so nothing readable goes into it. What gets committed is
// content/shared/<fileId>.json, an AES-256-GCM envelope whose filename is a
// one-way hash of the share token (see services/share-crypto.js). Browsing the
// repo shows a directory of opaque blobs with meaningless names.
//
// The token lives only in the URL fragment of the link. That leaves the admin
// with nothing to list shares by, so the writer keeps content/shares-index.json
// — gitignored local state, exactly like content/drafts.json — mapping tokens to
// the files they unlock. File layout and revocation rules live in
// services/share-store.js, which the publish flow shares.

const REPO_ROOT = path.join(__dirname, '..', '..', '..')

const IMAGE_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function siteBase() {
  return (process.env.PUBLIC_SITE_URL || 'https://gowthamponnana.com').replace(/\/+$/, '')
}

// The token goes in the fragment, so it is never sent to GitHub's servers in a
// request line and never appears in a Referer header. The trailing slash is the
// canonical path: Pages 301s /s to /s/, and skipping that hop avoids relying on
// the fragment surviving a redirect.
function shareUrl(token) {
  return `${siteBase()}/s/#${token}`
}

// 128-bit URL-safe random token — the link IS the secret (unguessable).
function generateToken() {
  return crypto.randomBytes(16).toString('base64url')
}

function validateToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(token)
}

// Look up a post by slug — drafts first, then published.
function findPost(slug) {
  const dir = path.join(REPO_ROOT, 'content')
  for (const file of ['drafts.json', 'posts.json']) {
    const p = path.join(dir, file)
    if (!fs.existsSync(p)) continue
    try {
      const posts = JSON.parse(fs.readFileSync(p, 'utf8'))
      const found = posts.find((x) => x.slug === slug)
      if (found) return found
    } catch (err) {
      console.error(`Error reading ${file}:`, err)
    }
  }
  return null
}

// --- image inlining ---

// A shared draft's images cannot be published alongside it: that would put
// unpublished pictures in the public repo and on the live site, which is
// exactly what scripts/public-assets.mjs exists to prevent. Instead they travel
// inside the encrypted payload as data URIs, so they are as private as the text.
function inlineImage(reference) {
  if (typeof reference !== 'string') return reference
  const match = reference.match(/^\/images\/([^/?#]+)$/)
  if (!match) return reference

  const file = path.join(REPO_ROOT, 'content', 'images', path.basename(match[1]))
  if (!fs.existsSync(file)) return reference

  const mime = IMAGE_MIME_TYPES[path.extname(file).toLowerCase()]
  if (!mime) return reference

  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
}

function inlineImagesInHtml(html) {
  if (typeof html !== 'string') return html
  return html.replace(
    /(<img\b[^>]*?\bsrc=)(["'])(\/images\/[^"']+)\2/gi,
    (match, prefix, quote, src) => {
      const inlined = inlineImage(src)
      return inlined === src ? match : `${prefix}${quote}${inlined}${quote}`
    }
  )
}

// POST /api/shares  { slug, expiresInHours? }
// Snapshots the post, encrypts it under a fresh token, and pushes the blob so
// GitHub Pages serves it. The link goes live after the deploy (~1 min).
router.post('/', jwt.authenticateToken, async (req, res) => {
  try {
    const { slug, expiresInHours } = req.body || {}
    if (!slug) return res.status(400).json({ message: 'slug is required' })

    const post = findPost(slug)
    if (!post) return res.status(404).json({ message: 'Post not found' })

    const token = generateToken()
    const fileId = deriveFileId(token)
    const sharedAt = new Date().toISOString()
    const expiresAt =
      Number(expiresInHours) > 0
        ? new Date(Date.now() + Number(expiresInHours) * 3600 * 1000).toISOString()
        : null

    // Everything the viewer needs, including expiry — keeping expiresAt inside
    // the ciphertext means the public blob does not even reveal when it lapses.
    const snapshot = {
      slug: post.slug,
      title: post.title,
      content: inlineImagesInHtml(post.content),
      excerpt: post.excerpt || '',
      coverImage: inlineImage(post.coverImage) || null,
      date: post.date,
      signature: post.signature || null,
      sharedAt,
      expiresAt,
    }

    store.writeBlob(fileId, encryptSnapshot(token, snapshot))
    store.writeIndex([
      ...store.readIndex().filter((entry) => entry.token !== token),
      { token, fileId, slug: post.slug, title: post.title, sharedAt, expiresAt },
    ])

    await commitAndPush(`Share: ${post.slug}`)

    res.status(201).json({ token, url: shareUrl(token), expiresAt })
  } catch (error) {
    console.error('Error creating share link:', error)
    if (!res.headersSent) {
      res.status(500).json({ message: `Failed to create share link: ${error.message}` })
    }
  }
})

// GET /api/shares?slug=... — list active (non-expired) share links
router.get('/', jwt.authenticateToken, (req, res) => {
  try {
    // Sweep anything already expired so the list never offers a dead link.
    store.pruneExpired()

    const now = Date.now()
    const slugFilter = req.query.slug

    const shares = store.readIndex()
      .filter((entry) => (slugFilter ? entry.slug === slugFilter : true))
      .filter((entry) => !entry.expiresAt || new Date(entry.expiresAt).getTime() >= now)
      .sort((a, b) => new Date(b.sharedAt) - new Date(a.sharedAt))
      .map((entry) => ({ ...entry, url: shareUrl(entry.token) }))

    res.json({ shares })
  } catch (error) {
    console.error('Error listing share links:', error)
    if (!res.headersSent) res.status(500).json({ message: 'Failed to list share links' })
  }
})

// DELETE /api/shares/:token — revoke (delete blob + push)
router.delete('/:token', jwt.authenticateToken, async (req, res) => {
  try {
    const { token } = req.params
    if (!validateToken(token)) return res.status(404).json({ message: 'Not found' })

    const entry = store.readIndex().find((candidate) => candidate.token === token)

    // Fall back to deriving the filename: a link can still be revoked from its
    // token alone if the local index was lost or rebuilt.
    const fileId = entry ? entry.fileId : deriveFileId(token)

    if (!entry && !fs.existsSync(store.blobPath(fileId))) {
      return res.status(404).json({ message: 'Share link not found' })
    }

    store.deleteBlob(fileId)
    store.writeIndex(store.readIndex().filter((candidate) => candidate.token !== token))

    await commitAndPush(`Revoke share: ${entry ? entry.slug : fileId}`)

    res.json({ message: 'Share link revoked' })
  } catch (error) {
    console.error('Error revoking share link:', error)
    if (!res.headersSent) {
      res.status(500).json({ message: `Failed to revoke share link: ${error.message}` })
    }
  }
})

module.exports = router
