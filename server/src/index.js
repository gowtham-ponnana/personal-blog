const express = require('express')
const multer = require('multer')
const cors = require('cors')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const path = require('path')
const fs = require('fs')

// Load environment variables
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
} catch (e) {
  // Continue without .env file
}

// Import routes
const authRoutes = require('./routes/auth')
const postRoutes = require('./routes/posts')
const uploadRoutes = require('./routes/upload')

const app = express()
const PORT = process.env.PORT || 5000

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", 'data:', 'blob:'],
    },
  },
}))

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL]
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// Static files for images (sourced from repo-root content/images)
app.use('/images', express.static(path.join(__dirname, '../../content/images')))

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/posts', postRoutes)
app.use('/api/upload', uploadRoutes)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve the built React app (admin mode) if present, with SPA fallback.
// Regex excludes /api/* so API misses still 404 cleanly via the handler below.
const clientDist = path.join(__dirname, '../../client/dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// 404 handler for non-existent routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  
  // Handle multer errors
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message })
  }
  
  // Handle other validation errors
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({ message: err.message })
  }
  
  // Generic error response
  res.status(err.status || 500).json({ 
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  })
})

// Start server — bind to loopback only so the admin server is not reachable
// from other hosts on the LAN (§9 gotcha).
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📝 API available at http://localhost:${PORT}/api`)
})

module.exports = app
