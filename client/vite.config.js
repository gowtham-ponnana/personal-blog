import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import path from 'path'

const SITE_URL = 'https://gowthamponnana.com'
const SITE_NAME = "Gowtham's Blog"
const SOCIAL_CARD_WIDTH = 1200
const SOCIAL_CARD_HEIGHT = 630
const SOCIAL_CARD_VERSION = 2
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

function wrapText(value, maximumCharacters, maximumLines) {
  const words = plainText(value).split(' ').filter(Boolean)
  const lines = []
  let currentLine = ''
  let truncated = false

  for (let index = 0; index < words.length; index += 1) {
    const candidate = currentLine ? `${currentLine} ${words[index]}` : words[index]

    if (candidate.length <= maximumCharacters || !currentLine) {
      currentLine = candidate
      continue
    }

    lines.push(currentLine)
    currentLine = words[index]

    if (lines.length === maximumLines) {
      truncated = true
      break
    }
  }

  if (currentLine && lines.length < maximumLines) {
    lines.push(currentLine)
  } else if (currentLine) {
    truncated = true
  }

  if (truncated && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1]
      .slice(0, maximumCharacters - 1)
      .replace(/[.,;:!?]$/, '')}…`
  }

  return lines
}

function renderSvgText(lines, { x, y, lineHeight, fontFamily, fontSize, fontWeight, fill }) {
  const spans = lines
    .map((line, index) => (
      `<tspan x="${x}" y="${y + (index * lineHeight)}">${escapeHtml(line)}</tspan>`
    ))
    .join('')

  return `<text font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">${spans}</text>`
}

function formatPostDate(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid published post date: ${value}`)
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date)
}

function renderSocialCard(post) {
  const titleLines = wrapText(post.title, 39, 2)
  const titleY = 100
  const titleLineHeight = 62
  const dateY = titleY + ((titleLines.length - 1) * titleLineHeight) + 70
  const excerptY = dateY + 78
  const excerptLines = wrapText(post.excerpt || post.content, 64, 5)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_CARD_WIDTH}" height="${SOCIAL_CARD_HEIGHT}" viewBox="0 0 ${SOCIAL_CARD_WIDTH} ${SOCIAL_CARD_HEIGHT}">
    <rect width="100%" height="100%" fill="#ede1cd" />
    ${renderSvgText(titleLines, {
      x: 72,
      y: titleY,
      lineHeight: titleLineHeight,
      fontFamily: 'Georgia, serif',
      fontSize: 52,
      fontWeight: 700,
      fill: '#3a2b1c'
    })}
    <text x="72" y="${dateY}" font-family="monospace" font-size="23" font-weight="500" fill="#8a7458">${escapeHtml(formatPostDate(post.date))}</text>
    ${renderSvgText(excerptLines, {
      x: 72,
      y: excerptY,
      lineHeight: 42,
      fontFamily: 'monospace',
      fontSize: 27,
      fontWeight: 400,
      fill: '#8a7458'
    })}
  </svg>`
}

function renderSocialMeta({
  title,
  description,
  url,
  canonicalUrl,
  image,
  imageType,
  type,
  publishedAt,
  updatedAt,
  imageWidth,
  imageHeight
}) {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeUrl = escapeHtml(url)
  const safeCanonicalUrl = escapeHtml(canonicalUrl || url)
  const safeImage = escapeHtml(image)
  const imageDetails = imageWidth && imageHeight
    ? `
    <meta property="og:image:secure_url" content="${safeImage}" />
    <meta property="og:image:type" content="${escapeHtml(imageType)}" />
    <meta property="og:image:width" content="${imageWidth}" />
    <meta property="og:image:height" content="${imageHeight}" />`
    : ''
  const articleMeta = type === 'article'
    ? `
    <meta property="article:published_time" content="${escapeHtml(publishedAt)}" />
    <meta property="article:modified_time" content="${escapeHtml(updatedAt || publishedAt)}" />`
    : ''

  return `<!-- social-meta:start -->
    <meta name="description" content="${safeDescription}" />
    <link rel="canonical" href="${safeCanonicalUrl}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeTitle}" />${imageDetails}${articleMeta}
    <meta name="twitter:card" content="${type === 'article' ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta name="twitter:image:alt" content="${safeTitle}" />
    <!-- social-meta:end -->`
}

function socialPreviewPages() {
  return {
    name: 'social-preview-pages',
    apply: 'build',
    async closeBundle() {
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
        const pageUrl = `${SITE_URL}/post/${post.slug}/`
        const socialUrl = `${pageUrl}?card=v${SOCIAL_CARD_VERSION}`
        const socialImagePath = path.join(
          'social',
          `${post.slug}-v${SOCIAL_CARD_VERSION}.jpg`
        )
        const socialImageOutput = path.join(distDirectory, socialImagePath)
        const socialImageUrl = `${SITE_URL}/${socialImagePath}`

        mkdirSync(path.dirname(socialImageOutput), { recursive: true })
        await sharp(Buffer.from(renderSocialCard(post)))
          .flatten({ background: '#ede1cd' })
          .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
          .toFile(socialImageOutput)

        const socialMeta = renderSocialMeta({
          title: pageTitle,
          description,
          url: socialUrl,
          canonicalUrl: pageUrl,
          image: socialImageUrl,
          imageType: 'image/jpeg',
          type: 'article',
          publishedAt: post.date,
          updatedAt: post.updatedAt,
          imageWidth: SOCIAL_CARD_WIDTH,
          imageHeight: SOCIAL_CARD_HEIGHT
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
