const express = require('express')
const jwt = require('../utils/jwt')
const { commitAndPush } = require('../services/git')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const router = express.Router()

// Share links are git-committed JSON snapshots: content/shared/<token>.json.
// The public site (GitHub Pages) serves them statically at /shared/<token>.json,
// and the SPA route /s/:token fetches + renders them. This reuses the existing
// "git as content bus" pattern — no extra hosting, no KV, no serverless.
// The local admin server is the only writer (create/revoke = file + commitAndPush).

const REPO_ROOT = path.join(__dirname, '..', '..', '..')
const SHARES_DIR = path.join(REPO_ROOT, 'content', 'shared')

function siteBase() {
  return (process.env.PUBLIC_SITE_URL || 'https://gowthamponnana.com').replace(/\/+$/, '')
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

function readShare(token) {
  const p = path.join(SHARES_DIR, `${token}.json`)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function listShares(slugFilter) {
  if (!fs.existsSync(SHARES_DIR)) return []
  const now = Date.now()
  const shares = []
  for (const file of fs.readdirSync(SHARES_DIR)) {
    if (!file.endsWith('.json')) continue
    let s
    try {
      s = JSON.parse(fs.readFileSync(path.join(SHARES_DIR, file), 'utf8'))
    } catch {
      continue
    }
    if (slugFilter && s.slug !== slugFilter) continue
    if (s.expiresAt && new Date(s.expiresAt).getTime() < now) continue // expired
    shares.push(s)
  }
  shares.sort((a, b) => new Date(b.sharedAt) - new Date(a.sharedAt))
  return shares.map((s) => ({ ...s, url: `${siteBase()}/s/${s.token}` }))
}

// POST /api/shares  { slug, expiresInHours? }
// Snapshots the post (draft or published) into content/shared/ and pushes to
// git so GitHub Pages serves it. The link goes live after the GH deploy (~1 min).
router.post('/', jwt.authenticateToken, async (req, res) => {
  try {
    const { slug, expiresInHours } = req.body || {}
    if (!slug) return res.status(400).json({ message: 'slug is required' })

    const post = findPost(slug)
    if (!post) return res.status(404).json({ message: 'Post not found' })

    const token = generateToken()
    const sharedAt = new Date().toISOString()
    const expiresAt =
      Number(expiresInHours) > 0
        ? new Date(Date.now() + Number(expiresInHours) * 3600 * 1000).toISOString()
        : null

    const record = {
      token,
      slug: post.slug,
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || '',
      coverImage: post.coverImage || null,
      date: post.date,
      signature: post.signature || null,
      sharedAt,
      expiresAt,
    }

    fs.mkdirSync(SHARES_DIR, { recursive: true })
    fs.writeFileSync(path.join(SHARES_DIR, `${token}.json`), JSON.stringify(record, null, 2))

    // Commit + push — this also carries any uncommitted content/ assets
    // (e.g. newly uploaded cover images) so they resolve on the public site.
    await commitAndPush(`Share: ${post.slug}`)

    res.status(201).json({ token, url: `${siteBase()}/s/${token}`, expiresAt })
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
    res.json({ shares: listShares(req.query.slug) })
  } catch (error) {
    console.error('Error listing share links:', error)
    if (!res.headersSent) res.status(500).json({ message: 'Failed to list share links' })
  }
})

// DELETE /api/shares/:token — revoke (delete file + push)
router.delete('/:token', jwt.authenticateToken, async (req, res) => {
  try {
    const { token } = req.params
    if (!validateToken(token)) return res.status(404).json({ message: 'Not found' })

    const p = path.join(SHARES_DIR, `${token}.json`)
    if (!fs.existsSync(p)) return res.status(404).json({ message: 'Share link not found' })

    const record = readShare(token)
    fs.unlinkSync(p)
    await commitAndPush(`Revoke share: ${record?.slug || token}`)

    res.json({ message: 'Share link revoked' })
  } catch (error) {
    console.error('Error revoking share link:', error)
    if (!res.headersSent) {
      res.status(500).json({ message: `Failed to revoke share link: ${error.message}` })
    }
  }
})

module.exports = router
