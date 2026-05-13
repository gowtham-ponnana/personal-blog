import React, { useState, useEffect, createContext, useContext } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import api from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  useEffect(() => {
    // Check if user is authenticated on mount and route changes
    const checkAuth = async () => {
      try {
        const response = await api.get('/auth/me')
        setUser(response.data.user)
      } catch (error) {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [location.pathname])

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password })
      setUser(response.data.user)
      return true
    } catch (error) {
      console.error('Login failed:', error.response?.data || error.message)
      return false
    }
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
      setUser(null)
    } catch (error) {
      console.error('Logout failed:', error)
      // Still clear local state even if API call fails
      setUser(null)
    }
  }

  const isAuthenticated = !!user

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (!isAuthenticated) {
    // Don't reveal the login path — redirect to home instead
    return <Navigate to="/" replace />
  }

  return children
}

export default AuthContext
