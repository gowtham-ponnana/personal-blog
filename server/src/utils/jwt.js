const jwt = require('jsonwebtoken')

// JWT secret — must be set via .env, no fallback to prevent accidental weak secrets
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET not set in .env. Server cannot start without it.')
  process.exit(1)
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

// Generate token for authenticated user
function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username,
      role: user.role || 'admin'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

// Verify token middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token
  
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired' })
    }
    return res.status(403).json({ message: 'Invalid token' })
  }
}

// Optional authentication - sets user if valid, but doesn't block without auth
function optionalAuth(req, res, next) {
  const token = req.cookies.token
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      req.user = decoded
    } catch (error) {
      // Token invalid or expired, continue without user
      req.user = null
    }
  }
  
  next()
}

module.exports = { generateToken, authenticateToken, optionalAuth }
