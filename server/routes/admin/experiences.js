import { Router } from 'express'
import Experience from '../../models/Experience.js'
import ProductMaterial from '../../models/ProductMaterial.js'
import Event from '../../models/Event.js'
import { getAnalyticsReport } from '../../services/analytics/aggregate.js'
import { parsePagination, paginatedResponse } from '../../services/admin/pagination.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query)
    const { search, status, productType, owner } = req.query

    const match = {}
    if (search) {
      match.title = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }
    if (status) match.status = status
    if (productType) match.productType = productType
    if (owner) match.owner = owner

    const [experiences, total] = await Promise.all([
      Experience.find(match)
        .select('title productType status createdAt publishedAt owner')
        .populate('owner', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Experience.countDocuments(match),
    ])

    // Batch-fetch engagement counts for just this page's experiences in one
    // query — never one query per row.
    const ids = experiences.map((e) => e._id)
    const eventCounts = await Event.aggregate([
      { $match: { experience: { $in: ids }, eventType: { $in: ['experience_viewed', 'cta_clicked', 'checkout_clicked'] } } },
      { $group: { _id: { experience: '$experience', eventType: '$eventType', sessionId: '$sessionId' } } },
      { $group: { _id: { experience: '$_id.experience', eventType: '$_id.eventType' }, count: { $sum: 1 } } },
    ])

    const byExperience = {}
    for (const row of eventCounts) {
      const key = String(row._id.experience)
      byExperience[key] = byExperience[key] || {}
      byExperience[key][row._id.eventType] = row.count
    }

    const items = experiences.map((e) => {
      const counts = byExperience[String(e._id)] || {}
      return {
        id: e._id,
        title: e.title,
        productType: e.productType,
        status: e.status,
        owner: e.owner ? { id: e.owner._id, name: e.owner.name, email: e.owner.email } : null,
        createdAt: e.createdAt,
        publishedAt: e.publishedAt,
        views: counts.experience_viewed || 0,
        ctaClicks: counts.cta_clicked || 0,
        checkoutClicks: counts.checkout_clicked || 0,
      }
    })

    res.json(paginatedResponse(items, total, { page, limit }))
  } catch (err) {
    res.status(500).json({ error: 'Failed to load experiences', detail: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const experience = await Experience.findById(req.params.id).populate('owner', 'name email')
    if (!experience) return res.status(404).json({ error: 'Experience not found' })

    const [materialCount, report] = await Promise.all([
      ProductMaterial.countDocuments({ experience: experience._id }),
      getAnalyticsReport(experience, 'all'),
    ])
    // Same response shape the admin UI already consumes.
    const funnel = {
      hasData: report.hasData,
      steps: report.funnel.steps,
      summary: {
        visitors: report.summary.sessions,
        engagementRate: report.summary.engagementRate,
        completionRate: report.summary.completionRate,
        ctaClickRate: report.summary.ctaClickRate,
        checkoutClickRate: report.summary.checkoutClickRate,
      },
    }
    const sections = report.sections

    res.json({
      experience: {
        id: experience._id,
        title: experience.title,
        productType: experience.productType,
        status: experience.status,
        slug: experience.slug,
        // Only a safe public link, and only when actually published
        publicUrl: experience.status === 'published' ? `/p/${experience.slug}` : null,
        owner: experience.owner ? { id: experience.owner._id, name: experience.owner.name, email: experience.owner.email } : null,
        sections: experience.sections,
        createdAt: experience.createdAt,
        updatedAt: experience.updatedAt,
        publishedAt: experience.publishedAt,
        productUnderstandingGeneratedAt: experience.productUnderstanding?.generatedAt || null,
      },
      materialCount,
      analytics: { funnel, sections },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load experience', detail: err.message })
  }
})

export default router
