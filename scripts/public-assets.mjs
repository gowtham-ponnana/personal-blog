// Single source of truth for "which images are allowed to be public".
//
// Images are uploaded into content/images/ while writing, before anyone knows
// whether the post will be published. Two places therefore need the same
// answer to "is this image public yet?":
//
//   - server/src/services/git.js — what gets committed to the public repo
//   - client/vite.config.js      — what gets deployed to the live site
//
// An image is public only if a published post references it. Draft-only images
// stay on disk, untracked and undeployed.
//
// Share links deliberately do not widen this set. A shared draft's pictures are
// inlined into its encrypted snapshot as data URIs (see
// server/src/routes/shares.js), precisely so that sharing a draft never has the
// side effect of publishing its images.
//
// The check is a substring test against the serialised JSON rather than a URL
// regex on purpose: filenames are unique enough (img-<ms>-<rand>.jpg) that a
// substring match cannot collide, and it cannot be defeated by an image being
// referenced through some markup or field shape we did not anticipate. Missing
// a reference would silently break a published post, so the test errs towards
// including an image.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

function readJson(file) {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Filenames under content/images/ that are safe to publish.
 * Returns a Set of bare filenames, e.g. "img-1777128653662-511995580.jpg".
 */
export function publicImageNames(repoRoot) {
  const imagesDir = path.join(repoRoot, 'content/images')
  if (!existsSync(imagesDir)) return new Set()

  const posts = readJson(path.join(repoRoot, 'content/posts.json'))
  if (!Array.isArray(posts)) return new Set()

  const haystack = JSON.stringify(posts.filter((post) => post.published === true))

  return new Set(
    readdirSync(imagesDir).filter(
      (name) => !name.startsWith('.') && haystack.includes(name)
    )
  )
}
