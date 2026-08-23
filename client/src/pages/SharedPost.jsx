import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import DOMPurify from 'dompurify'
import Prism from 'prismjs'

// Renders a private share link: /s/:token
// Fetches the git-committed snapshot at /shared/<token>.json (static file
// served by GitHub Pages). No backend involved — privacy comes from the
// unguessable token, expiry is checked client-side.
export default function SharedPost() {
  const { token } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    loadSharedPost()
  }, [token])

  const loadSharedPost = async () => {
    try {
      const res = await fetch(`/shared/${token}.json`)
      if (res.status === 404) {
        setError('This share link is invalid or was revoked.')
        return
      }
      if (!res.ok) {
        throw new Error(`Failed to load: ${res.status}`)
      }
      const data = await res.json()
      if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
        setExpired(true)
        return
      }
      setPost(data)
      setTimeout(() => {
        Prism.highlightAllUnder(document.getElementById('post-content'))
      }, 100)
    } catch (err) {
      console.error('Error loading shared post:', err)
      setError('Could not load this share link.')
    } finally {
      setLoading(false)
    }
  }

  const sanitizeContent = (html) => {
    if (!html) return ''
    let sanitized = DOMPurify.sanitize(html)
    sanitized = sanitized.replace(/href="([^"]*?)"/g, (match, href) => {
      if (href.startsWith('#') || href.startsWith('/')) return match
      if (!/^https?:\/\//i.test(href)) href = 'https://' + href
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">`
    })
    return sanitized
  }

  const formatExpiry = (iso) => {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <p className="text-gray-500">Loading shared post...</p>
      </div>
    )
  }

  if (expired || error || !post) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-4xl mb-4">{expired ? '⌛' : '🔒'}</p>
        <p className="text-gray-500 mb-4">
          {expired
            ? 'This share link has expired.'
            : error || 'Share link not found.'}
        </p>
        <Link to="/" className="text-blue-600 hover:text-blue-800 transition-colors">
          ← Back to blog
        </Link>
      </div>
    )
  }

  return (
    <article className="max-w-3xl mx-auto">
      {/* Private preview banner */}
      <div className="mb-8 p-4 rounded-lg bg-amber-50 border border-amber-300 flex items-start gap-3">
        <span className="text-lg leading-none">🔒</span>
        <div className="text-sm">
          <p className="font-semibold text-amber-800">Private preview — unpublished post</p>
          <p className="text-amber-700 mt-1">
            Shared with you directly. This is not on the public blog.
            {post.expiresAt && <> Link expires {formatExpiry(post.expiresAt)}.</>}
          </p>
        </div>
      </div>

      {/* Header */}
      <header className="mb-12 text-center">
        <h1 className="font-serif text-4xl font-semibold mb-4">{post.title}</h1>
        <time className="text-sm text-gray-500 block">
          {new Date(post.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
      </header>

      {/* Cover image */}
      {post.coverImage && (
        <img src={post.coverImage} alt={post.title} className="w-full h-64 object-cover rounded-lg mb-8" />
      )}

      {/* Content */}
      <div
        id="post-content"
        className="prose prose-gray max-w-none font-mono text-base leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:mx-auto [&_img]:my-6 [&_img]:block [&_p>img]:max-w-full [&_p>img]:h-auto"
        dangerouslySetInnerHTML={{ __html: sanitizeContent(post.content) }}
      />

      {/* Static Signature — left-aligned, no border */}
      <footer className="mt-8">
        <img
          src="/signature.png"
          alt="Signature of Gowtham Naidu Ponnana"
          className="h-8 object-contain mx-0 mb-1"
        />
        <p className="font-serif text-base text-gray-700">
          Gowtham Naidu Ponnana
        </p>
      </footer>

      {/* Back Link */}
      <nav className="mt-8 pt-4 border-t border-gray-200">
        <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-2">
          ← Back to all posts
        </Link>
      </nav>
    </article>
  )
}
