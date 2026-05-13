import React, { useEffect } from 'react'

export default function AdminRedirect() {
  useEffect(() => {
    window.location.replace('http://localhost:5001/gowtham-admin')
  }, [])
  return (
    <div className="min-h-screen flex items-center justify-center text-center p-8">
      <div>
        <p className="text-gray-600 mb-2">Redirecting to local admin…</p>
        <p className="text-sm text-gray-400">
          If nothing happens, your local server is not running.
        </p>
      </div>
    </div>
  )
}
