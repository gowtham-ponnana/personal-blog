// Send a MailerLite newsletter for every newly-published post.
//
// Runs in CI (see .github/workflows/newsletter.yml) whenever content/posts.json
// changes. It compares published posts against content/newsletter-sent.json (the
// "already sent" ledger) and, for each post not yet emailed, creates a campaign
// via the MailerLite API and sends it instantly. The ledger is persisted after
// every successful send so a mid-run failure never re-sends what already went out.
//
// No always-on backend is involved — this is ephemeral CI triggered by a push.
//
// Required env:
//   MAILERLITE_API_KEY    - API token (GitHub secret)
//   MAILERLITE_GROUP_ID   - the subscriber group the signup form feeds into
//   MAILERLITE_FROM_EMAIL - a VERIFIED sender email in your MailerLite account
//   SITE_URL              - public base URL, e.g. https://blog.example.com
// Optional env:
//   MAILERLITE_FROM_NAME  - defaults to "Gowtham's Blog"

import { readFile, writeFile } from 'node:fs/promises'

const API = 'https://connect.mailerlite.com/api'

const {
  MAILERLITE_API_KEY,
  MAILERLITE_GROUP_ID,
  MAILERLITE_FROM_EMAIL,
  MAILERLITE_FROM_NAME = "Gowtham's Blog",
  SITE_URL,
} = process.env

// No API key means sending simply is not switched on yet. Exit successfully so
// the workflow can live in the repo, ready for the moment the secret is added,
// without turning every publish into a failed run and a failure email.
if (!MAILERLITE_API_KEY) {
  console.log(
    'MAILERLITE_API_KEY is not set — newsletter sending is not activated. ' +
      'Add the secret (see NEWSLETTER-SETUP.md) to switch it on. Skipping.'
  )
  process.exit(0)
}

// A key WITH something else missing is a different situation: someone tried to
// activate it and got it half-right. That should fail loudly.
const missing = ['MAILERLITE_GROUP_ID', 'MAILERLITE_FROM_EMAIL', 'SITE_URL']
  .filter((k) => !process.env[k])
if (missing.length) {
  console.error(
    `MAILERLITE_API_KEY is set but these are missing: ${missing.join(', ')}. ` +
      'Refusing to send a half-configured campaign.'
  )
  process.exit(1)
}

const POSTS_PATH = 'content/posts.json'
const LEDGER_PATH = 'content/newsletter-sent.json'

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback
    throw err
  }
}

const escapeHtml = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function ml(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MAILERLITE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`MailerLite POST ${path} -> ${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

function emailHtml(post) {
  const base = SITE_URL.replace(/\/$/, '')
  const url = `${base}/post/${post.slug}`
  const date = new Date(post.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  // MailerLite requires an unsubscribe link in custom HTML — {$unsubscribe} is
  // their merge tag and is replaced per-recipient at send time.
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#ffffff;color:#333333;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;margin:0 0 8px;">New post &middot; ${escapeHtml(date)}</p>
    <h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.3;color:#1a1a1a;margin:0 0 16px;">${escapeHtml(post.title)}</h1>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#444444;margin:0 0 24px;">${escapeHtml(post.excerpt || '')}</p>
    <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:12px 22px;border-radius:6px;">Read the post &rarr;</a>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px;">
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9ca3af;line-height:1.5;">
      You&rsquo;re receiving this because you subscribed at ${escapeHtml(base)}.<br>
      <a href="{$unsubscribe}" style="color:#9ca3af;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`
}

async function main() {
  const posts = await readJson(POSTS_PATH, [])
  const ledger = await readJson(LEDGER_PATH, [])
  const sent = new Set(ledger)

  const pending = posts.filter((p) => p.published && p.slug && !sent.has(p.slug))
  if (pending.length === 0) {
    console.log('No newly-published posts to send.')
    return
  }

  // Oldest first, so if multiple posts publish at once they go out in order.
  pending.sort((a, b) => new Date(a.date) - new Date(b.date))

  for (const post of pending) {
    console.log(`Sending newsletter for: ${post.slug}`)
    const campaign = await ml('/campaigns', {
      name: `Blog post: ${post.title}`.slice(0, 255),
      type: 'regular',
      emails: [
        {
          subject: post.title.slice(0, 255),
          from_name: MAILERLITE_FROM_NAME,
          from: MAILERLITE_FROM_EMAIL,
          content: emailHtml(post),
        },
      ],
      groups: [String(MAILERLITE_GROUP_ID)],
    })

    const id = campaign?.data?.id
    if (!id) throw new Error(`No campaign id in create response: ${JSON.stringify(campaign)}`)

    await ml(`/campaigns/${id}/schedule`, { delivery: 'instant' })

    sent.add(post.slug)
    // Persist immediately so a later failure can't undo an already-sent post.
    await writeFile(LEDGER_PATH, JSON.stringify([...sent], null, 2) + '\n')
    console.log(`  ok — campaign ${id} sent, ledger updated`)
  }

  console.log(`Done. ${pending.length} post(s) sent.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
