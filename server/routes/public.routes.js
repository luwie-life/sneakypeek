import { Router } from 'express'
import Experience from '../models/Experience.js'
import { recordEvent } from '../services/analytics/track.js'
import { requireSetting } from '../middleware/featureFlags.js'

const router = Router()

// Public, no auth: only ever returns published experiences
router.get('/:slug', requireSetting('publicExperiencesEnabled', 'Public experiences are temporarily unavailable'), async (req, res) => {
  const experience = await Experience.findOne({
    slug: req.params.slug,
    status: 'published',
  }).select('title productType hook sections checkoutUrl slug publishedAt')

  if (!experience) {
    return res.status(404).json({ error: 'This experience is not available' })
  }

  res.json({ experience })
})

// Public, no auth: fire-and-forget analytics event from the customer-facing page.
// Always responds fast and never errors the caller — a tracking miss should
// never surface to a visitor.
router.post('/:slug/events', async (req, res) => {
  res.status(202).json({ ok: true }) // respond immediately; visitor never waits on this

  try {
    const experience = await Experience.findOne({
      slug: req.params.slug,
      status: 'published',
    }).select('_id')

    if (!experience) return

    const { eventType, sessionId, sectionIndex, sectionType, referrer } = req.body || {}

    await recordEvent({
      experienceId: experience._id,
      eventType,
      sessionId,
      sectionIndex,
      sectionType,
      referrer: referrer || req.headers.referer,
      userAgent: req.headers['user-agent'],
    })
  } catch (err) {
    console.error('Failed to record analytics event:', err.message)
  }
})

export default router
