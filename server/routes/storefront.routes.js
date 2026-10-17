import { Router } from 'express'
import User from '../models/User.js'
import Experience from '../models/Experience.js'
import ProductMaterial from '../models/ProductMaterial.js'
import { requireAuth } from '../middleware/auth.js'
import { requireSetting } from '../middleware/featureFlags.js'
import { rateLimit } from '../middleware/security.js'
import { validateStorefrontSlug, slugify } from '../utils/slug.js'
import { publicAssetUrl } from '../services/experience/publicView.js'
import { recordStorefrontView } from '../services/analytics/track.js'

/**
 * Creator storefronts: one branded page per creator at /s/:slug listing
 * their published experiences. Only fields the creator explicitly set in
 * their storefront settings are public — never their account name/email.
 */

const HEX = /^#[0-9a-f]{6}$/i

function sanitizeLinks(links) {
  if (!Array.isArray(links)) throw new Error('links must be a list')
  return links.slice(0, 5).map((l) => {
    const label = typeof l?.label === 'string' ? l.label.trim().slice(0, 40) : ''
    let url
    try {
      url = new URL(String(l?.url || '').trim())
    } catch {
      throw new Error('Each link needs a valid URL (including https://)')
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Links must start with http:// or https://')
    return { label: label || url.hostname, url: url.toString() }
  })
}

function ownView(user) {
  const sf = user.storefront || {}
  return {
    slug: sf.slug || '',
    displayName: sf.displayName || '',
    headline: sf.headline || '',
    bio: sf.bio || '',
    accentColor: sf.accentColor || '',
    links: sf.links || [],
    published: Boolean(sf.published),
    url: sf.slug ? `/s/${sf.slug}` : null,
  }
}

// ---------- Owner settings: mounted at /api/storefront ----------
export const storefrontSettingsRouter = Router()
storefrontSettingsRouter.use(requireAuth)

storefrontSettingsRouter.get('/', async (req, res) => {
  const user = await User.findById(req.userId).select('name storefront')
  if (!user) return res.status(404).json({ error: 'User not found' })
  const view = ownView(user)
  // Suggest a slug from the account name the first time (not saved until they publish).
  if (!view.slug) view.suggestedSlug = slugify(user.name || '').slice(0, 30) || ''
  res.json({ storefront: view })
})

storefrontSettingsRouter.put('/', async (req, res) => {
  const user = await User.findById(req.userId).select('storefront')
  if (!user) return res.status(404).json({ error: 'User not found' })
  const body = req.body || {}
  const sf = user.storefront?.toObject ? user.storefront.toObject() : { ...(user.storefront || {}) }

  try {
    if (body.slug !== undefined) sf.slug = validateStorefrontSlug(body.slug)
    for (const [key, max] of [['displayName', 80], ['headline', 140], ['bio', 1200]]) {
      if (body[key] === undefined) continue
      if (typeof body[key] !== 'string') throw new Error(`${key} must be text`)
      if (body[key].length > max) throw new Error(`${key} must be under ${max} characters`)
      sf[key] = body[key].trim()
    }
    if (body.accentColor !== undefined) {
      if (body.accentColor !== '' && !HEX.test(body.accentColor)) throw new Error('accentColor must be a hex colour like #1a1a1a')
      sf.accentColor = body.accentColor
    }
    if (body.links !== undefined) sf.links = sanitizeLinks(body.links)
    if (body.published !== undefined) {
      if (typeof body.published !== 'boolean') throw new Error('published must be true or false')
      sf.published = body.published
    }
    if (sf.published && !sf.slug) throw new Error('Choose a storefront address before publishing')
    if (sf.published && !sf.displayName) throw new Error('Add a display name before publishing')
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  user.storefront = sf
  try {
    await user.save()
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'That storefront address is already taken' })
    throw err
  }
  res.json({ storefront: ownView(user) })
})

// ---------- Public: mounted at /api/public/storefronts ----------
export const publicStorefrontRouter = Router()

publicStorefrontRouter.get(
  '/:slug',
  requireSetting('publicExperiencesEnabled', 'Public pages are temporarily unavailable'),
  async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase()
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) return res.status(404).json({ error: 'Storefront not found' })

    const owner = await User.findOne({ 'storefront.slug': slug, 'storefront.published': true, disabled: { $ne: true } }).select('storefront')
    if (!owner) return res.status(404).json({ error: 'Storefront not found' })

    const experiences = await Experience.find({ owner: owner._id, status: 'published', showOnStorefront: { $ne: false } })
      .sort({ publishedAt: -1 })
      .limit(60)
      .select('title slug productType hook description ctaText checkoutUrl coverAsset publishedAt authorName')
      .lean()

    // Covers resolve only to FREE image deliverables (same rule as the experience page).
    const coverIds = experiences.map((e) => e.coverAsset).filter(Boolean)
    const covers = coverIds.length
      ? await ProductMaterial.find({ _id: { $in: coverIds }, role: 'deliverable', access: 'free', mimeType: /^image\// }).select('_id experience').lean()
      : []
    const coverByExp = new Map(covers.map((c) => [String(c.experience), c._id]))

    const sf = owner.storefront
    res.setHeader('Cache-Control', 'public, max-age=30')
    res.json({
      storefront: {
        slug: sf.slug,
        displayName: sf.displayName,
        headline: sf.headline || '',
        bio: sf.bio || '',
        accentColor: sf.accentColor || '',
        links: sf.links || [],
      },
      products: experiences.map((e) => ({
        slug: e.slug,
        title: e.title,
        productType: e.productType,
        hook: e.hook || '',
        description: e.description || '',
        authorName: e.authorName || '',
        ctaText: e.ctaText || '',
        checkoutUrl: e.checkoutUrl || '',
        coverUrl: coverByExp.has(String(e._id)) ? publicAssetUrl(e.slug, coverByExp.get(String(e._id))) : null,
        publishedAt: e.publishedAt,
      })),
    })
  }
)

publicStorefrontRouter.post('/:slug/events', rateLimit({ windowMs: 60 * 1000, max: 60 }), async (req, res) => {
  res.status(202).json({ ok: true })
  try {
    const slug = String(req.params.slug || '').toLowerCase()
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) return
    const owner = await User.findOne({ 'storefront.slug': slug, 'storefront.published': true }).select('_id')
    if (!owner) return
    const { sessionId, visitorId, referrer } = req.body || {}
    await recordStorefrontView({ ownerUserId: owner._id, sessionId, visitorId, userAgent: req.headers['user-agent'], referrer })
  } catch (err) {
    console.error('Failed to record storefront event:', err.message)
  }
})
