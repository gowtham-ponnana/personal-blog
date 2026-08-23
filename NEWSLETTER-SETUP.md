# Newsletter setup (MailerLite + GitHub Action)

The blog collects subscribers and emails them when a new post is published —
with **no always-on backend**. MailerLite hosts the signup form and delivers
the email; a GitHub Action (triggered by your publish push) tells MailerLite
what to send.

## How it works

1. **Signup** — `client/src/components/Newsletter.jsx` links out to MailerLite's
   hosted signup page. Emails go straight to MailerLite, never to us, and no
   third-party script runs on the blog. **This half is already live.**
2. **Send on publish** — publishing changes `content/posts.json`, which triggers
   `.github/workflows/newsletter.yml`. `scripts/send-newsletter.mjs` finds any
   published post not yet in `content/newsletter-sent.json` (the ledger), creates
   a MailerLite campaign, sends it instantly, and records the slug so it never
   re-sends.

## One-time setup

### In MailerLite (free account)
1. **Verify a sender** — Settings → Domains. Verify the email you'll send *from*
   (sends are rejected until this is done).
2. **Create a group** — Subscribers → Groups → "Newsletter". Get its **Group ID**:
   right-click the group name → copy link → the number after `group` in the URL.
3. **Point the signup form at that group** — the hosted form already linked from
   the blog must add subscribers to the "Newsletter" group, or sends will go to
   an empty audience.
4. **Generate an API token** — Integrations → API → Use → Generate new token.
   **Copy it immediately** (shown only once).

### In GitHub → Settings → Secrets and variables → Actions
**Secrets:**
| Name | Value |
|------|-------|
| `MAILERLITE_API_KEY` | API token (step 4) |

**Variables:**
| Name | Value |
|------|-------|
| `MAILERLITE_GROUP_ID` | group ID (step 2) |
| `MAILERLITE_FROM_EMAIL` | verified sender (step 1) |
| `MAILERLITE_FROM_NAME` | e.g. `Gowtham's Blog` (optional) |
| `SITE_URL` | live blog URL (for the "Read the post" link) |

> The token is the only secret (it can send email). The rest are public or
> non-sensitive, so they're plain Variables.

## Until it is switched on

The workflow ships in the repo but does nothing without `MAILERLITE_API_KEY`:
`scripts/send-newsletter.mjs` logs that sending is not activated and exits 0, so
publishing never fails on a missing secret. Adding the secret is what switches
it on — no code change. A key present with any other value missing fails loudly
instead, since that means a half-finished activation rather than an unused one.

## Sending by hand (no API token, no plan requirement)

You do not need any of the automation to email subscribers. MailerLite's own
dashboard can do it: Campaigns → Create, pick the "Newsletter" group, write or
paste the content, send. The only prerequisite is a verified sender.

To avoid rebuilding the layout each time, render the same email this repo would
have sent and paste it in:

```bash
node scripts/send-newsletter.mjs --render                 # newest unsent post
node scripts/send-newsletter.mjs --render <slug>          # a specific post
```

It prints the subject line and writes the HTML to `.tmp/` (gitignored). Paste
that into a MailerLite campaign's custom-HTML block and send it yourself. No
token, no secrets, and none of the plan limits that apply to the API.

Then record it, or automation will email that post again the day it is
switched on:

```bash
node scripts/send-newsletter.mjs --mark-sent <slug>
git add content/newsletter-sent.json && git commit -m "chore(newsletter): sent <slug>"
```

## Testing the send
You're the only subscriber at first, so it's self-contained. Run locally against
your account (temporarily remove the seed slug from `content/newsletter-sent.json`
or add a throwaway published post so there's something pending):

```bash
MAILERLITE_API_KEY=... MAILERLITE_GROUP_ID=... \
MAILERLITE_FROM_EMAIL=you@verified.com SITE_URL=https://your-blog-url \
node scripts/send-newsletter.mjs
```

## Known caveat
Sending **custom HTML** via the campaign API was historically an "Advanced plan"
feature; MailerLite has been opening it to free accounts. If the first send fails
with a plan/`content` error, the fallback is MailerLite's native **RSS-to-email**
(point it at a generated `feed.xml` instead of using the API).

## Notes
- The ledger commit-back needs `contents: write`. If `main` gets branch protection
  requiring PRs, that push fails and the ledger needs a different store.
- `content/newsletter-sent.json` is pre-seeded with the existing post so activating
  this doesn't email it retroactively.
- New subscribers go through MailerLite's double opt-in (a confirmation email).
