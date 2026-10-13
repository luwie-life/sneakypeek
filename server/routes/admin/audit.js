import { Router } from 'express'
import AdminAuditLog from '../../models/AdminAuditLog.js'
import { parsePagination, paginatedResponse } from '../../services/admin/pagination.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query)
    const { action } = req.query
    const match = action ? { action } : {}

    const [entries, total] = await Promise.all([
      AdminAuditLog.find(match)
        .populate('admin', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AdminAuditLog.countDocuments(match),
    ])

    const items = entries.map((e) => ({
      id: e._id,
      admin: e.admin ? { id: e.admin._id, name: e.admin.name, email: e.admin.email } : null,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      metadata: e.metadata,
      createdAt: e.createdAt,
    }))

    res.json(paginatedResponse(items, total, { page, limit }))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit log', detail: err.message })
  }
})

export default router
