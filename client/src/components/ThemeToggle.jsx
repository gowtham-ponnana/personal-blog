import React from 'react'
import { Coffee, Sun, Moon } from 'lucide-react'
import { useTheme, THEME_LABELS } from '../hooks/useTheme'

const ICONS = {
  default: Sun,
  cappuccino: Coffee,
  dark: Moon,
}

export default function ThemeToggle() {
  const { theme, nextTheme, toggleTheme } = useTheme()

  // With two themes the icon could show the destination and stay unambiguous.
  // With three it cannot, so the icon shows the theme you are *in* and the
  // label says where the next press goes.
  const Icon = ICONS[theme] || Sun
  const label = `Theme: ${THEME_LABELS[theme] || theme}. Switch to ${
    THEME_LABELS[nextTheme] || nextTheme
  }.`

  return (
    <button
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
    >
      <Icon size={18} />
    </button>
  )
}
