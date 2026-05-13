# Netlify Deployment Guide

## Option 1: Frontend Only on Netlify + Separate Backend Server

### Step 1 — Deploy Frontend to Netlify

```bash
cd client && npm run build
# Output is in client/dist/
```

In your `client/netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Step 2 — Deploy Backend Elsewhere

Deploy the Express server on **Render**, **Railway**, or a VPS. Point your frontend's API proxy to the backend URL by updating `client/src/api/client.js`:

```js
const api = axios.create({
  baseURL: 'https://your-backend-url.com/api', // Change this for production
  withCredentials: true, // Required for cookie auth
});
```

### Step 3 — Set Environment Variables on Netlify

In Netlify dashboard → Site settings → Environment variables:
- No client-side secrets needed (JWT is handled server-side via cookies)

---

## Option 2: Full Stack on Netlify with Serverless Functions

Convert Express routes to Netlify functions for a single deployment.

### Step 1 — Create `netlify.toml` at project root

```toml
[build]
  command = "cd client && npm install && npm run build"
  publish = "client/dist"
  functions = "serverless/"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Step 2 — Migrate Server Routes

Each route file becomes a Netlify function in `serverless/`:

**`serverless/auth.js`:**
```js
const server = require('../server/src/index'); // or copy route handlers directly

export async function handler(event, context) {
  return new Promise((resolve) => {
    const req = { headers: event.headers, body: JSON.parse(event.body || '{}'), method: event.httpMethod };
    const res = { statusCode: 200, headers: {}, body: '' };
    // ... adapt Express handlers to Netlify function format
    resolve({ statusCode: res.statusCode, headers: res.headers, body: res.body });
  });
}
```

### Step 3 — Deploy

Push to GitHub → Connect repo to Netlify → Auto-deploys on push.

---

## Environment Variables (for any deployment)

Set these in your hosting platform's environment variables panel:

| Variable | Value | Required? |
|----------|-------|-----------|
| `PORT` | `5001` (or whatever the platform assigns) | No |
| `JWT_SECRET` | Strong random string (32+ chars) | **Yes** — server will not start without it |
| `JWT_EXPIRES_IN` | `7d` | No (defaults to 7 days) |
| `NODE_ENV` | `production` | Recommended for live deployment |

### Generate a Strong JWT Secret

```bash
# In terminal:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output into your `.env` or hosting platform's environment variables.

---

## Pre-Deployment Checklist

- [ ] `JWT_SECRET` is set to a strong random value (not the example)
- [ ] Admin password hash updated in `server/src/routes/auth.js`
- [ ] `NODE_ENV=production` — enables `secure: true` on JWT cookies (HTTPS only)
- [ ] CORS origin in `server/src/index.js` includes your production domain
- [ ] `.env` is in `.gitignore` and NOT committed to GitHub
- [ ] Test the deployed site with a fresh browser session
