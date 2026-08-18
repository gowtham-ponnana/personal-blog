import React, { useEffect, useRef, useState } from 'react'
import { StickyNote, X, Trash2 } from 'lucide-react'

const STORAGE_KEY = 'justdictate:notes'
const SIZE_KEY = 'justdictate:notes:size'
const SAVE_DEBOUNCE_MS = 300
const DEFAULT_SIZE = { w: 340, h: 360 }
const MIN_SIZE = { w: 260, h: 220 }

function loadSize() {
  try {
    const raw = localStorage.getItem(SIZE_KEY)
    if (!raw) return DEFAULT_SIZE
    const parsed = JSON.parse(raw)
    const w = Number(parsed?.w)
    const h = Number(parsed?.h)
    return {
      w: Number.isFinite(w) ? Math.max(MIN_SIZE.w, w) : DEFAULT_SIZE.w,
      h: Number.isFinite(h) ? Math.max(MIN_SIZE.h, h) : DEFAULT_SIZE.h,
    }
  } catch {
    return DEFAULT_SIZE
  }
}

function maxResize() {
  return {
    w: Math.max(MIN_SIZE.w, window.innerWidth - 40),
    h: Math.max(MIN_SIZE.h, window.innerHeight - 112), // 96px bottom offset + headroom
  }
}

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { title: '', text: '' }
    const parsed = JSON.parse(raw)
    return {
      title: typeof parsed?.title === 'string' ? parsed.title : '',
      text: typeof parsed?.text === 'string' ? parsed.text : '',
    }
  } catch {
    return { title: '', text: '' }
  }
}

/**
 * Floating notepad (Apple-Notes style) for the admin area.
 * A small icon in the bottom-right opens a compact panel for short notes /
 * to-dos. Notes are autosaved to localStorage (per-browser, no server).
 */
export default function FloatingNotepad() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [size, setSize] = useState(loadSize)
  const rootRef = useRef(null)
  const saveTimer = useRef(null)
  const sizeRef = useRef(size)
  useEffect(() => {
    sizeRef.current = size
  }, [size])

  // Restore saved notes once on mount.
  useEffect(() => {
    const notes = loadNotes()
    setTitle(notes.title)
    setText(notes.text)
    setLoaded(true)
  }, [])

  // Debounced autosave on change (skipped until initial load is done so we
  // don't clobber saved notes with empty defaults). A fully empty note
  // removes the key so no ghost entry lingers.
  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        if (title === '' && text === '') {
          localStorage.removeItem(STORAGE_KEY)
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, text }))
        }
      } catch {
        /* localStorage unavailable (private mode) — notes just don't persist */
      }
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(saveTimer.current)
  }, [title, text, loaded])

  // Close on Escape or outside click while open.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [open])

  const startResize = (e) => {
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h }
    const max = maxResize()
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'nwse-resize'
    const onMove = (ev) => {
      // Handle is at the panel's top-left corner: dragging it out (left/up) grows the panel.
      setSize({
        w: Math.min(max.w, Math.max(MIN_SIZE.w, start.w + (start.x - ev.clientX))),
        h: Math.min(max.h, Math.max(MIN_SIZE.h, start.h + (start.y - ev.clientY))),
      })
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(sizeRef.current))
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  const handleClear = () => {
    if (window.confirm('Clear all notes? This cannot be undone.')) {
      setTitle('')
      setText('')
      // Autosave effect removes the now-empty key from localStorage
    }
  }

  return (
    <div ref={rootRef}>
      {/* Notepad panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Notes"
          className="fixed bottom-24 right-4 sm:right-6 z-50 flex flex-col overflow-hidden rounded-2xl border shadow-xl"
          style={{ width: size.w, height: size.h, background: 'var(--field-bg)', borderColor: 'var(--border)' }}
        >
          {/* Top-left resize grip */}
          <div
            role="separator"
            aria-orientation="both"
            aria-label="Resize notes panel"
            title="Drag to resize — double-click to reset"
            onPointerDown={startResize}
            onDoubleClick={() => {
              setSize(DEFAULT_SIZE)
              try {
                localStorage.setItem(SIZE_KEY, JSON.stringify(DEFAULT_SIZE))
              } catch {
                /* ignore */
              }
            }}
            className="absolute left-0 top-0 z-10 flex h-6 w-6 cursor-nwse-resize touch-none items-center justify-center"
            style={{ color: 'var(--muted)' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M2 12 L12 2" />
              <path d="M2 6.5 L6.5 2" />
              <path d="M7.5 14 L14 7.5" />
            </svg>
          </div>

          {/* Header */}
          <div
            className="flex shrink-0 items-center justify-between border-b py-2.5 pl-8 pr-4"
            style={{ borderColor: 'var(--border)', background: 'var(--panel-bg)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--heading)' }}>
              Notes
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close notes"
              className="rounded-md p-1 transition-colors hover:bg-[var(--hover-bg)]"
              style={{ color: 'var(--muted)' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="shrink-0 bg-transparent px-4 pt-3 text-sm outline-none placeholder:opacity-60"
            style={{ color: 'var(--text)' }}
          />

          {/* Body */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Write your short notes, to-dos, ideas…'}
            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-2 text-sm outline-none placeholder:opacity-60"
            style={{ color: 'var(--text)' }}
          />

          {/* Footer */}
          <div
            className="flex shrink-0 items-center justify-between border-t px-4 py-2"
            style={{ borderColor: 'var(--border)', background: 'var(--panel-bg)' }}
          >
            <button
              onClick={handleClear}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--hover-bg)]"
              style={{ color: 'var(--muted)' }}
            >
              <Trash2 size={13} />
              Clear
            </button>
            <span className="text-xs opacity-50" style={{ color: 'var(--muted)' }}>
              Saved locally
            </span>
          </div>
        </div>
      )}

      {/* Floating action button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close notes' : 'Open notes'}
        aria-expanded={open}
        className="fixed bottom-5 right-4 sm:right-6 z-50 rounded-full border p-3.5 shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        <StickyNote size={20} />
      </button>
    </div>
  )
}
