import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client.js'

export default function Dashboard() {
  const [posts, setPosts] = useState([])
  const [filter, setFilter] = useState('all') // all | published | draft
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchPosts()
  }, [filter]) // Refetch when filter changes

  const fetchPosts = async () => {
    try {
      setLoading(true)
      const response = await api.get('/posts/admin/all', { params: { status: filter } })
      setPosts(response.data.sort((a, b) => new Date(b.date || b.updatedAt || 0) - new Date(a.date || a.updatedAt || 0)))
    } catch (error) {
      console.error('Error fetching posts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (slug) => {
    if (!window.confirm('Are you sure you want to delete this post? This action cannot be undone.')) return

    try {
      await api.delete(`/posts/${slug}`)
      setPosts(posts.filter(p => p.slug !== slug))
    } catch (error) {
      console.error('Delete error:', error)
    }
  }

  const formatDate = (dateStr, updatedStr) => {
    // Show updatedAt if post has been updated, otherwise show date
    const d = updatedStr ? new Date(updatedStr) : new Date(dateStr)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const counts = {
    all: posts.length,
    published: posts.filter(p => p.published !== false).length,
    draft: posts.filter(p => p.published === false).length,
  }

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-8 pb-4 border-b border-gray-200 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold mb-2">Dashboard</h1>
          <p className="text-sm text-gray-500">Manage your blog posts</p>
        </div>
        <Link
          to="/admin/new"
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors inline-block shrink-0 ml-4"
        >
          + New Post
        </Link>
      </header>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {['all', 'published', 'draft'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              filter === f
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f] || 0})
          </button>
        ))}
      </div>

      {/* Posts List */}
      {posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No posts found.</p>
          <Link to="/admin/new" className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block">
            Create your first post →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post._id || post.slug}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <Link to={`/admin/edit/${post.slug}`} className="font-medium text-gray-900 hover:text-gray-700 truncate block">
                  {post.title}
                </Link>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-gray-500">{formatDate(post.date, post.updatedAt)}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      post.published !== false
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {post.published !== false ? 'Published' : 'Draft'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4 shrink-0">
                <Link
                  to={`/admin/edit/${post.slug}`}
                  className="text-sm text-blue-600 hover:text-blue-800 px-2 py-1"
                >
                  Edit
                </Link>
                {post.published !== false && (
                  <Link
                    to={`/post/${post.slug}`}
                    className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1"
                    target="_blank"
                  >
                    View
                  </Link>
                )}
                <button
                  onClick={() => handleDelete(post.slug)}
                  className="text-sm text-red-600 hover:text-red-800 px-2 py-1"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
