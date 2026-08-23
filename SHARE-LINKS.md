# Private Share Links (GitHub-only, no Cloudflare)

Share an unpublished (or published) post with a private link:
`https://gowthamponnana.com/s/<22-char-token>`

## How it works

- No Cloudflare, no external KV. The content bus is **git**, same as publishing.
- **Create**: admin editor → 🔗 Share (drafts only). The local Express server
  (`server/src/routes/shares.js`) snapshots the post (title, content, excerpt,
  cover, signature) into `content/shared/<token>.json`, then `commitAndPush`.
  The GitHub Pages build (`vite-plugin-static-copy`) copies
  `content/shared/*.json` → `dist/shared/`, so the link goes live with the
  next deploy (~1 min).
- **View**: the public SPA route `/s/<token>` (in `Layout`, so it renders in
  the normal site chrome) fetches the static JSON and renders it with a
  "Private preview — unpublished post" banner. No login required; the
  unguessable 128-bit token is the access control.
- **Expiry**: chosen at share time (24h / 3 days / 7 days / never). Checked
  client-side — a revoked/expired link shows a friendly "expired" state, and
  revoked links 404 entirely once the revocation is deployed.
- **Revoke**: Revoke button in the share modal → deletes the JSON + pushes →
  link 404s after deploy.

## Files

| File | Role |
|---|---|
| `server/src/routes/shares.js` | Admin CRUD: `POST /api/shares`, `GET /api/shares?slug=`, `DELETE /api/shares/:token` (JWT-protected) |
| `server/src/index.js` | Mounts `/api/shares`; also serves `content/shared/` at `/shared` so `/s/:token` works in local dev |
| `client/src/pages/SharedPost.jsx` | Public viewer for `/s/:token` |
| `client/src/pages/PostEditor.jsx` | Share modal (expiry picker, link + copy, active-links list with Revoke) |
| `client/vite.config.js` | Copies `content/shared/*.json` → `dist/shared/`; dev proxy `/shared` → localhost:5001 |
| `content/shared/` | Committed share snapshots (one JSON per link) |

## Trade-offs vs the Cloudflare KV design

- No true one-time view counting (static hosting has no state) — use a short
  expiry instead.
- Link is live after the GH Pages deploy (~1 min), not instantly.
- Share snapshots (draft content) live in git history until revoked; the repo
  is private, and revocation removes the file from HEAD (history rewrite is a
  separate manual step if ever needed).

## Local env

`server/.env`:
```
PUBLIC_SITE_URL=https://gowthamponnana.com   # optional; defaults to this
```
