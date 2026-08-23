import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import RichTextEditor from '../components/Editor/RichTextEditor.jsx'
import api from '../api/client.js'

export default function PostEditor() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const isEditing = !!slug

  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [coverImage, setCoverImage] = useState(null)
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [uploadingCover, setUploadingCover] = useState(false)

  // Meta state
  const [published, setPublished] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Preview mode
  const [previewMode, setPreviewMode] = useState(false)

  // Share (private link) modal
  const [shareModalOpen, setShareModalOpen] = useState(false)

  // Track original published state when editing (to decide which buttons to show)
  const originallyPublishedRef = useRef(false)

  // Autosave ref + debounce
  const autosaveTimerRef = useRef(null)
  const lastSavedRef = useRef({ title: '', content: '', excerpt: '' })

  // Fetch existing post when editing
  useEffect(() => {
    if (isEditing && slug) {
      fetchPost(slug)
    }
  }, [slug])

  const fetchPost = async (postSlug) => {
    try {
      setLoading(true)
      const response = await api.get(`/posts/${postSlug}`)
      const post = response.data
      setTitle(post.title || '')
      setContent(post.content || '')
      setExcerpt(post.excerpt || '')
      setCoverImageUrl(post.coverImage || '')
      setPublished(post.published !== false)
      originallyPublishedRef.current = post.published !== false
      // Sync lastSavedRef so the initial load does NOT trigger a phantom autosave
      lastSavedRef.current = {
        title: post.title || '',
        content: post.content || '',
        excerpt: post.excerpt || '',
      }
    } catch (error) {
      console.error('Error fetching post:', error)
      setError('Failed to load post')
    } finally {
      setLoading(false)
    }
  }

  // Autosave draft — debounced by 3 seconds
  const scheduleAutosave = useCallback(async () => {
    if (!isEditing || !slug || saving) return

    const currentData = { title, content, excerpt }
    if (currentData.title === lastSavedRef.current.title &&
        currentData.content === lastSavedRef.current.content &&
        currentData.excerpt === lastSavedRef.current.excerpt) {
      return // Nothing changed since last save
    }

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)

    autosaveTimerRef.current = setTimeout(async () => {
      try {
        setSaving(true)
        await api.put(`/posts/${slug}`, {
          title: title.trim(),
          content: content.trim(),
          excerpt: excerpt.trim(),
          coverImage,
          // Preserve current published status — only explicit Publish/Draft buttons change it
          published,
        })
        lastSavedRef.current = { ...currentData }
      } catch (error) {
        console.error('Autosave error:', error)
      } finally {
        setSaving(false)
      }
    }, 3000)
  }, [isEditing, slug, title, content, excerpt, coverImage, saving])

  // Autosave: ONLY for new draft posts. Existing posts use manual save only
  // to prevent accidental changes going live on published content.
  useEffect(() => {
    if (!isEditing && (title || content)) {
      scheduleAutosave()
    }
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [title, content, excerpt, isEditing, slug, scheduleAutosave])

  // Detect unsaved changes for existing posts
  const hasUnsavedChanges = isEditing && (
    title !== lastSavedRef.current.title ||
    content !== lastSavedRef.current.content ||
    excerpt !== lastSavedRef.current.excerpt
  )

  const handleCoverImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max size is 10MB.`)
      return
    }

    setUploadingCover(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setCoverImageUrl(response.data.url)
    } catch (error) {
      console.error('Cover image upload error:', error)
      setError(error.response?.data?.message || 'Failed to upload cover image')
    } finally {
      setUploadingCover(false)
      e.target.value = ''
    }
  }

  const handleSubmit = async (e, forcePublished) => {
    e.preventDefault()

    if (!title.trim()) {
      setError('Please enter a title')
      return
    }

    if (!content.trim()) {
      setError('Please enter content')
      return
    }

    setLoading(true)
    setSaving(false)
    setError('')
    setSuccess('')

    // Cancel pending autosave
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)

    try {
      const postData = {
        title: title.trim(),
        content: content.trim(),
        excerpt: excerpt.trim(),
        coverImage,
        published: forcePublished !== undefined ? forcePublished : published,
        signature: { name: 'Gowtham Ponnana', imageUrl: null },
      }

      if (isEditing) {
        await api.put(`/posts/${slug}`, postData)
        const action = forcePublished === true
          ? 'published'
          : (originallyPublishedRef.current ? 'hidden' : 'draft saved');
        setSuccess(`Post ${action} successfully!`);
        lastSavedRef.current = { title: postData.title, content: postData.content, excerpt: postData.excerpt }
      } else {
        // New post
        if (postData.published) {
          const response = await api.post('/posts', postData)
          setSuccess('Post published successfully!')
          setTimeout(() => navigate(`/post/${response.data.slug}`), 1500)
        } else {
          // Save as draft — create with published: false, then navigate to edit
          const response = await api.post('/posts', postData)
          setSuccess('Draft saved! Continue editing.')
          lastSavedRef.current = { title: postData.title, content: postData.content, excerpt: postData.excerpt }
          setTimeout(() => navigate(`/admin/edit/${response.data.slug}`), 1000)
        }
      }
    } catch (error) {
      console.error('Save error:', error)
      setError(error.response?.data?.message || 'Failed to save post')
    } finally {
      setLoading(false)
    }
  }

  if (loading && isEditing) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-8 pb-4 border-b border-gray-200 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold mb-1">
            {isEditing ? 'Edit Post' : 'Write New Post'}
          </h1>
          <p className="text-sm text-gray-500">
            {isEditing ? 'Update your blog post below' : 'Create a new blog post with the editor below'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {/* Status indicators */}
          {!isEditing && !saving && lastSavedRef.current.title && (
            <span className="text-xs text-green-600">Draft saved</span>
          )}
          {isEditing && saving && (
            <span className="text-xs text-gray-400 animate-pulse">Saving…</span>
          )}
          {isEditing && hasUnsavedChanges && !saving && (
            <span className="px-2 py-1 text-xs rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">Unsaved changes</span>
          )}


          {/* Preview toggle */}
          {content.trim() && (
            <button
              type="button"
              onClick={() => setPreviewMode(!previewMode)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                previewMode
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {previewMode ? 'Edit' : 'Preview'}
            </button>
          )}

          {/* Share draft — private one-time link (drafts only) */}
          {isEditing && published === false && (
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className="px-3 py-1.5 text-xs rounded-md font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              🔗 Share
            </button>
          )}
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}

      {/* Preview Mode */}
      {previewMode ? (
        <PreviewPanel content={content} coverImage={coverImageUrl} title={title} />
      ) : (
        /* Form */
        <form onSubmit={(e) => handleSubmit(e, undefined)} className="space-y-6">
          {/* Title Input */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="block w-full px-4 py-3 border border-gray-300 rounded-md text-lg focus:ring-blue-500 focus:border-blue-500 transition-colors font-serif"
              placeholder="Enter your post title..."
            />
          </div>

          {/* Excerpt */}
          <div>
            <label htmlFor="excerpt" className="block text-sm font-medium text-gray-700 mb-2">
              Excerpt (optional — shown on home page)
            </label>
            <textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              className="block w-full px-4 py-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 transition-colors"
              placeholder="A short summary of your post..."
            />
          </div>

          {/* Cover Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cover Image (optional)
            </label>
            <div className="flex items-center gap-4">
              <label className="cursor-pointer px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors inline-block">
                {uploadingCover ? 'Uploading...' : coverImageUrl ? 'Change image' : 'Upload image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverImageUpload}
                  className="hidden"
                  disabled={uploadingCover}
                />
              </label>

              {coverImageUrl && (
                <div className="relative group">
                  <img
                    src={coverImageUrl}
                    alt="Cover preview"
                    className="h-16 object-cover rounded border border-gray-200 max-w-[300px]"
                  />
                  <button
                    type="button"
                    onClick={() => setCoverImageUrl('')}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Published Toggle — for new posts and editing existing posts */}
          <div className="flex items-center gap-3">
            <label htmlFor="published-toggle" className="text-sm text-gray-700 cursor-pointer select-none">
              {isEditing
                ? (published ? 'Post is live' : 'Post is hidden')
                : (published ? 'Published' : 'Draft')}
            </label>
            <button
              type="button"
              id="published-toggle"
              onClick={() => setPublished(!published)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                published ? 'bg-gray-900' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  published ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Content Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
            <RichTextEditor content={content} onChange={setContent} />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 flex-wrap">
            {isEditing && originallyPublishedRef.current ? (
              /* Editing a PUBLISHED post: Publish Changes (stays live) + Hide Post (unpublishes) */
              <>
                <button
                  type="submit"
                  disabled={loading || !title.trim() || !content.trim()}
                  onClick={(e) => handleSubmit(e, true)}
                  className={`px-6 py-3 bg-gray-900 text-white rounded-md font-medium hover:bg-gray-800 transition-colors ${
                    loading || !title.trim() || !content.trim() ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Saving...' : 'Publish Changes'}
                </button>
                <button
                  type="submit"
                  disabled={loading || !title.trim() || !content.trim()}
                  onClick={(e) => handleSubmit(e, false)}
                  className={`px-6 py-3 bg-white text-gray-700 border border-red-300 rounded-md font-medium hover:bg-red-50 transition-colors ${
                    loading || !title.trim() || !content.trim() ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Saving...' : 'Hide Post'}
                </button>
              </>
            ) : isEditing && !originallyPublishedRef.current ? (
              /* Editing a DRAFT post: Save Draft + Publish */
              <>
                <button
                  type="submit"
                  disabled={loading || !title.trim() || !content.trim()}
                  onClick={(e) => handleSubmit(e, false)}
                  className={`px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-md font-medium hover:bg-gray-50 transition-colors ${
                    loading || !title.trim() || !content.trim() ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  type="submit"
                  disabled={loading || !title.trim() || !content.trim()}
                  onClick={(e) => handleSubmit(e, true)}
                  className={`px-6 py-3 bg-gray-900 text-white rounded-md font-medium hover:bg-gray-800 transition-colors ${
                    loading || !title.trim() || !content.trim() ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Saving...' : 'Publish'}
                </button>
              </>
            ) : (
              /* New post: Publish + Save as Draft */
              <>
                <button
                  type="submit"
                  disabled={loading || !title.trim() || !content.trim()}
                  onClick={(e) => handleSubmit(e, true)}
                  className={`px-6 py-3 bg-gray-900 text-white rounded-md font-medium hover:bg-gray-800 transition-colors ${
                    loading || !title.trim() || !content.trim() ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Saving...' : 'Publish Post'}
                </button>
                <button
                  type="submit"
                  disabled={loading || !title.trim() || !content.trim()}
                  onClick={(e) => handleSubmit(e, false)}
                  className={`px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-md font-medium hover:bg-gray-50 transition-colors ${
                    loading || !title.trim() || !content.trim() ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Saving...' : 'Save as Draft'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-md font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>

            {isEditing && (
              <DeleteButton slug={slug} onDeleted={() => navigate('/admin')} loading={loading} />
            )}
          </div>
        </form>
      )}

      {/* Share modal for drafts */}
      {shareModalOpen && isEditing && (
        <ShareModal slug={slug} title={title || 'Untitled draft'} onClose={() => setShareModalOpen(false)} />
      )}
    </div>
  )
}

// --- Sub-components to keep main clean ---

function PreviewPanel({ title, content, coverImage }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Cover image */}
      {coverImage && (
        <img src={coverImage} alt={title} className="w-full h-64 object-cover" />
      )}

      <div className="p-8">
        {/* Excerpt is intentionally NOT shown here — it only appears on the
            home page listing, not on the opened post (and the preview should
            match the opened-post view). */}
        <h1 className="font-serif text-3xl font-semibold mb-6">{title || 'Untitled'}</h1>

        {/* Rendered content */}
        <div
          className="prose prose-gray max-w-none [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:mx-auto [&_img]:my-6 [&_img]:block"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
        />

        {/* Static signature preview */}
        <footer className="mt-8">
          <img src="/signature.png" alt="Signature of Gowtham Naidu Ponnana" className="h-8 object-contain mx-0 mb-1" />
          <p className="font-serif text-base text-gray-700">
            Gowtham Naidu Ponnana
          </p>
        </footer>
      </div>
    </div>
  )
}

function DeleteButton({ slug, onDeleted, loading }) {
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post? This action cannot be undone.')) return
    try {
      await api.delete(`/posts/${slug}`)
      onDeleted()
    } catch (error) {
      console.error('Delete error:', error)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="px-4 py-3 bg-white text-red-600 border border-red-200 rounded-md font-medium hover:bg-red-50 transition-colors ml-auto"
    >
      Delete
    </button>
  )
}

// --- Share modal: create / list / revoke private share links for a draft ---

const EXPIRY_OPTIONS = [
  { value: 24, label: '24 hours' },
  { value: 72, label: '3 days' },
  { value: 168, label: '7 days' },
  { value: 0, label: 'No expiry' },
]
function ShareModal({ slug, title, onClose }) {
  const [expiresInHours, setExpiresInHours] = useState(72)
  const [shares, setShares] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newLink, setNewLink] = useState('')
  const [copied, setCopied] = useState(false)

  const loadShares = async () => {
    try {
      const res = await api.get('/shares', { params: { slug } })
      setShares(res.data.shares || [])
    } catch (err) {
      console.error('Failed to load shares:', err)
    }
  }

  useEffect(() => {
    loadShares()
  }, [slug])

  const handleGenerate = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNewLink('')
    try {
      const res = await api.post('/shares', { slug, expiresInHours })
      setNewLink(res.data.url)
      await loadShares()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create share link')
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async (token) => {
    if (!window.confirm('Revoke this share link? Anyone holding it will lose access.')) return
    try {
      await api.delete(`/shares/${token}`)
      setNewLink((prev) => (prev.includes(token) ? '' : prev))
      await loadShares()
    } catch (err) {
      console.error('Revoke error:', err)
    }
  }

  const handleCopy = async () => {
    if (!newLink) return
    try {
      await navigator.clipboard.writeText(newLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — user can select manually
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Share draft privately</h2>
            <p className="text-xs text-gray-500 truncate max-w-xs">{title}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Creates a private link that works even though the post isn't published. The
          snapshot is encrypted before it is committed — the site's repo is public, but
          only someone holding the link can read it. Shows a “Private preview” banner and
          is never listed on the blog. The link shares the SAVED version of the draft, and
          goes live after the next site deploy (~1 min).
        </p>

        <form onSubmit={handleGenerate} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Link expires in</label>
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={busy}
            className={`w-full px-4 py-2.5 rounded-md font-medium text-sm transition-colors ${
              busy ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {busy ? 'Generating…' : 'Generate link'}
          </button>
        </form>

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {newLink && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-xs font-medium text-green-800 mb-1">Share link (live after next deploy, ~1 min):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs break-all text-gray-800 bg-white border border-gray-200 rounded px-2 py-1.5 select-all">
                {newLink}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Existing share links */}
        {shares.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Active links</p>
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {shares.map((s) => (
                <li key={s.token} className="flex items-center gap-2 text-xs border border-gray-200 rounded-md px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 truncate">{s.url}</p>
                    <p className="text-gray-400">
                      {s.expiresAt
                        ? `expires ${new Date(s.expiresAt).toLocaleString()}`
                        : 'no expiry'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(s.token)}
                    className="text-red-500 hover:text-red-700 font-medium shrink-0"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
