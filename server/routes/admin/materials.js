import { Router } from 'express'
import ProductMaterial from '../../models/ProductMaterial.js'
import { parsePagination, paginatedResponse } from '../../services/admin/pagination.js'

const router = Router()

// Never selects `content` or `extractedText` — creator material can be
// private intellectual property, and admin only needs operational
// visibility (what exists, its state), not the material itself.
const SAFE_FIELDS = 'type name status createdAt updatedAt processingError experience user metadata'

router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query)
    const { type, status, owner } = req.query

    const match = {}
    if (type) match.type = type
    if (status) match.status = status
    if (owner) match.user = owner

    const [materials, total] = await Promise.all([
      ProductMaterial.find(match)
        .select(SAFE_FIELDS)
        .populate('user', 'name email')
        .populate('experience', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ProductMaterial.countDocuments(match),
    ])

    const items = materials.map((m) => ({
      id: m._id,
      type: m.type,
      name: m.name,
      status: m.status,
      processingError: m.processingError,
      owner: m.user ? { id: m.user._id, name: m.user.name, email: m.user.email } : null,
      experience: m.experience ? { id: m.experience._id, title: m.experience.title } : null,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }))

    res.json(paginatedResponse(items, total, { page, limit }))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load materials', detail: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const material = await ProductMaterial.findById(req.params.id)
      .select(SAFE_FIELDS)
      .populate('user', 'name email')
      .populate('experience', 'title')

    if (!material) return res.status(404).json({ error: 'Material not found' })

    res.json({
      material: {
        id: material._id,
        type: material.type,
        name: material.name,
        status: material.status,
        processingError: material.processingError,
        owner: material.user ? { id: material.user._id, name: material.user.name, email: material.user.email } : null,
        experience: material.experience ? { id: material.experience._id, title: material.experience.title } : null,
        metadata: material.metadata,
        createdAt: material.createdAt,
        updatedAt: material.updatedAt,
        // Deliberately no `content` or `extractedText` field, even here —
        // see SAFE_FIELDS comment above.
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load material', detail: err.message })
  }
})

export default router
