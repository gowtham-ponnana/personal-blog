const bcrypt = require('bcryptjs')

// Admin credentials (in production, these should be loaded from secure storage)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Gowtham_Ponnana'

// Generate hash for the password - run this once to get the hash
async function generatePasswordHash(password) {
  const saltRounds = 12
  return await bcrypt.hash(password, saltRounds)
}

// Verify password against stored hash
async function verifyPassword(plainTextPassword, hashedPassword) {
  return await bcrypt.compare(plainTextPassword, hashedPassword)
}

module.exports = { generatePasswordHash, verifyPassword, ADMIN_USERNAME }
