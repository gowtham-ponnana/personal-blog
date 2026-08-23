const { execFile } = require('child_process')
const path = require('path')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

// Repo root resolved once at module load.
// __dirname here is server/src/services, so ../../../ → repo root.
const REPO_ROOT = path.join(__dirname, '../../../')

// Read author identity from env (with sensible defaults).
const GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME || 'Gowtham Ponnana'
const GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL || 'ponnana.gowtham@ignislabs.ai'

function gitEnv() {
  return {
    ...process.env,
    GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL,
  }
}

async function git(args, opts = {}) {
  return execFileAsync('git', args, {
    cwd: REPO_ROOT,
    env: gitEnv(),
    ...opts,
  })
}

/**
 * Stage everything under content/, commit with the given message,
 * and push to origin/main. Handles the "remote ahead" case by
 * pulling --rebase once and retrying push.
 *
 * Returns { committed: false } if there was nothing staged to commit.
 * Returns { committed: true, sha } on success.
 * Throws on unrecoverable failure.
 */
async function commitAndPush(message) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('commitAndPush: message must be a non-empty string')
  }

  // 1. Stage content/, minus images that are not public yet.
  //
  //    `git add content/` would sweep in every file under content/images/,
  //    including pictures pasted into an unpublished draft — drafts.json is
  //    gitignored, but the images it points at are not, so an unrelated commit
  //    would push them to the public repo. Stage only the images a published
  //    post or a live share snapshot actually references, and drop any
  //    already-tracked image that is no longer public.
  const { publicImageNames } = await import('../../../scripts/public-assets.mjs')
  const publicImages = publicImageNames(REPO_ROOT)

  await git(['add', 'content/posts.json', 'content/newsletter-sent.json', 'content/shared/'])

  for (const name of publicImages) {
    // -f because content/images/ is gitignored precisely so that only
    // this loop can stage images.
    await git(['add', '-f', `content/images/${name}`])
  }

  // Untrack images that used to be public but no longer are (post deleted,
  // share revoked) and images a previous blanket `git add` swept in. The file
  // stays on disk so local drafts keep rendering.
  const { stdout: trackedOut } = await git(['ls-files', 'content/images/'])
  for (const tracked of trackedOut.split('\n').filter(Boolean)) {
    const name = path.posix.basename(tracked)
    if (!publicImages.has(name)) {
      await git(['rm', '--cached', '--quiet', '--ignore-unmatch', tracked])
    }
  }

  // 2. Detect if anything is staged.
  //    `git diff --staged --quiet` exits 0 when there are NO staged changes,
  //    and exits non-zero (1) when there ARE staged changes.
  let hasChanges = false
  try {
    await git(['diff', '--staged', '--quiet'])
    // Exit 0 → no changes staged.
    hasChanges = false
  } catch (err) {
    // Non-zero exit → changes staged (or a real error). Treat as "has changes";
    // commit will surface a real error if something is genuinely wrong.
    hasChanges = true
  }

  if (!hasChanges) {
    return { committed: false }
  }

  // 3. Commit. Pass message as an argv element (no shell interpolation).
  await git(['commit', '-m', message])

  // 4. Push, with a single rebase-and-retry on rejection.
  try {
    await git(['push', 'origin', 'main'])
  } catch (pushErr) {
    // Try to recover from a non-fast-forward by rebasing on top of remote.
    try {
      await git(['pull', '--rebase', 'origin', 'main'])
    } catch (pullErr) {
      const reason = pullErr.stderr || pullErr.message
      throw new Error(`git push failed and rebase recovery failed: ${reason}`)
    }

    try {
      await git(['push', 'origin', 'main'])
    } catch (retryErr) {
      const reason = retryErr.stderr || retryErr.message
      throw new Error(`git push failed after rebase: ${reason}`)
    }
  }

  // 5. Grab the resulting HEAD sha.
  const { stdout } = await git(['rev-parse', 'HEAD'])
  return { committed: true, sha: stdout.trim() }
}

module.exports = { commitAndPush }
