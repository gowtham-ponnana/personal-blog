# Gowtham's Personal Blog

A minimal, secure personal blog built with React + Express. Features a hidden admin panel, draft/publish workflow, rich text editing, and image upload support — all without a database.

## Tech Stack

### Frontend (Client)
- **React 18** + **Vite 5** — SPA with fast HMR dev server
- **TailwindCSS 3** — Utility-first styling
- **TipTap 2** — WYSIWYG rich text editor (bold, italic, headings, lists, blockquotes, code blocks)
- **React Router DOM 6** — Client-side routing with protected admin routes
- **Axios 1.7** — HTTP client for API calls
- **DOMPurify** + **PrismJS** — XSS sanitization and syntax highlighting

### Backend (Server)
- **Express.js** — RESTful API server
- **JSON file storage** (`data/posts.json`) — No database, simple file-based persistence
- **JWT** (jsonwebtoken) — Stateless authentication via HTTP-only cookies
- **bcryptjs** — Password hashing with salt rounds 12
- **helmet** — Security headers (CSP, XSS protection, HSTS)
- **express-rate-limit** — Brute force protection on login endpoint
- **multer** + **sharp** — Image upload and automatic resizing/compression
- **sanitize-html** — Server-side HTML sanitization

## Architecture

```
personal-blog-site/
├── client/                 # React SPA (Vite)
│   ├── src/
│   │   ├── App.jsx         # Router configuration with protected routes
│   │   ├── main.jsx        # Entry point
│   │   ├── index.css       # Global styles + TipTap editor CSS
│   │   ├── api/client.js   # Axios instance (proxies to server)
│   │   ├── context/        # AuthContext (user state, ProtectedRoute)
│   │   ├── components/     # Reusable UI (Layout, ErrorBoundary, RichTextEditor)
│   │   └── pages/          # Page components (Home, Post, Login, Dashboard, PostEditor)
│   ├── public/             # Static assets (signature.png)
│   └── vite.config.js      # Dev server config + API proxy to :5001
│
├── server/                 # Express REST API
│   ├── src/
│   │   ├── index.js        # Server entry, middleware, route mounting
│   │   ├── routes/         # Auth, Posts, Upload endpoints
│   │   ├── middleware/     # Multer config + Sharp image processing
│   │   └── utils/          # JWT helpers + password utilities
│   ├── data/posts.json     # Blog posts storage (auto-created)
│   ├── public/images/      # Uploaded images served statically
│   └── .env                # Environment variables (NOT committed to GitHub)
│
├── public/signature.png    # Static signature image (root copy for server static serving)
└── README.md               # This file
```

## Security Features

### Authentication & Authorization
- **Hidden login path** — `/gowtham-admin` instead of obvious `/admin/login`
- **HTTP-only cookies** — JWT stored in httpOnly cookie, inaccessible to JavaScript (XSS protection)
- **SameSite: Strict** — Prevents CSRF attacks from cross-origin requests
- **Rate limiting** — 5 login attempts per 15 minutes blocks brute force attacks
- **bcryptjs with salt rounds 12** — Secure password hashing

### Route Protection
| Route | Access | Behavior |
|-------|--------|----------|
| `/` + `/post/:slug` | Public | Anyone can read published posts |
| `/gowtham-admin` | Public (hidden) | Login page, no public links to it |
| `/admin/*` | Admin only | Redirects unauthenticated users to home page |
| Unknown routes (`*`) | All | Silently redirects to home — no hints about admin paths |

### API Security
- **POST/PUT/DELETE** — All require valid JWT via `jwt.authenticateToken` middleware
- **Draft posts** — Return 404 for unauthenticated users, visible only to logged-in admin
- **Image upload** — Requires authentication, 10MB size limit, type validation
- **HTML sanitization** — Server-side `sanitize-html` strips malicious attributes/scripts

### JWT Hardening
- No hardcoded fallback secret — server exits if `JWT_SECRET` not set in `.env`
- Token verified on every protected request via cookie (not localStorage)
- 7-day expiration with automatic logout on expiry

## Getting Started

### Prerequisites
- Node.js 18+ installed

### Installation

```bash
# Clone and install dependencies for both client and server
cd personal-blog-site/client && npm install
cd ../server && npm install

# Set up environment variables (copy example)
cp .env.example .env

# Edit .env with your settings:
#   PORT=5001              # Server port
#   JWT_SECRET=<your-secret>  # Required - no fallback!
```

### Running Locally

Open two terminals:

**Terminal 1 — Backend (port 5001):**
```bash
cd server && node src/index.js
```

**Terminal 2 — Frontend (port 3000):**
```bash
cd client && npm run dev
```

- **Local access:** http://localhost:3000/
- **Network access:** Server runs on `0.0.0.0`, accessible via your LAN IP at http://<YOUR_IP>:3000/ (same Wi-Fi)

### Building for Production

```bash
cd client && npm run build
# Output in client/dist/ — deploy to Netlify, Vercel, or any static host
```

## Admin Access

1. Navigate to the hidden login path: `/gowtham-admin`
2. Login with credentials from `.env`:
   - Username: `Gowtham_Ponnana` (configurable in `server/.env`)
   - Password: Set during initial setup via `generate-hash.js`
3. After login, you'll be redirected to `/admin` dashboard

### Dashboard Features
- **All / Published / Draft** tabs with post counts
- Post list with title, date, status badge (Published/Draft)
- Actions per post: Edit, View (if published), Delete

### Editor Features
- **Rich text editing** — Bold, Italic, Strikethrough, H1-H3 headings
- **Lists** — Bullet and ordered lists
- **Block elements** — Blockquotes, code blocks
- **Media** — Image upload button + paste/drop images from clipboard (auto-uploads via API)
- **Links** — Insert links with URL prompt
- **Excerpt field** — Optional summary shown on home page
- **Cover image** — Optional cover image for posts
- **Preview mode** — Toggle between edit and rendered preview with signature
- **Autosave drafts** — 3-second debounce saves work automatically (new draft posts only)
- **Unsaved changes indicator** — Yellow badge in header when edits haven't been saved
- **Publish / Save as Draft** — Control post visibility

#### Editor Workflow
| Scenario | Buttons shown | Behavior |
|----------|---------------|----------|
| **New post** | Publish Post + Save as Draft | Creates the post; "Save as Draft" keeps it unpublished, "Publish Post" makes it live immediately |
| **Editing a draft** | Save Draft + Publish | "Save Draft" updates content without publishing; "Publish" goes live |
| **Editing a published post** | Publish Changes + Hide Post | "Publish Changes" updates and stays live; "Hide Post" unpublishes (removes from public view, keeps in dashboard) |

> ⚠️ Autosave is **disabled for existing posts** to prevent accidental changes going live. Only new draft posts get autosave protection.

## File Structure Reference

### Client Pages
| Component | Route | Purpose |
|-----------|-------|---------|
| `Home.jsx` | `/` | Public blog listing with excerpts |
| `Post.jsx` | `/post/:slug` | Individual post view with signature |
| `Login.jsx` | `/gowtham-admin` | Hidden admin login form |
| `Dashboard.jsx` | `/admin` | Admin post management (filtered tabs) |
| `PostEditor.jsx` | `/admin/new`, `/admin/edit/:slug` | Create and edit posts |

### Server Routes
| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/auth/login` | POST | No (rate limited) | Authenticate and set JWT cookie |
| `/api/auth/logout` | POST | Yes | Clear authentication cookie |
| `/api/auth/me` | GET | Optional | Check current auth status |
| `/api/posts` | GET | No | List published posts only |
| `/api/posts/:slug` | GET | Optional* | View post (drafts require auth) |
| `/api/posts/admin/all` | GET | Yes | Admin: list all posts with filters |
| `/api/posts` | POST | Yes | Create new post/draft |
| `/api/posts/:slug` | PUT | Yes | Update existing post |
| `/api/posts/:slug` | DELETE | Yes | Delete a post |
| `/api/upload/image` | POST | Yes | Upload and process images (10MB max) |

*\*Unpublished posts return 404 for unauthenticated requests*

## Deployment Notes

### Netlify (Frontend) + Serverless Functions
See `netlify-deployment-guide.md` for detailed deployment instructions.

### VPS / Docker
- Build client: `cd client && npm run build` → serve `dist/` with nginx
- Run server: `cd server && node src/index.js` on port 5001
- Configure reverse proxy (nginx/Caddy) to forward `/api`, `/images` to backend

### Environment Variables (.env)
```
PORT=5001
JWT_SECRET=<your-secret-key>    # REQUIRED - no fallback allowed
JWT_EXPIRES_IN=7d               # Token lifetime
NODE_ENV=development            # Use 'production' for live deployment
```

## Known Limitations
- **File-based storage** — `posts.json` works great for personal blogs but won't scale. Consider migrating to SQLite/PostgreSQL for heavy usage.
- **No role system** — Single admin account, no multi-user support.
- **Dev mode cookies** — In development (`NODE_ENV=development`), JWT cookie is not marked `secure`, meaning it can be intercepted on untrusted networks via packet sniffing. Production auto-enables HTTPS-only cookies.

## Security Audit Summary
All critical paths verified against:
- ✅ Empty/garbage/forged JWT tokens → blocked (401/403)
- ✅ Algorithm confusion attacks (`alg:none`) → rejected
- ✅ Tampered payload signatures → invalid token error
- ✅ Brute force login → rate limited after 5 attempts
- ✅ Unauthenticated API mutations → authentication required
- ✅ Draft post exposure → returns 404 for unauthenticated users
- ✅ Route enumeration → unknown paths redirect to home with no hints
