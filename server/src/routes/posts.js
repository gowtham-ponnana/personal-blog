const express = require('express')
const jwt = require('../utils/jwt')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const sanitizeHtml = require('sanitize-html')
const { commitAndPush } = require('../services/git')

// Sanitize HTML input to prevent XSS while keeping rich formatting
function sanitizeHTML(html) {
  if (!html || typeof html !== 'string') return ''
  return sanitizeHtml(html, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr', 'strong', 'em', 'u', 's', 'a', 'code', 'pre',
      'blockquote', 'ul', 'ol', 'li', 'img', 'div', 'span'
    ],
    allowedAttributes: {
      'a': ['href', 'title'],
      'img': ['src', 'alt', 'width', 'height'],
      '*': [] // No other attributes (strips onclick, etc.)
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https']
    }
  })
}

// Validate signature object shape
function validateSignature(signature) {
  if (!signature || typeof signature !== 'object') return null
  return {
    name: (signature.name || '').trim() || 'Gowtham Ponnana',
    imageUrl: signature.imageUrl || null,
  }
}

const router = express.Router()

// Content storage (single source of truth at repo root).
const REPO_ROOT = path.join(__dirname, '../../../')
const POSTS_FILE = path.join(REPO_ROOT, 'content/posts.json')
const DRAFTS_FILE = path.join(REPO_ROOT, 'content/drafts.json')

// Simple in-memory lock to prevent concurrent write corruption
let writeLock = Promise.resolve()

function withWriteLock(fn) {
  writeLock = writeLock.then(fn).catch(err => {
    console.error('Write lock error:', err)
    throw err
  })
  return writeLock
}

// Ensure the content directory + files exist
function initializeContentFiles() {
  const dir = path.dirname(POSTS_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (!fs.existsSync(POSTS_FILE)) {
    fs.writeFileSync(POSTS_FILE, JSON.stringify([]), 'utf8')
  }
  if (!fs.existsSync(DRAFTS_FILE)) {
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify([]), 'utf8')
  }
}

initializeContentFiles()

// Read helpers
function getPublishedPosts() {
  try {
    const data = fs.readFileSync(POSTS_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading published posts:', error)
    return []
  }
}

function getDrafts() {
  try {
    if (!fs.existsSync(DRAFTS_FILE)) return []
    const data = fs.readFileSync(DRAFTS_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading drafts:', error)
    return []
  }
}

function getAllPosts() {
  // Published first (real dates), then drafts.
  return [...getPublishedPosts(), ...getDrafts()]
}

// Write helpers (callers should already hold the write lock).
function savePublishedPosts(posts) {
  try {
    const dir = path.dirname(POSTS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf8')
  } catch (error) {
    console.error('Error saving published posts:', error)
    throw new Error('Failed to save post')
  }
}

function saveDrafts(drafts) {
  try {
    const dir = path.dirname(DRAFTS_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8')
  } catch (error) {
    console.error('Error saving drafts:', error)
    throw new Error('Failed to save draft')
  }
}

// Generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100)
}

// GET all posts (admin only) — placed BEFORE /:slug to avoid route conflict
router.get('/admin/all', jwt.authenticateToken, (req, res) => {
  try {
    const { status } = req.query // 'all' | 'draft' | 'published'
    let posts = getAllPosts().sort(
      (a, b) =>
        new Date(b.date || b.updatedAt || 0) -
        new Date(a.date || a.updatedAt || 0)
    )

    if (status === 'draft') {
      posts = posts.filter(p => p.published === false)
    } else if (status === 'published') {
      posts = posts.filter(p => p.published !== false)
    }
    // status === 'all' or missing: return all

    res.json(posts)
  } catch (error) {
    console.error('Error fetching admin posts:', error)
    res.status(500).json({ message: 'Failed to fetch posts' })
  }
})

// GET all posts (public — published only)
router.get('/', (req, res) => {
  try {
    const posts = getPublishedPosts()
      .sort((a, b) => new Date(b.date) - new Date(a.date))

    res.json(posts)
  } catch (error) {
    console.error('Error fetching posts:', error)
    res.status(500).json({ message: 'Failed to fetch posts' })
  }
})

// GET single post by slug (public — drafts only for authenticated admin)
router.get('/:slug', jwt.optionalAuth, (req, res) => {
  try {
    const { slug } = req.params

    // Look in published first.
    const published = getPublishedPosts().find(p => p.slug === slug)
    if (published) {
      return res.json(published)
    }

    // Only authenticated admins can fetch drafts.
    if (req.user) {
      const draft = getDrafts().find(p => p.slug === slug)
      if (draft) {
        return res.json(draft)
      }
    }

    return res.status(404).json({ message: 'Post not found' })
  } catch (error) {
    console.error('Error fetching post:', error)
    res.status(500).json({ message: 'Failed to fetch post' })
  }
})

// POST new post (admin only)
router.post('/', jwt.authenticateToken, async (req, res) => {
  try {
    const { title, content, slug, published, signature, excerpt, coverImage } = req.body

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content required' })
    }

    await withWriteLock(async () => {
      const publishedPosts = getPublishedPosts()
      const drafts = getDrafts()

      // Generate or validate slug
      const postSlug = slug || generateSlug(title)

      // Slug uniqueness must consider BOTH files (§9 gotcha).
      const slugTaken =
        publishedPosts.some(p => p.slug === postSlug) ||
        drafts.some(p => p.slug === postSlug)
      if (slugTaken) {
        throw Object.assign(new Error('Slug already exists'), { status: 409 })
      }

      const newPost = {
        _id: crypto.randomUUID(),
        title: sanitizeHTML(title),
        content: sanitizeHTML(content),
        slug: postSlug,
        excerpt: (excerpt || '').trim() ? sanitizeHTML(excerpt) : '',
        coverImage: coverImage || null,
        date: new Date().toISOString(),
        updatedAt: null,
        published: published !== false, // Default to true
        signature: validateSignature(signature) || {
          name: 'Gowtham Ponnana',
          imageUrl: null,
        },
      }

      if (newPost.published === false) {
        // Draft path — local only, no git activity.
        drafts.push(newPost)
        saveDrafts(drafts)
        res.status(201).json(newPost)
        return
      }

      // Published path — write to posts.json then commit & push.
      // Snapshot the previous state so we can revert on git failure.
      const prevPublished = publishedPosts.slice()
      publishedPosts.push(newPost)
      savePublishedPosts(publishedPosts)

      try {
        await commitAndPush(`Publish: ${newPost.title}`)
      } catch (gitErr) {
        // Revert on-disk state.
        savePublishedPosts(prevPublished)
        console.error('Git push failed on create:', gitErr)
        const status = 500
        return res.status(status).json({
          message: `Publish failed: ${gitErr.message}`,
        })
      }

      res.status(201).json(newPost)
    })
  } catch (error) {
    console.error('Error creating post:', error)
    if (!res.headersSent) {
      const status = error.status || (error.message === 'Slug already exists' ? 409 : 500)
      res.status(status).json({ message: error.message || 'Failed to create post' })
    }
  }
})

// PUT update post (admin only)
router.put('/:slug', jwt.authenticateToken, async (req, res) => {
  try {
    const { slug } = req.params
    const { title, content, published, signature, excerpt, coverImage } = req.body

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content required' })
    }

    await withWriteLock(async () => {
      const publishedPosts = getPublishedPosts()
      const drafts = getDrafts()

      const publishedIndex = publishedPosts.findIndex(p => p.slug === slug)
      const draftIndex = drafts.findIndex(p => p.slug === slug)

      if (publishedIndex === -1 && draftIndex === -1) {
        throw Object.assign(new Error('Post not found'), { status: 404 })
      }

      const wasPublished = publishedIndex !== -1
      const existing = wasPublished ? publishedPosts[publishedIndex] : drafts[draftIndex]
      const willBePublished =
        published !== undefined ? !!published : existing.published !== false

      const updated = {
        ...existing,
        title: sanitizeHTML(title),
        content: sanitizeHTML(content),
        excerpt: (excerpt || '').trim() ? sanitizeHTML(excerpt) : '',
        coverImage: coverImage || null,
        updatedAt: new Date().toISOString(),
        published: willBePublished,
        signature: validateSignature(signature) || existing.signature || {
          name: 'Gowtham Ponnana',
          imageUrl: null,
        },
      }

      // Snapshots for rollback on git failure.
      const prevPublished = publishedPosts.slice()
      const prevDrafts = drafts.slice()

      let commitMessage = null

      if (wasPublished && willBePublished) {
        // (a) Stays published — write in place, commit Update.
        publishedPosts[publishedIndex] = updated
        savePublishedPosts(publishedPosts)
        commitMessage = `Update: ${updated.title}`
      } else if (wasPublished && !willBePublished) {
        // (b) Was published, becomes draft — remove from posts, add to drafts.
        publishedPosts.splice(publishedIndex, 1)
        drafts.push(updated)
        savePublishedPosts(publishedPosts)
        saveDrafts(drafts)
        commitMessage = `Unpublish: ${updated.title}`
      } else if (!wasPublished && !willBePublished) {
        // (c) Stays draft — write in place, NO git.
        drafts[draftIndex] = updated
        saveDrafts(drafts)
        commitMessage = null
      } else {
        // (d) Was draft, becomes published — remove from drafts, add to posts.
        drafts.splice(draftIndex, 1)
        publishedPosts.push(updated)
        saveDrafts(drafts)
        savePublishedPosts(publishedPosts)
        commitMessage = `Publish: ${updated.title}`
      }

      if (commitMessage) {
        try {
          await commitAndPush(commitMessage)
        } catch (gitErr) {
          // Revert both files to their pre-write state.
          savePublishedPosts(prevPublished)
          saveDrafts(prevDrafts)
          console.error('Git push failed on update:', gitErr)
          return res.status(500).json({
            message: `Publish failed: ${gitErr.message}`,
          })
        }
      }

      res.json(updated)
    })
  } catch (error) {
    console.error('Error updating post:', error)
    if (!res.headersSent) {
      res.status(error.status || 500).json({ message: error.message || 'Failed to update post' })
    }
  }
})

// DELETE post (admin only)
router.delete('/:slug', jwt.authenticateToken, async (req, res) => {
  try {
    const { slug } = req.params

    await withWriteLock(async () => {
      const publishedPosts = getPublishedPosts()
      const drafts = getDrafts()

      const publishedIndex = publishedPosts.findIndex(p => p.slug === slug)
      const draftIndex = drafts.findIndex(p => p.slug === slug)

      if (publishedIndex === -1 && draftIndex === -1) {
        throw Object.assign(new Error('Post not found'), { status: 404 })
      }

      const wasPublished = publishedIndex !== -1

      // Snapshots for rollback on git failure.
      const prevPublished = publishedPosts.slice()
      const prevDrafts = drafts.slice()

      if (wasPublished) {
        publishedPosts.splice(publishedIndex, 1)
        savePublishedPosts(publishedPosts)

        try {
          await commitAndPush(`Delete: ${slug}`)
        } catch (gitErr) {
          savePublishedPosts(prevPublished)
          saveDrafts(prevDrafts)
          console.error('Git push failed on delete:', gitErr)
          return res.status(500).json({
            message: `Delete failed: ${gitErr.message}`,
          })
        }
      } else {
        // Draft delete — local only, no git.
        drafts.splice(draftIndex, 1)
        saveDrafts(drafts)
      }

      res.json({ message: 'Post deleted successfully' })
    })
  } catch (error) {
    console.error('Error deleting post:', error)
    if (!res.headersSent) {
      res.status(error.status || 500).json({ message: error.message || 'Failed to delete post' })
    }
  }
})

module.exports = router
