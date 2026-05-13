import React from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { LogOut, Home as HomeIcon, PlusCircle } from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 py-6 px-4 md:px-8">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-gray-900 hover:text-gray-700 transition-colors">
            <span className="font-serif text-xl font-semibold">Gowtham&apos;s Blog</span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link to="/" className="text-sm flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors">
              <HomeIcon size={16} />
              Home
            </Link>

            {user && (
              <>
                <Link to="/admin" className="text-sm flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors">
                  Dashboard
                </Link>

                <Link to="/admin/new" className="text-sm flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors">
                  <PlusCircle size={16} />
                  New Post
                </Link>

                <button
                  onClick={handleLogout}
                  className="text-sm flex items-center gap-1 text-gray-600 hover:text-red-600 transition-colors"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-8 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 px-4 md:px-8 mt-12">
        <div className="max-w-3xl mx-auto text-center text-sm text-gray-500">
          <p>&copy; 2026 Gowtham Ponnana. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
