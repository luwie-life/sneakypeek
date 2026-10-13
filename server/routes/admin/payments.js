import { Router } from 'express'
import Payment from '../../models/Payment.js'
import { parsePagination, paginatedResponse } from '../../services/admin/pagination.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query)
    const { status, provider } = req.query

    const match = {}
    if (status) match.status = status
    if (provider) match.provider = provider

    const [payments, total] = await Promise.all([
      Payment.find(match)
        .populate('user', 'name email')
        .populate('plan', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(match),
    ])

    const items = payments.map((p) => ({
      id: p._id,
      user: p.user ? { id: p.user._id, name: p.user.name, email: p.user.email } : null,
      plan: p.plan ? { name: p.plan.name, slug: p.plan.slug } : null,
      amount: p.amount,
      currency: p.currency,
      provider: p.provider,
      providerTransactionId: p.providerTransactionId,
      txRef: p.txRef,
      status: p.status,
      subscription: p.subscription,
      createdAt: p.createdAt,
    }))

    res.json(paginatedResponse(items, total, { page, limit }))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load payments', detail: err.message })
  }
})

export default router
