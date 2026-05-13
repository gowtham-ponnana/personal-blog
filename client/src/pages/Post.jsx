import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchPost } from '../api/dataSource.js'
import Prism from 'prismjs'
import DOMPurify from 'dompurify'

export default function Post() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadPost()
  }, [slug])

  const loadPost = async () => {
    try {
      const data = await fetchPost(slug)
      setPost(data)

      // Highlight code blocks after content loads
      setTimeout(() => {
        Prism.highlightAllUnder(document.getElementById('post-content'))
      }, 100)
    } catch (error) {
      console.error('Error fetching post:', error)
      setError('Post not found')
    } finally {
      setLoading(false)
    }
  }

  // Sanitize HTML and fix all links to open externally
  const sanitizeContent = (html) => {
    if (!html) return ''
    let sanitized = DOMPurify.sanitize(html)
    // Fix relative URLs — add https:// if missing protocol
    sanitized = sanitized.replace(
      /href="([^"]*?)"/g,
      (match, href) => {
        // Skip internal routes (starting with # or /post/)
        if (href.startsWith('#') || href.startsWith('/')) return match
        // If no protocol, assume http(s)
        if (!/^https?:\/\//i.test(href)) {
          href = 'https://' + href
        }
        return `href="${href}" target="_blank" rel="noopener noreferrer"`
      }
    )
    return sanitized
  }

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  if (error || !post) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">{error}</p>
        <Link to="/" className="text-blue-600 hover:text-blue-800 transition-colors">
          ← Back to blog
        </Link>
      </div>
    )
  }

  return (
    <article className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-12 text-center">
        <h1 className="font-serif text-4xl font-semibold mb-4">{post.title}</h1>
        <time className="text-sm text-gray-500 block">
          {new Date(post.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </time>
      </header>

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
