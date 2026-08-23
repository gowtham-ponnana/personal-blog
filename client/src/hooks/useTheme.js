import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'theme'

/**
 * Cycle order for the toggle button. Adding a theme here and in index.css is
 * all it takes; nothing else enumerates themes.
 *
 * Keep this in sync with the pre-paint script in index.html, which validates
 * the stored value against the same list before applying it.
 */
export const THEMES = ['default', 'cappuccino', 'dark']

export const THEME_LABELS = {
  default: 'light',
  cappuccino: 'cappuccino',
  dark: 'dark',
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'default'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && THEMES.includes(stored)) return stored
  } catch {
    /* localStorage unavailable (private mode, etc.) — fall through */
  }
  // No stored choice: follow the OS. Someone browsing at night on a dark
  // desktop should not be flashbanged before they find the toggle. An explicit
  // choice always wins, because it is what gets written to localStorage.
  try {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    /* matchMedia unavailable — fall through */
  }
  return 'default'
}

/**
 * Manages the active color theme. The theme is applied to <html> via a
 * data-theme attribute (styled in index.css) and persisted to localStorage.
 * An inline script in index.html applies the stored theme before paint to
 * avoid a flash of the wrong theme on load.
 */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)

    // Match the mobile browser chrome to the page. Reading the token rather
    // than a hard-coded map means this stays correct for any future theme.
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg')
        .trim()
      if (bg) meta.setAttribute('content', bg)
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* ignore write failures */
    }
  }, [theme])

  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      // indexOf returns -1 for an unknown value, so this lands on THEMES[0].
      const index = THEMES.indexOf(prev)
      return THEMES[(index + 1) % THEMES.length]
    })
  }, [])

  return { theme, nextTheme, toggleTheme }
}
