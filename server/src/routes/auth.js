const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('../utils/jwt')
const { verifyPassword, ADMIN_USERNAME } = require('../utils/password')
const rateLimit = require('express-rate-limit')

const router = express.Router()

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { message: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH
if (!ADMIN_PASSWORD_HASH) {
  console.error('FATAL: ADMIN_PASSWORD_HASH not set in .env. Server cannot start without it.')
  process.exit(1)
}

// Login endpoint
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' })
    }

    // Check if username matches admin
    if (username !== ADMIN_USERNAME) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, ADMIN_PASSWORD_HASH)

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // Generate JWT token
    const token = jwt.generateToken({ username, role: 'admin' })

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS in production
      sameSite: 'strict', // CSRF protection
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    res.json({
      message: 'Login successful',
      user: { username, role: 'admin' }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Logout endpoint
router.post('/logout', (req, res) => {
  // Clear the cookie
  res.clearCookie('token')
  res.json({ message: 'Logged out successfully' })
})

// Get current user info
router.get('/me', jwt.optionalAuth, (req, res) => {
  if (req.user) {
    res.json({ 
      user: { 
        username: req.user.username, 
        role: req.user.role 
      } 
    })
  } else {
    res.json({ user: null })
  }
})

module.exports = router
