const path = require('path')
const fs = require('fs')
const multer = require('multer')
const sharp = require('sharp')

// Configure storage for uploaded images (temporary, we process after upload)
const storage = multer.memoryStorage()

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = allowedTypes.test(file.mimetype)

  if (mimetype && extname) {
    return cb(null, true)
  }
  cb(new Error('Only image files are allowed'))
}

// Max allowed file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Check file size before filtering type
    if (file.size > MAX_FILE_SIZE) {
      return cb(new Error('File size must be less than 10MB'))
    }
    fileFilter(req, file, cb)
  },
  limits: { fileSize: MAX_FILE_SIZE } // 10MB limit
})

// Process and resize the uploaded image with sharp
async function processImage(file) {
  const inputBuffer = file.buffer
  const metadata = await sharp(inputBuffer).metadata()

  // Only resize if width exceeds max
  const maxWidth = 1600
  let outputBuffer
  
  if (metadata.width && metadata.width > maxWidth) {
    outputBuffer = await sharp(inputBuffer)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()
  } else {
    // Convert to web-friendly JPEG (keep PNG if it has transparency)
    if (metadata.channels && metadata.channels < 4) {
      outputBuffer = await sharp(inputBuffer).jpeg({ quality: 85 }).toBuffer()
    } else {
      // Keep as-is for images with alpha channel, or convert to webp
      outputBuffer = await sharp(inputBuffer).webp({ quality: 80 }).toBuffer()
    }
  }

  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)

  // Determine extension based on format
  const ext = metadata.channels && metadata.channels >= 4 ? 'webp' : 'jpg'
  const filename = `img-${uniqueSuffix}.${ext}`
  // __dirname is server/src/middleware, so ../../../content/images = <repo-root>/content/images
  // This matches the static file serving path in index.js: express.static('../../content/images')
  const outDir = path.join(__dirname, '../../../content/images')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outputPath = path.join(outDir, filename)

  await sharp(outputBuffer).toFile(outputPath)

  return { filename, size: outputBuffer.length }
}

module.exports = { upload, processImage }
