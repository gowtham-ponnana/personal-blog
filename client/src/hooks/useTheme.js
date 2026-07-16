import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'theme'
const THEMES = ['default', 'cappuccino']

function getInitialTheme() {
  if (typeof window === 'undefined') return 'default'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && THEMES.includes(stored)) return stored
  } catch {
    /* localStorage unavailable (private mode, etc.) — fall through */
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
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* ignore write failures */
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'cappuccino' ? 'default' : 'cappuccino'))
  }, [])

  return { theme, toggleTheme }
}
