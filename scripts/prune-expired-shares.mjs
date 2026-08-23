// Deletes share blobs whose expiry has passed.
//
// The local admin server prunes expired links whenever it touches shares, but
// that only helps while you are at your machine. A link created with a 24-hour
// expiry has to die on time even if you do not open the blog for a week, so this
// runs unattended in CI (.github/workflows/prune-shares.yml).
//
// CI has no share tokens and so cannot read a blob's contents. It reads the
// envelope's plaintext `exp` field instead — see server/src/services/share-crypto.js
// for why that field exists and why the sealed copy stays authoritative for
// rendering.
//
// The other expiry rule — a link dies when its post goes live — is handled at
// publish time in server/src/routes/posts.js, where the slug is actually known.
//
// Prints one line per deletion and exits 0 whether or not anything changed; the
// workflow decides what to commit.

import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHARES_DIR = path.join(REPO_ROOT, 'content/shared')

const now = Date.now()
let removed = 0
let kept = 0

if (!existsSync(SHARES_DIR)) {
  console.log('No content/shared directory — nothing to prune.')
  process.exit(0)
}

for (const file of readdirSync(SHARES_DIR)) {
  if (!file.endsWith('.json')) continue

  const full = path.join(SHARES_DIR, file)
  let envelope

  try {
    envelope = JSON.parse(readFileSync(full, 'utf8'))
  } catch {
    // Never delete something we failed to understand — a parse bug must not
    // become data loss. Surface it and move on.
    console.warn(`SKIP  ${file} — not valid JSON`)
    continue
  }

  // No `exp` means "never expires" (or a pre-v2 blob). Only rule 2 or a manual
  // revoke ends those.
  if (!envelope || !envelope.exp) {
    kept += 1
    continue
  }

  const expiresAt = new Date(envelope.exp).getTime()
  if (Number.isNaN(expiresAt)) {
    console.warn(`SKIP  ${file} — unparseable exp ${JSON.stringify(envelope.exp)}`)
    continue
  }

  if (expiresAt < now) {
    unlinkSync(full)
    console.log(`PRUNE ${file} — expired ${envelope.exp}`)
    removed += 1
  } else {
    kept += 1
  }
}

console.log(`Pruned ${removed} expired share${removed === 1 ? '' : 's'}; ${kept} still live.`)
