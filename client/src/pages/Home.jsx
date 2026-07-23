import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchPosts } from '../api/dataSource.js'
import Newsletter from '../components/Newsletter.jsx'

export default function Home() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPosts()
  }, [])

  const loadPosts = async () => {
    try {
      const data = await fetchPosts()
      // Sort by date descending (newest first)
      setPosts(data.sort((a, b) => new Date(b.date) - new Date(a.date)))
    } catch (error) {
      console.error('Error fetching posts:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <section className="mb-12">
        <h1 className="font-serif text-4xl font-semibold mb-4">Welcome</h1>
        <p className="text-gray-600 leading-relaxed max-w-2xl">
          A collection of thoughts, ideas, and experiences. Sharing what I learn along the way.
        </p>
      </section>

      {/* Posts List */}
      {posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No posts yet. Check back soon!
        </div>
      ) : (
        <div className="space-y-8">
          {posts.map((post) => (
            <article key={post._id || post.slug} className="border-b border-gray-200 pb-8 last:border-0">
              <Link to={`/post/${post.slug}`}>
                <h2 className="font-serif text-2xl font-medium mb-2 hover:text-gray-700 transition-colors cursor-pointer">
                  {post.title}
                </h2>
                <time className="text-sm text-gray-500 mb-3 block">
                  {new Date(post.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </time>
                {post.excerpt && (
                  <p className="text-gray-600 leading-relaxed">
                    {post.excerpt}
                  </p>
                )}
              </Link>
            </article>
          ))}
        </div>
      )}

      <Newsletter />
    </div>
  )
}
