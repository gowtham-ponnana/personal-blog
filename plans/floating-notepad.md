# Plan: Floating Notepad (Apple-Notes style)

**Goal:** A small floating icon on the writing dashboard that opens a compact notepad
panel, so to-dos / "what to write" notes live in their own place instead of inside
post content. Keep it simple, clean, and local-only.

**Branch:** `Features` (created from `main`).

## What we have (context)

- Client: React 18 + Vite + Tailwind, icons via `lucide-react`, no extra UI deps.
- Admin area: `/admin` (Dashboard), `/admin/new` and `/admin/edit/:slug` (PostEditor),
  all rendered inside the shared `Layout` component behind `ProtectedRoute`.
- Dark mode is handled with Tailwind `dark:` classes — the notepad must follow that.

## Changes

### 1. New component — `client/src/components/FloatingNotepad.jsx`

- **Trigger (FAB):** `fixed` circular button, bottom-right of the screen.
  Icon: `StickyNote` from `lucide-react`. Subtle shadow, matches the existing
  theme (light + `dark:` variants). `z-50` so it sits above the Tiptap toolbar.
- **Panel:** Apple-Notes-style card, `fixed` bottom-right above the FAB
  (~320–360px wide, ~300–360px tall). Contains:
  - Header row: "Notes" title + close (X) button.
  - Single-line optional title input (e.g. "This week's posts").
  - Plain-text `<textarea>` filling the rest, no chrome, minimal border.
  - Optional tiny "Clear" button in the footer (with confirm), since notes are
    meant to be scratchpad material.
- **Behavior:**
  - FAB click toggles the panel; `Esc` closes it; clicking outside closes it.
  - Auto-save to `localStorage` (key: `justdictate:notes`) on change, debounced
    ~300ms; restore on mount. Nothing is sent to the server — notes are
    per-browser, which fits "keep it simple".
  - Panel is pure React state + Tailwind, no new dependencies.

### 2. Mount point — `client/src/components/Layout/Layout.jsx`

- Render `<FloatingNotepad />` only when the current route starts with `/admin`
  (use `useLocation` from `react-router-dom`). This makes it available on the
  Dashboard *and* the PostEditor, and invisible on public pages (home / post).

### 3. No other changes

- No server/API changes, no new npm packages, no routing changes.

## Files

| File | Change |
| --- | --- |
| `client/src/components/FloatingNotepad.jsx` | New — FAB + panel + localStorage persistence |
| `client/src/components/Layout/Layout.jsx` | Modified — render notepad on `/admin*` routes only |

## Manual QA checklist

- [ ] On `/admin`: small note icon visible bottom-right; click opens panel.
- [ ] On `/admin/new` and `/admin/edit/:slug`: notepad works and doesn't cover
      editor controls or the Tiptap toolbar.
- [ ] Type a note → close panel → reopen → note is still there.
- [ ] Hard refresh → note persists (localStorage).
- [ ] `Esc` and outside-click both close the panel.
- [ ] Looks correct in both light and dark themes.
- [ ] Public pages (`/`, `/post/:slug`) show no icon and no panel.

## Extension (v2): resizable panel

The fixed 340×360 panel was too small to read comfortably, so the panel is
now resizable:

- A drag grip (SVG diagonal lines, `role="separator"`, `cursor: nwse-resize`,
  `touch-action: none`) sits in the panel's **top-left corner** — the natural
  grow direction since the panel is pinned bottom-right.
- Pointer-dragging the grip outward (left/up) grows the panel; clamped to
  min **260×220** and to the viewport (max ≈ `innerWidth − 40` ×
  `innerHeight − 112`). Double-clicking the grip resets to the default
  **340×360**.
- The chosen size persists to `localStorage` under `justdictate:notes:size`
  (separate from the note content key) and restores on next load.
- Text selection is disabled on the page while dragging; pointer listeners
  are removed on `pointerup`/`pointercancel`.

Verified with a 13-check Playwright E2E (default size, grip position/cursor,
grow drag, viewport clamp, min clamp, persistence, double-click reset, note
persistence regression, public pages unaffected).
