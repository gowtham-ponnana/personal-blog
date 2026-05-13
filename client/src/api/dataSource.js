import api from './client.js'

const MODE = import.meta.env.VITE_BUILD_MODE || 'admin'

export async function fetchPosts() {
  if (MODE === 'public') {
    const data = await import('../../../content/posts.json')
    return [...data.default].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    )
  }
  const res = await api.get('/posts')
  return res.data
}

export async function fetchPost(slug) {
  if (MODE === 'public') {
    const data = await import('../../../content/posts.json')
    const post = data.default.find(p => p.slug === slug)
    if (!post) throw new Error('Post not found')
    return post
  }
  const res = await api.get(`/posts/${slug}`)
  return res.data
}
