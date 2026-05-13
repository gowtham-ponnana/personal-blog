import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, ProtectedRoute } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Post from './pages/Post'
import Dashboard from './pages/Dashboard'
import PostEditor from './pages/PostEditor'
import AdminRedirect from './components/AdminRedirect'

const BUILD_MODE = import.meta.env.VITE_BUILD_MODE || 'admin'

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Hidden admin login at secret path — no references anywhere else */}
        <Route
          path="/gowtham-admin"
          element={BUILD_MODE === 'public' ? <AdminRedirect /> : <Login />}
        />

        {/* Public routes — anyone can view the blog */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="post/:slug" element={<Post />} />
        </Route>

        {/* Admin routes — require authentication. Only mounted in admin build. */}
        {BUILD_MODE === 'admin' && (
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <Layout />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="new" element={<PostEditor />} />
            <Route path="edit/:slug" element={<PostEditor />} />
          </Route>
        )}

        {/* Catch-all: anything not matching above → redirect to home, no hints */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
