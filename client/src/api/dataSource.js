import api from './client.js'

const MODE = import.meta.env.VITE_BUILD_MODE || 'admin'

// Defence in depth. Drafts already live in the gitignored content/drafts.json,
// so posts.json should only ever hold published work — but the public build is
// the last gate before content is world-readable, so it never trusts that.
// Strict `=== true` matches the filter socialPreviewPages() uses in
// vite.config.js: anything not explicitly published stays hidden.
function publishedOnly(posts) {
  return posts.filter((post) => post.published === true)
}

export async function fetchPosts() {
  if (MODE === 'public') {
    const data = await import('../../../content/posts.json')
    return publishedOnly(data.default).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    )
  }
  const res = await api.get('/posts')
  return res.data
}

export async function fetchPost(slug) {
  if (MODE === 'public') {
    const data = await import('../../../content/posts.json')
    const post = publishedOnly(data.default).find(p => p.slug === slug)
    if (!post) throw new Error('Post not found')
    return post
  }
  const res = await api.get(`/posts/${slug}`)
  return res.data
}
