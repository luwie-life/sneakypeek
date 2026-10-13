import { Router } from 'express'
import AiUsageLog from '../../models/AiUsageLog.js'
import { resolveRange } from '../../services/analytics/aggregate.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const range = req.query.range || '30d'
    const from = resolveRange(range)
    const match = from ? { createdAt: { $gte: from } } : {}

    const [total, byPlan, byDay, topUsers] = await Promise.all([
      AiUsageLog.countDocuments(match),

      AiUsageLog.aggregate([
        { $match: match },
        { $lookup: { from: 'subscriptions', localField: 'user', foreignField: 'user', as: 'sub' } },
        { $unwind: { path: '$sub', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'plans', localField: 'sub.plan', foreignField: '_id', as: 'planDoc' } },
        { $unwind: { path: '$planDoc', preserveNullAndEmptyArrays: true } },
        { $group: { _id: { $ifNull: ['$planDoc.slug', 'free'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      AiUsageLog.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      AiUsageLog.aggregate([
        { $match: match },
        { $group: { _id: '$user', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userDoc' } },
        { $unwind: '$userDoc' },
        { $project: { name: '$userDoc.name', email: '$userDoc.email', count: 1 } },
      ]),
    ])

    res.json({
      range,
      total,
      byPlan: byPlan.map((r) => ({ plan: r._id, count: r.count })),
      byDay: byDay.map((r) => ({ date: r._id, count: r.count })),
      topUsers: topUsers.map((r) => ({ userId: r._id, name: r.name, email: r.email, count: r.count })),
      // Honest limitation, not a guess: AiUsageLog only records that a
      // generation happened, not which operation triggered it (full
      // generate, a section rewrite, product understanding, etc.) —
      // breaking that down would require extending the schema and every
      // call site, which this slice doesn't do.
      breakdownByOperation: 'not available — AiUsageLog does not currently record an operation type',
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load AI usage', detail: err.message })
  }
})

export default router
