import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'path'

const SITE_URL = 'https://gowthamponnana.com'
const SITE_NAME = "Gowtham's Blog"
const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}/signature.png`
const SOCIAL_META_PATTERN = /<!-- social-meta:start -->[\s\S]*?<!-- social-meta:end -->/

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character])
}

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function absoluteUrl(value) {
  if (!value) return DEFAULT_SOCIAL_IMAGE
  return new URL(value, `${SITE_URL}/`).href
}

function firstPostImage(post) {
  const match = String(post.content || '').match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)
  return absoluteUrl(post.coverImage || match?.[1])
}

function renderSocialMeta({ title, description, url, image, type, publishedAt, updatedAt }) {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeUrl = escapeHtml(url)
  const safeImage = escapeHtml(image)
  const articleMeta = type === 'article'
    ? `
    <meta property="article:published_time" content="${escapeHtml(publishedAt)}" />
    <meta property="article:modified_time" content="${escapeHtml(updatedAt || publishedAt)}" />`
    : ''

  return `<!-- social-meta:start -->
    <meta name="description" content="${safeDescription}" />
    <link rel="canonical" href="${safeUrl}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeTitle}" />${articleMeta}
    <meta name="twitter:card" content="${image === DEFAULT_SOCIAL_IMAGE ? 'summary' : 'summary_large_image'}" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImage}" />
    <!-- social-meta:end -->`
}

function socialPreviewPages() {
  return {
    name: 'social-preview-pages',
    apply: 'build',
    closeBundle() {
      if (process.env.VITE_BUILD_MODE !== 'public') return

      const distDirectory = path.resolve(__dirname, 'dist')
      const indexPath = path.join(distDirectory, 'index.html')
      const indexHtml = readFileSync(indexPath, 'utf8')
      const posts = JSON.parse(
        readFileSync(path.resolve(__dirname, '../content/posts.json'), 'utf8')
      )

      if (!SOCIAL_META_PATTERN.test(indexHtml)) {
        throw new Error('Social metadata markers are missing from the built index.html')
      }

      for (const post of posts.filter((entry) => entry.published === true)) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) {
          throw new Error(`Unsafe published post slug: ${post.slug}`)
        }

        const pageTitle = `${post.title} | ${SITE_NAME}`
        const description = plainText(post.excerpt || post.content)
        const pageUrl = `${SITE_URL}/post/${post.slug}`
        const socialMeta = renderSocialMeta({
          title: pageTitle,
          description,
          url: pageUrl,
          image: firstPostImage(post),
          type: 'article',
          publishedAt: post.date,
          updatedAt: post.updatedAt
        })
        const postHtml = indexHtml
          .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`)
          .replace(SOCIAL_META_PATTERN, socialMeta)
        const outputPath = path.join(distDirectory, 'post', post.slug, 'index.html')

        mkdirSync(path.dirname(outputPath), { recursive: true })
        writeFileSync(outputPath, postHtml)
      }
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: '../content/images/*', dest: 'images' }
      ]
    }),
    socialPreviewPages()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    extensions: ['.jsx', '.js', '.ts', '.tsx'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      },
      '/images': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  }
})
