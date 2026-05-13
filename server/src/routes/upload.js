const express = require('express')
const jwt = require('../utils/jwt')
const { upload, processImage } = require('../middleware/upload')

const router = express.Router()

// Image upload endpoint (admin only)
router.post('/image', jwt.authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' })
    }

    // Process and resize the image with sharp
    const { filename, size } = await processImage(req.file)

    // Return the public URL for the uploaded image
    const imageUrl = `/images/${filename}`
    
    res.json({ 
      url: imageUrl,
      filename,
      size
    })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ message: 'Failed to upload image' })
  }
})

module.exports = router
