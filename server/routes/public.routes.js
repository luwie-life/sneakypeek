import { Router } from 'express'
import Experience from '../models/Experience.js'
import ProductMaterial from '../models/ProductMaterial.js'
import { recordEvent, recordDownload } from '../services/analytics/track.js'
import { requireSetting } from '../middleware/featureFlags.js'
import { rateLimit } from '../middleware/security.js'
import { toPublicExperience } from '../services/experience/publicView.js'
import { getStorageProvider } from '../services/materials/storage.js'
import { contentDisposition } from '../services/materials/fileTypes.js'

const router = Router()

const SLUG_RE = /^[a-z0-9-]{1,80}$/
const INLINE_SAFE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

async function findPublished(slug, select) {
  if (!SLUG_RE.test(slug)) return null
  const q = Experience.findOne({ slug, status: 'published' })
  if (select) q.select(select)
  return q
}

const publicGate = requireSetting('publicExperiencesEnabled', 'Public experiences are temporarily unavailable')

// Public, no auth: only published experiences, serialized through the
// public view (free content only — locked sections never leave the server).
router.get('/:slug', publicGate, async (req, res) => {
  const experience = await findPublished(req.params.slug)
  if (!experience) return res.status(404).json({ error: 'This experience is not available' })
  res.setHeader('Cache-Control', 'public, max-age=30')
  res.json({ experience: await toPublicExperience(experience) })
})

// Public free download / image. Only deliverables the creator marked
// 'free', on a published experience. Restricted and private files are 403/404
// here no matter what id is requested.
router.get('/:slug/assets/:assetId', publicGate, rateLimit({ windowMs: 60 * 1000, max: 120 }), async (req, res) => {
  const experience = await findPublished(req.params.slug, '_id')
  if (!experience || !/^[a-f0-9]{24}$/.test(req.params.assetId)) return res.status(404).json({ error: 'File not found' })

  const asset = await ProductMaterial.findOne({ _id: req.params.assetId, experience: experience._id, role: 'deliverable' })
  if (!asset) return res.status(404).json({ error: 'File not found' })
  if (asset.access === 'restricted') return res.status(403).json({ error: 'This file is included with purchase', restricted: true })
  if (asset.access !== 'free') return res.status(404).json({ error: 'File not found' })

  const buffer = await getStorageProvider().read(asset.source).catch(() => null)
  if (!buffer) return res.status(404).json({ error: 'File not found' })

  const inline = INLINE_SAFE.has(asset.mimeType) && req.query.download !== '1'
  res.setHeader('Content-Type', asset.mimeType || 'application/octet-stream')
  res.setHeader('Content-Disposition', contentDisposition(asset.fileName, { inline }))
  res.setHeader('Cache-Control', 'public, max-age=300')
  // Overrides the API-wide same-site policy so the SPA (possibly on another
  // origin in dev) can show cover/gallery images.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
  res.send(buffer)

  if (!inline) {
    ProductMaterial.updateOne({ _id: asset._id }, { $inc: { downloadCount: 1 } }).catch(() => {})
    recordDownload({ experienceId: experience._id, assetId: asset._id, sessionId: req.query.sid, userAgent: req.headers['user-agent'] }).catch(() => {})
  }
})

const eventLimiter = rateLimit({ windowMs: 60 * 1000, max: 240 })

// Public, no auth: fire-and-forget analytics from the visitor's browser.
// Always 202 — a tracking miss must never surface to a visitor.
router.post('/:slug/events', eventLimiter, async (req, res) => {
  res.status(202).json({ ok: true })
  try {
    const experience = await findPublished(req.params.slug, '_id')
    if (!experience) return
    const { eventType, sessionId, visitorId, sectionIndex, sectionType, referrer } = req.body || {}
    await recordEvent({
      experienceId: experience._id,
      eventType,
      sessionId,
      visitorId,
      sectionIndex,
      sectionType,
      referrer: typeof referrer === 'string' ? referrer : req.headers.referer,
      userAgent: req.headers['user-agent'],
    })
  } catch (err) {
    console.error('Failed to record analytics event:', err.message)
  }
})

export default router
