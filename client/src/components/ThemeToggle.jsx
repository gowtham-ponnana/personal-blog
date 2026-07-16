import React from 'react'
import { Coffee, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isCappuccino = theme === 'cappuccino'
  const label = isCappuccino ? 'Switch to default theme' : 'Switch to cappuccino theme'

  return (
    <button
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
    >
      {isCappuccino ? <Sun size={18} /> : <Coffee size={18} />}
    </button>
  )
}
