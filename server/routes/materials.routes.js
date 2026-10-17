import { Router } from 'express'
import multer from 'multer'
import Experience from '../models/Experience.js'
import ProductMaterial from '../models/ProductMaterial.js'
import { requireAuth } from '../middleware/auth.js'
import { aiGate } from '../middleware/aiGate.js'
import { logAiUsage, checkLimit } from '../services/billing/entitlements.js'
import { validateMaterialInput, processMaterial, MAX_PDF_BYTES, loadSourceMaterialsText } from '../services/materials/process.js'
import { getStorageProvider } from '../services/materials/storage.js'
import { detectFileType, safeDisplayFileName, ACCEPTED_DELIVERABLE_LABEL, contentDisposition } from '../services/materials/fileTypes.js'
import { analyzeProduct } from '../services/ai/productUnderstanding.js'
import { requireSetting } from '../middleware/featureFlags.js'

const router = Router()
router.use(requireAuth)

export const MAX_DELIVERABLE_BYTES = Number(process.env.MAX_DELIVERABLE_MB || 25) * 1024 * 1024
const MAX_DELIVERABLES_PER_EXPERIENCE = 30

function uploader(maxBytes) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 10 } })
  // multer reports size/count failures via an error passed to next();
  // translate those into clean 400/413 responses.
  return (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next()
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File is too large (max ${Math.round(maxBytes / 1024 / 1024)}MB)` })
      }
      return res.status(400).json({ error: err.message })
    })
  }
}

const uploadSource = uploader(MAX_PDF_BYTES)
const uploadDeliverable = uploader(MAX_DELIVERABLE_BYTES)

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
export async function loadOwnedMaterial(req, res, { role } = {}) {
  const filter = { _id: req.params.materialId, experience: req.params.id, user: req.userId }
  if (role === 'deliverable') filter.role = 'deliverable'
  if (role === 'source') filter.role = { $ne: 'deliverable' }
  const material = await ProductMaterial.findOne(filter)
  if (!material) {
    res.status(404).json({ error: role === 'deliverable' ? 'File not found' : 'Material not found' })
    return null
  }
  return material
}

async function enforceStorage(req, res, addBytes) {
  const result = await checkLimit(req.userId, 'storageMB', { addBytes })
  if (result.allowed) return true
  res.status(402).json({
    error: `This upload would exceed your plan's ${result.limit}MB of storage`,
    limitReached: true,
    limitKey: 'storageMB',
    current: result.current,
    limit: result.limit,
    plan: result.plan,
    upgradeRequired: true,
  })
  return false
}

/**
 * Removes every reference to a deliverable from its experience (cover,
 * gallery, free-download sections) so deleting it can't leave broken
 * public references. Sections that only existed to show it are removed.
 */
async function removeDeliverableReferences(experienceId, materialId) {
  const experience = await Experience.findById(experienceId)
  if (!experience) return
  const id = String(materialId)
  let changed = false
  if (String(experience.coverAsset) === id) {
    experience.coverAsset = null
    changed = true
  }
  const kept = []
  for (const section of experience.sections) {
    if (section.type === 'free_download' && section.data?.assetId === id) {
      changed = true
      continue
    }
    if (section.type === 'gallery' && section.data?.assetIds?.includes(id)) {
      section.data = { ...section.data, assetIds: section.data.assetIds.filter((a) => a !== id) }
      changed = true
      if (!section.data.assetIds.length) continue
    }
    kept.push(section)
  }
  if (changed) {
    experience.sections = kept
    experience.markModified('sections')
    await experience.save()
  }
}

// ---------------- Source materials (private AI input) ----------------

router.get('/:id/materials', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return
  const materials = await ProductMaterial.find({ experience: experience._id, role: { $ne: 'deliverable' } }).sort({ createdAt: -1 })
  res.json({ materials })
})

// Create a text-based material (pasted text, existing description, or a URL to fetch)
router.post('/:id/materials', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return

  const { type, name, content, url } = req.body || {}
  try {
    validateMaterialInput({ type, content, url })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
  const count = await ProductMaterial.countDocuments({ experience: experience._id, role: { $ne: 'deliverable' } })
  if (count >= 50) return res.status(400).json({ error: 'An experience can have at most 50 source materials' })

  const material = await ProductMaterial.create({
    experience: experience._id,
    user: req.userId,
    role: 'source',
    type,
    name: typeof name === 'string' ? name.slice(0, 200) : '',
    content: typeof content === 'string' ? content : '',
    source: type === 'url' ? url : '',
  })

  // Text-based extraction is fast — no reason to make the creator poll for it.
  await processMaterial(material)
  res.status(201).json({ material })
})

// Upload a PDF source material
router.post('/:id/materials/upload', uploadSource, async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded' })

  const detected = detectFileType(req.file.buffer, req.file.originalname)
  if (detected?.ext !== 'pdf') {
    return res.status(400).json({ error: 'Only PDF files can be used as source material right now' })
  }
  if (!(await enforceStorage(req, res, req.file.size))) return

  const storage = getStorageProvider()
  const key = await storage.save(req.file.buffer)

  const material = await ProductMaterial.create({
    experience: experience._id,
    user: req.userId,
    role: 'source',
    type: 'pdf',
    name: req.file.originalname?.slice(0, 200) || 'Uploaded PDF',
    source: key,
    mimeType: 'application/pdf',
    sizeBytes: req.file.size,
    metadata: { sizeBytes: req.file.size, mimeType: 'application/pdf' },
  })

  await processMaterial(material)
  res.status(201).json({ material })
})

router.get('/:id/materials/:materialId', async (req, res) => {
  const material = await loadOwnedMaterial(req, res)
  if (!material) return
  res.json({ material })
})

// Retry/reprocess a source material (useful after a transient failure)
router.post('/:id/materials/:materialId/process', async (req, res) => {
  const material = await loadOwnedMaterial(req, res, { role: 'source' })
  if (!material) return
  await processMaterial(material)
  res.json({ material })
})

router.delete('/:id/materials/:materialId', async (req, res) => {
  const material = await loadOwnedMaterial(req, res)
  if (!material) return

  if (material.source && (material.type === 'pdf' || material.type === 'file')) {
    await getStorageProvider().delete(material.source)
  }
  await material.deleteOne()
  if (material.role === 'deliverable') await removeDeliverableReferences(material.experience, material._id)
  res.json({ ok: true })
})

// AI product understanding — analyzes the experience's own fields plus every
// ready source material's extracted text. Costs one AI generation (or the
// Free plan's one-time trial analysis).
router.post(
  '/:id/analyze',
  requireSetting('productUnderstandingEnabled', 'Product analysis is temporarily disabled'),
  aiGate('analyze'),
  async (req, res) => {
    const experience = await loadOwnedExperience(req, res)
    if (!experience) return

    const materialsText = await loadSourceMaterialsText(experience._id)
    let understanding
    try {
      understanding = await analyzeProduct({ experience, materialsText })
    } catch (err) {
      return res.status(502).json({ error: 'Product analysis failed — please try again.', detail: err.message })
    }

    experience.productUnderstanding = { ...understanding, generatedAt: new Date() }
    await experience.save()
    await logAiUsage(req.userId, { kind: 'analyze', experienceId: experience._id, trial: req.aiGrant.trial })

    res.json({ productUnderstanding: experience.productUnderstanding })
  }
)

router.get('/:id/product-understanding', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return
  res.json({ productUnderstanding: experience.productUnderstanding })
})

// ---------------- Deliverables (downloadable resources) ----------------

function serializeDeliverable(m) {
  return {
    _id: m._id,
    title: m.name,
    description: m.description,
    fileName: m.fileName,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    access: m.access,
    order: m.order,
    downloadCount: m.downloadCount,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}

const ACCESS_VALUES = ['free', 'restricted', 'private']

function parseDeliverableFields(body) {
  const out = {}
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.length > 150) throw new Error('title must be under 150 characters')
    out.name = body.title.trim()
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 500) throw new Error('description must be under 500 characters')
    out.description = body.description.trim()
  }
  if (body.access !== undefined) {
    if (!ACCESS_VALUES.includes(body.access)) throw new Error(`access must be one of: ${ACCESS_VALUES.join(', ')}`)
    out.access = body.access
  }
  if (body.order !== undefined) {
    const order = Number(body.order)
    if (!Number.isInteger(order) || order < 0 || order > 1000) throw new Error('order must be a whole number')
    out.order = order
  }
  return out
}

router.get('/:id/deliverables', async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return
  const items = await ProductMaterial.find({ experience: experience._id, role: 'deliverable' }).sort({ order: 1, createdAt: 1 })
  res.json({ deliverables: items.map(serializeDeliverable), accepted: ACCEPTED_DELIVERABLE_LABEL, maxBytes: MAX_DELIVERABLE_BYTES })
})

router.post('/:id/deliverables', uploadDeliverable, async (req, res) => {
  const experience = await loadOwnedExperience(req, res)
  if (!experience) return
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded' })

  let fields
  try {
    fields = parseDeliverableFields(req.body || {})
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const detected = detectFileType(req.file.buffer, req.file.originalname)
  if (!detected) {
    return res.status(400).json({ error: `That file type isn't supported. Upload ${ACCEPTED_DELIVERABLE_LABEL}.` })
  }
  const count = await ProductMaterial.countDocuments({ experience: experience._id, role: 'deliverable' })
  if (count >= MAX_DELIVERABLES_PER_EXPERIENCE) {
    return res.status(400).json({ error: `An experience can have at most ${MAX_DELIVERABLES_PER_EXPERIENCE} files` })
  }
  if (!(await enforceStorage(req, res, req.file.size))) return

  const key = await getStorageProvider().save(req.file.buffer)
  const fileName = safeDisplayFileName(req.file.originalname, detected.ext)
  const material = await ProductMaterial.create({
    experience: experience._id,
    user: req.userId,
    role: 'deliverable',
    type: 'file',
    status: 'ready',
    source: key,
    name: fields.name || fileName.replace(/\.[a-z0-9]+$/i, ''),
    description: fields.description || '',
    access: fields.access || 'private',
    order: fields.order ?? count,
    fileName,
    mimeType: detected.mime,
    sizeBytes: req.file.size,
  })
  res.status(201).json({ deliverable: serializeDeliverable(material) })
})

router.patch('/:id/deliverables/:materialId', async (req, res) => {
  const material = await loadOwnedMaterial(req, res, { role: 'deliverable' })
  if (!material) return
  let fields
  try {
    fields = parseDeliverableFields(req.body || {})
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
  if (fields.name === '') return res.status(400).json({ error: 'title cannot be empty' })
  Object.assign(material, fields)
  await material.save()
  // Making a file non-free removes it from public cover/gallery/download sections.
  if (fields.access && fields.access !== 'free') await removeDeliverableReferences(material.experience, material._id)
  res.json({ deliverable: serializeDeliverable(material) })
})

// Replace the file but keep the same id, so sections that reference it keep working.
router.put('/:id/deliverables/:materialId/file', uploadDeliverable, async (req, res) => {
  const material = await loadOwnedMaterial(req, res, { role: 'deliverable' })
  if (!material) return
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded' })
  const detected = detectFileType(req.file.buffer, req.file.originalname)
  if (!detected) return res.status(400).json({ error: `That file type isn't supported. Upload ${ACCEPTED_DELIVERABLE_LABEL}.` })
  if (!(await enforceStorage(req, res, Math.max(0, req.file.size - (material.sizeBytes || 0))))) return

  const storage = getStorageProvider()
  const oldKey = material.source
  material.source = await storage.save(req.file.buffer)
  material.fileName = safeDisplayFileName(req.file.originalname, detected.ext)
  material.mimeType = detected.mime
  material.sizeBytes = req.file.size
  await material.save()
  if (oldKey) await storage.delete(oldKey).catch(() => {})
  // An image replaced by a non-image can no longer be a cover/gallery item.
  if (!detected.mime.startsWith('image/')) await removeDeliverableReferences(material.experience, material._id)
  res.json({ deliverable: serializeDeliverable(material) })
})

router.delete('/:id/deliverables/:materialId', async (req, res) => {
  const material = await loadOwnedMaterial(req, res, { role: 'deliverable' })
  if (!material) return
  if (material.source) await getStorageProvider().delete(material.source).catch(() => {})
  await material.deleteOne()
  await removeDeliverableReferences(material.experience, material._id)
  res.json({ ok: true })
})

// Owner download/preview of any of their own files (any access level).
router.get('/:id/deliverables/:materialId/download', async (req, res) => {
  const material = await loadOwnedMaterial(req, res, { role: 'deliverable' })
  if (!material) return
  const buffer = await getStorageProvider().read(material.source).catch(() => null)
  if (!buffer) return res.status(404).json({ error: 'File is missing from storage' })
  res.setHeader('Content-Type', material.mimeType || 'application/octet-stream')
  res.setHeader('Content-Disposition', contentDisposition(material.fileName))
  res.setHeader('Cache-Control', 'private, no-store')
  res.send(buffer)
})

export default router
