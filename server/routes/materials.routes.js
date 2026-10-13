import { Router } from 'express'
import multer from 'multer'
import Experience from '../models/Experience.js'
import ProductMaterial from '../models/ProductMaterial.js'
import { requireAuth } from '../middleware/auth.js'
import { requireLimit } from '../middleware/limits.js'
import { logAiUsage } from '../services/billing/entitlements.js'
import { validateMaterialInput, processMaterial, MAX_PDF_BYTES } from '../services/materials/process.js'
import { getStorageProvider } from '../services/materials/storage.js'
import { analyzeProduct } from '../services/ai/productUnderstanding.js'
import { requireSetting } from '../middleware/featureFlags.js'

const router = Router()
router.use(requireAuth)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF uploads are supported right now'))
    }
    cb(null, true)
  },
})

// multer reports both file-type and file-size-limit failures via an error
// passed to Express's error-handling chain, not via the route handler's own
// try/catch — this wrapper intercepts that and returns a clean 400 instead
// of falling through to the generic 500 handler in index.js.
function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    next()
  })
}

/** Loads an experience and 404s unless the current user owns it. Shared by every route below. */
export async function loadOwnedExperience(req, res) {
  const experience = await Experience.findOne({ _id: req.params.id, owner: req.userId })
  if (!experience) {
    res.status(404).json({ error: 'Experience not found' })
    return null
  }
  return experience
}

/** Loads a material and 404s unless it belongs to this experience AND this user. */
export async function loadOwnedMaterial(req, res) {
  const material = await ProductMaterial.findOne({
    _id: req.params.materialId,
    experience: req.params.id,
    user: req.userId,
  })
  if (!material) {
    res.status(404).json({ error: 'Material not found' })
    return null
  }
  return material
}

// List materials for an experience
router.get('/:id/materials', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return

  const materials = await ProductMaterial.find({ experience: experience._id }).sort({ createdAt: -1 })
  res.json({ materials })
})

// Create a text-based material (pasted text, existing description, or a URL to fetch)
router.post('/:id/materials', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return

  try {
    const { type, name, content, url } = req.body
    validateMaterialInput({ type, content, url })

    const material = await ProductMaterial.create({
      experience: experience._id,
      user: req.userId,
      type,
      name: name || '',
      content: content || '',
      source: type === 'url' ? url : '',
    })

    // Text-based extraction is fast and synchronous — no reason to make the
    // creator poll for it.
    await processMaterial(material)

    res.status(201).json({ material })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// Upload a PDF material
router.post('/:id/materials/upload', uploadSingle, async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return

  if (!req.file) {
    return res.status(400).json({ error: 'No file was uploaded' })
  }

  try {
    const storage = getStorageProvider()
    const key = await storage.save(req.file.buffer)

    const material = await ProductMaterial.create({
      experience: experience._id,
      user: req.userId,
      type: 'pdf',
      name: req.file.originalname?.slice(0, 200) || 'Uploaded PDF',
      source: key,
      metadata: { sizeBytes: req.file.size, mimeType: req.file.mimetype },
    })

    await processMaterial(material)

    res.status(201).json({ material })
  } catch (err) {
    res.status(500).json({ error: 'Failed to store upload', detail: err.message })
  }
})

router.get('/:id/materials/:materialId', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return
  const material = await loadOwnedMaterial(req, res)
  if (!material) return
  res.json({ material })
})

// Retry/reprocess a material (useful after a transient failure)
router.post('/:id/materials/:materialId/process', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return
  const material = await loadOwnedMaterial(req, res)
  if (!material) return

  await processMaterial(material)
  res.json({ material })
})

router.delete('/:id/materials/:materialId', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return
  const material = await loadOwnedMaterial(req, res)
  if (!material) return

  if (material.type === 'pdf' && material.source) {
    const storage = getStorageProvider()
    await storage.delete(material.source)
  }
  await material.deleteOne()

  res.json({ ok: true })
})

// AI product understanding — analyzes the experience's own fields plus every
// 'ready' material's extracted text. Costs one AI generation against the
// existing entitlement system, same as AI Studio's other AI calls.
router.post('/:id/analyze', requireSetting('productUnderstandingEnabled', 'Product analysis is temporarily disabled'), requireLimit('aiGenerationsPerMonth'), async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return

  try {
    const readyMaterials = await ProductMaterial.find({
      experience: experience._id,
      status: 'ready',
    }).select('extractedText')

    const materialsText = readyMaterials
      .map((m) => m.extractedText)
      .filter(Boolean)
      .join('\n\n---\n\n')
      .slice(0, 12000) // bound the combined prompt size regardless of how many materials exist

    const understanding = await analyzeProduct({ experience, materialsText })

    experience.productUnderstanding = { ...understanding, generatedAt: new Date() }
    await experience.save()
    await logAiUsage(req.userId)

    res.json({ productUnderstanding: experience.productUnderstanding })
  } catch (err) {
    res.status(502).json({ error: 'Product analysis failed', detail: err.message })
  }
})

router.get('/:id/product-understanding', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return
  res.json({ productUnderstanding: experience.productUnderstanding })
})

export default router
