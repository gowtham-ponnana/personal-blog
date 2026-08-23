# Private Share Links (GitHub-only, no Cloudflare)

Share an unpublished (or published) post with a private link:
`https://gowthamponnana.com/s/#<22-char-token>`

## How it works

No Cloudflare, no external KV. The content bus is **git**, same as publishing.
The repo is **public**, so nothing readable about a draft ever goes into it: the
share token is a decryption key, and the committed file is an opaque blob.

- **Create**: admin editor → 🔗 Share (drafts only). The local Express server
  (`server/src/routes/shares.js`) snapshots the post, encrypts it under a fresh
  128-bit token, writes `content/shared/<fileId>.json`, then `commitAndPush`.
  The Pages build copies `content/shared/*.json` → `dist/shared/`, so the link
  goes live with the next deploy (~1 min).
- **View**: the public SPA route `/s/` reads the token from the URL fragment,
  re-derives `fileId`, fetches the static blob, and decrypts it in the browser
  with WebCrypto. Renders inside the normal site chrome with a "Private preview
  — unpublished post" banner. No login, no backend.
- **Expiry**: chosen at share time (24h / 3 days / 7 days / never). Stored
  *inside* the ciphertext, so the public blob does not even reveal when it
  lapses. Checked client-side after decryption.
- **Revoke**: Revoke button in the share modal → deletes the blob + pushes →
  the link 404s after the deploy.

## Why it is private on a public repo

The earlier version committed `content/shared/<token>.json` in plaintext. That
was only safe while the repo was private: on a public repo, anyone browsing
`content/shared/` on github.com could read the token *and* the draft body
without ever being given the link. Two changes close that:

**1. The filename is a hash, the content is encrypted.** Both are derived from
the token with domain separation (`server/src/services/share-crypto.js`):

```
fileId = base64url(SHA-256("sharefile:v1:" + token))   ← public, the filename
key    =           SHA-256("sharekey:v1:"  + token)    ← secret, AES-256-GCM
```

Both derivations are one-way, so a filename in the repo does not yield the
token and therefore does not yield the key. What is committed is only
`{v, iv, ct}`. The token is 128 bits of CSPRNG output, so it cannot be guessed.
GCM authenticates, so a wrong token or an edited blob fails loudly instead of
rendering anything.

**2. The token lives in the URL fragment.** Browsers never send a fragment in a
request line, so the token stays out of GitHub's request logs and out of
`Referer` headers when the reader clicks a link inside the draft.

**Images travel inside the ciphertext.** A shared draft's pictures are inlined
as `data:` URIs before encryption. Publishing them as files would have put
unpublished images in the public repo and on the live site — exactly what
`scripts/public-assets.mjs` exists to prevent. The cost is size: a draft with
three photos makes a ~500 KB blob, and that blob is a git object forever.

## Files

| File | Role |
|---|---|
| `server/src/services/share-crypto.js` | Writer-side crypto: `deriveFileId`, `encryptSnapshot` |
| `client/src/lib/share-crypto.js` | Reader-side counterpart (WebCrypto). **Must stay byte-compatible** |
| `server/src/routes/shares.js` | Admin CRUD: `POST /api/shares`, `GET /api/shares?slug=`, `DELETE /api/shares/:token` (JWT-protected); image inlining |
| `server/src/index.js` | Mounts `/api/shares`; serves `content/shared/` at `/shared` for local dev |
| `client/src/pages/SharedPost.jsx` | Public viewer for `/s/#<token>` |
| `client/src/pages/PostEditor.jsx` | Share modal (expiry picker, link + copy, active-links list with Revoke) |
| `client/vite.config.js` | Copies `content/shared/*.json` → `dist/shared/`; dev proxy `/shared` → localhost:5001 |
| `content/shared/` | Committed encrypted blobs (one per link) |
| `content/shares-index.json` | **Gitignored.** Local map of token → fileId/slug/expiry |

### Why there is a local index

The public blob is unreadable and its name is a hash, so the admin UI has
nothing to list shares by. `content/shares-index.json` keeps that mapping on
your machine only — gitignored, exactly like `content/drafts.json`. Committing
it would hand over the keys to every live link.

Losing it costs you the "Active links" list, not control: revoke re-derives
`fileId` from the token, so any link you still have the URL for can be revoked,
and deleting a blob by hand always works.

## Trade-offs

- No true one-time view counting (static hosting has no state) — use a short
  expiry instead.
- Link is live after the GH Pages deploy (~1 min), not instantly.
- Revoking removes the blob from HEAD; it stays in git history as ciphertext.
  That is fine as long as the token was never committed anywhere — it is not.
- Bumping the derivation prefixes in `share-crypto.js` invalidates every
  existing link, which is why they carry a `v1` tag.
- Blob size is dominated by inlined images (see above).

## Local env

`server/.env`:
```
PUBLIC_SITE_URL=https://gowthamponnana.com   # optional; defaults to this
```
