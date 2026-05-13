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

  // 1. Stage content/
  await git(['add', 'content/'])

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
