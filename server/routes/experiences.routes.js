import { Router } from 'express'
import Experience, { PRODUCT_TYPES } from '../models/Experience.js'
import ProductMaterial from '../models/ProductMaterial.js'
import Event from '../models/Event.js'
import { requireAuth } from '../middleware/auth.js'
import { generateUniqueSlug } from '../utils/slug.js'
import { generateExperience, buildFallbackExperience } from '../services/ai/generateExperience.js'
import { runSectionAction, suggestNewSection } from '../services/ai/sectionActions.js'
import { getAnalyticsReport, getOwnerSummary, RANGE_DAYS } from '../services/analytics/aggregate.js'
import EventModel from '../models/Event.js'
import { requireLimit } from '../middleware/limits.js'
import { aiGate } from '../middleware/aiGate.js'
import { logAiUsage, getPlanForUser } from '../services/billing/entitlements.js'
import { requireSetting } from '../middleware/featureFlags.js'
import {
  normalizeSections,
  normalizePreviewSettings,
  validateCheckoutUrl,
  sectionHasContent,
  MAX_SECTIONS,
} from '../services/experience/sections.js'
import { getStorageProvider } from '../services/materials/storage.js'
import { loadSourceMaterialsText } from '../services/materials/process.js'

const router = Router()
router.use(requireAuth)

const TEXT_FIELDS = {
  title: 200,
  hook: 300,
  description: 2000,
  longDescription: 10000,
  authorName: 120,
  targetAudience: 500,
  promise: 1000,
  ctaText: 60,
}

class InputError extends Error {}

/** Copies only known, validated fields from a request body. */
function pickExperienceFields(body, { requireTitle = false } = {}) {
  const out = {}
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (body[key] === undefined) continue
    if (body[key] !== null && typeof body[key] !== 'string') throw new InputError(`${key} must be text`)
    const value = (body[key] || '').trim()
    if (value.length > max) throw new InputError(`${key} must be under ${max} characters`)
    out[key] = value
  }
  if (requireTitle && !out.title) throw new InputError('title is required')
  if (body.title !== undefined && !out.title) throw new InputError('title cannot be empty')

  if (body.productType !== undefined) {
    if (!PRODUCT_TYPES.includes(body.productType)) {
      throw new InputError(`productType must be one of: ${PRODUCT_TYPES.join(', ')}`)
    }
    out.productType = body.productType
  }
  for (const key of ['keyBenefits', 'topics']) {
    if (body[key] === undefined) continue
    if (!Array.isArray(body[key])) throw new InputError(`${key} must be a list`)
    out[key] = body[key].filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim().slice(0, 200)).slice(0, 20)
  }
  if (body.checkoutUrl !== undefined) {
    try {
      out.checkoutUrl = validateCheckoutUrl(body.checkoutUrl)
    } catch (err) {
      throw new InputError(err.message)
    }
  }
  if (body.showOnStorefront !== undefined) {
    if (typeof body.showOnStorefront !== 'boolean') throw new InputError('showOnStorefront must be true or false')
    out.showOnStorefront = body.showOnStorefront
  }
  return out
}

async function loadOwned(req, res, select) {
  const query = Experience.findOne({ _id: req.params.id, owner: req.userId })
  if (select) query.select(select)
  const experience = await query
  if (!experience) {
    res.status(404).json({ error: 'Experience not found' })
    return null
  }
  return experience
}

// List the current user's experiences (archived ones only on request)
router.get('/', async (req, res) => {
  const filter = { owner: req.userId }
  if (req.query.include !== 'archived') filter.status = { $ne: 'archived' }
  const experiences = await Experience.find(filter).sort({ updatedAt: -1 })
  res.json({ experiences })
})

// Per-experience totals for the analytics overview (owner's experiences only)
router.get('/analytics/summary', async (req, res) => {
  const range = Object.prototype.hasOwnProperty.call(RANGE_DAYS, req.query.range) ? req.query.range : '7d'
  const plan = await getPlanForUser(req.userId)
  const retention = plan.limits.analyticsRetentionDays
  const days = RANGE_DAYS[range]
  const effectiveRange = retention !== -1 && (days === null || days > retention) ? '7d' : range
  const experiences = await Experience.find({ owner: req.userId, status: { $ne: 'archived' } }).select('_id title slug status').lean()
  const totals = await getOwnerSummary(experiences.map((e) => e._id), effectiveRange)
  const storefrontViews = await EventModel.countDocuments({ user: req.userId, eventType: 'storefront_viewed' })
  res.json({
    range: effectiveRange,
    storefrontViews,
    experiences: experiences.map((e) => ({ ...e, ...(totals[String(e._id)] || { visitors: 0, ctaClicks: 0, checkoutClicks: 0 }) })),
  })
})

// Create a new draft experience
router.post('/', requireLimit('maxExperiences'), async (req, res) => {
  let fields
  try {
    fields = pickExperienceFields(req.body || {}, { requireTitle: true })
  } catch (err) {
    if (err instanceof InputError) return res.status(400).json({ error: err.message })
    throw err
  }
  const slug = await generateUniqueSlug(fields.title)
  const experience = await Experience.create({ productType: 'other', ...fields, owner: req.userId, slug })
  res.status(201).json({ experience })
})

// Fetch a single owned experience
router.get('/:id', async (req, res) => {
  const experience = await loadOwned(req, res)
  if (!experience) return
  res.json({ experience })
})

// Update an owned experience (fields, sections, preview settings, cover...)
router.put('/:id', async (req, res) => {
  const experience = await loadOwned(req, res)
  if (!experience) return
  const body = req.body || {}

  try {
    Object.assign(experience, pickExperienceFields(body))

    if (body.sections !== undefined) {
      experience.sections = normalizeSections(body.sections)
      if (!experience.generationSource) experience.generationSource = 'manual'
    }
    if (body.previewSettings !== undefined || body.sections !== undefined) {
      experience.previewSettings = normalizePreviewSettings(
        body.previewSettings !== undefined ? body.previewSettings : experience.previewSettings,
        experience.sections.length
      )
    }
    if (body.coverAsset !== undefined) {
      if (body.coverAsset === null || body.coverAsset === '') {
        experience.coverAsset = null
      } else {
        // Cover must be this experience's own FREE image deliverable — it is shown publicly.
        const asset = await ProductMaterial.findOne({
          _id: typeof body.coverAsset === 'string' && /^[a-f0-9]{24}$/.test(body.coverAsset) ? body.coverAsset : null,
          experience: experience._id,
          user: req.userId,
          role: 'deliverable',
        })
        if (!asset || !asset.mimeType?.startsWith('image/')) throw new InputError('Cover must be an image uploaded to this experience')
        if (asset.access !== 'free') throw new InputError('Set the cover image to "Free" so visitors can see it')
        experience.coverAsset = asset._id
      }
    }
  } catch (err) {
    if (err instanceof InputError || /must|cannot|at most/.test(err.message)) {
      return res.status(400).json({ error: err.message })
    }
    throw err
  }

  await experience.save()
  res.json({ experience })
})

// Publish / unpublish / archive
router.post('/:id/publish', async (req, res) => {
  const experience = await loadOwned(req, res)
  if (!experience) return

  if (!experience.checkoutUrl) {
    return res.status(400).json({ error: 'Add a checkout URL before publishing' })
  }
  try {
    validateCheckoutUrl(experience.checkoutUrl)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
  if (!experience.sections.some((s) => s.type !== 'cta' && sectionHasContent(s))) {
    return res.status(400).json({ error: 'Add at least one preview section before publishing' })
  }

  experience.status = 'published'
  experience.publishedAt = experience.publishedAt || new Date()
  await experience.save()
  res.json({ experience })
})

router.post('/:id/unpublish', async (req, res) => {
  const experience = await loadOwned(req, res)
  if (!experience) return
  experience.status = 'draft'
  await experience.save()
  res.json({ experience })
})

// Archive: removes it from the public web and storefront and frees up the
// active-experience allowance, without deleting anything.
router.post('/:id/archive', async (req, res) => {
  const experience = await loadOwned(req, res)
  if (!experience) return
  experience.status = 'archived'
  await experience.save()
  res.json({ experience })
})

router.post('/:id/restore', requireLimit('maxExperiences'), async (req, res) => {
  const experience = await loadOwned(req, res)
  if (!experience) return
  if (experience.status !== 'archived') return res.status(400).json({ error: 'Only archived experiences can be restored' })
  experience.status = 'draft'
  await experience.save()
  res.json({ experience })
})

function productInfo(experience) {
  return {
    title: experience.title,
    productType: experience.productType,
    description: experience.description,
    longDescription: experience.longDescription,
    authorName: experience.authorName,
    targetAudience: experience.targetAudience,
    promise: experience.promise,
    keyBenefits: experience.keyBenefits,
    topics: experience.topics,
    ctaText: experience.ctaText,
    hook: experience.hook,
    understanding: experience.productUnderstanding?.generatedAt ? experience.productUnderstanding : null,
  }
}

function applyDraft(experience, { hook, sections }, source) {
  experience.hook = hook || experience.hook
  experience.sections = sections
  experience.generationSource = source
  experience.previewSettings = normalizePreviewSettings(experience.previewSettings, sections.length)
}

// Full generation: AI designs hook + typed sections from the product info
// and the creator's own material. Never billed on failure. If the AI is
// unavailable and the experience is still empty, a non-AI starter draft is
// returned so the creator isn't stuck.
router.post(
  '/:id/generate',
  requireSetting('aiGenerationEnabled', 'AI generation is temporarily disabled'),
  aiGate('generate'),
  async (req, res) => {
    const experience = await loadOwned(req, res)
    if (!experience) return
    const materialsText = await loadSourceMaterialsText(experience._id)

    let draft
    try {
      draft = await generateExperience(productInfo(experience), { materialsText })
    } catch (err) {
      console.error('[ai] generation failed:', err.message)
      if (experience.sections.length === 0) {
        const fallback = buildFallbackExperience(productInfo(experience), { materialsText })
        applyDraft(experience, fallback, 'fallback')
        await experience.save()
        return res.json({ experience, fallback: true, notes: fallback.notes })
      }
      return res.status(502).json({ error: 'AI generation failed — your existing sections were kept. Please try again.', detail: err.message })
    }

    applyDraft(experience, draft, 'ai')
    await experience.save()
    await logAiUsage(req.userId, { kind: 'generate', experienceId: experience._id, trial: req.aiGrant.trial })
    res.json({ experience, notes: draft.notes })
  }
)

// Non-AI starter draft from the creator's own details. Free for everyone,
// never touches the AI allowance — useful when AI is off or used up.
router.post('/:id/starter-draft', async (req, res) => {
  const experience = await loadOwned(req, res)
  if (!experience) return
  if (experience.sections.length > 0 && req.body?.replace !== true) {
    return res.status(409).json({ error: 'This experience already has sections. Confirm to replace them.', confirmReplace: true })
  }
  const materialsText = await loadSourceMaterialsText(experience._id)
  const draft = buildFallbackExperience(productInfo(experience), { materialsText })
  applyDraft(experience, { ...draft, notes: undefined }, 'fallback')
  await experience.save()
  res.json({ experience, notes: ['Starter draft built from your details. Edit any section or generate with AI for a richer version.'] })
})

function parseIndex(req, experience) {
  const index = Number(req.params.index)
  if (!Number.isInteger(index) || index < 0 || index >= experience.sections.length) return null
  return index
}

// One AI action on a single section: rewrite / shorten / compelling / tone / improve_cta
router.post(
  '/:id/sections/:index/action',
  requireSetting('aiGenerationEnabled', 'AI generation is temporarily disabled'),
  aiGate('section_action'),
  async (req, res) => {
    const experience = await loadOwned(req, res)
    if (!experience) return
    const index = parseIndex(req, experience)
    if (index === null) return res.status(404).json({ error: 'Section not found' })

    const { action, tone } = req.body || {}
    if (typeof action !== 'string' || !action) return res.status(400).json({ error: 'action is required' })

    let updated
    try {
      updated = await runSectionAction({ action, tone, section: experience.sections[index] })
    } catch (err) {
      const isInput = /Unknown section action|tone|Excerpts|no text/.test(err.message)
      return res.status(isInput ? 400 : 502).json({ error: isInput ? err.message : 'AI action failed', detail: err.message })
    }
    experience.sections[index].heading = updated.heading
    experience.sections[index].body = updated.body
    experience.markModified('sections')
    await experience.save()
    await logAiUsage(req.userId, { kind: 'section_action', experienceId: experience._id })
    res.json({ experience })
  }
)

// AI-suggested new section, appended before the closing CTA
router.post(
  '/:id/sections/suggest',
  requireSetting('aiGenerationEnabled', 'AI generation is temporarily disabled'),
  aiGate('section_action'),
  async (req, res) => {
    const experience = await loadOwned(req, res)
    if (!experience) return
    if (experience.sections.length >= MAX_SECTIONS) {
      return res.status(400).json({ error: `An experience can have at most ${MAX_SECTIONS} sections` })
    }

    let section
    try {
      section = await suggestNewSection({
        productType: experience.productType,
        existingSections: experience.sections,
        productInfo: { title: experience.title, description: experience.description },
      })
    } catch (err) {
      return res.status(502).json({ error: 'AI suggestion failed', detail: err.message })
    }
    const ctaIndex = experience.sections.findIndex((s) => s.type === 'cta')
    if (ctaIndex >= 0) experience.sections.splice(ctaIndex, 0, section)
    else experience.sections.push(section)
    experience.previewSettings = normalizePreviewSettings(experience.previewSettings, experience.sections.length)
    await experience.save()
    await logAiUsage(req.userId, { kind: 'section_action', experienceId: experience._id })
    res.json({ experience })
  }
)

// Engagement analytics for one owned experience
router.get('/:id/analytics', async (req, res) => {
  const experience = await loadOwned(req, res)
  if (!experience) return

  const range = req.query.range || '7d'
  if (!Object.prototype.hasOwnProperty.call(RANGE_DAYS, range)) {
    return res.status(400).json({ error: `range must be one of: ${Object.keys(RANGE_DAYS).join(', ')}` })
  }

  const plan = await getPlanForUser(req.userId)
  const retentionDays = plan.limits.analyticsRetentionDays
  const requestedDays = RANGE_DAYS[range]
  const allowedRanges = Object.entries(RANGE_DAYS)
    .filter(([, days]) => retentionDays === -1 || (days !== null && days <= retentionDays))
    .map(([key]) => key)

  if (retentionDays !== -1 && (requestedDays === null || requestedDays > retentionDays)) {
    return res.status(402).json({
      error: `Your plan includes ${retentionDays} days of analytics history`,
      limitReached: true,
      limitKey: 'analyticsRetentionDays',
      current: requestedDays,
      limit: retentionDays,
      plan: plan.slug,
      allowedRanges,
      upgradeRequired: true,
    })
  }

  const report = await getAnalyticsReport(experience, range)
  res.json({ ...report, range, allowedRanges })
})

// Permanently delete: also removes its files, materials and analytics so
// nothing orphaned (or publicly reachable) is left behind.
router.delete('/:id', async (req, res) => {
  const experience = await Experience.findOneAndDelete({ _id: req.params.id, owner: req.userId })
  if (!experience) return res.status(404).json({ error: 'Experience not found' })

  const materials = await ProductMaterial.find({ experience: experience._id }).select('source type role')
  const storage = getStorageProvider()
  for (const m of materials) {
    if (m.source && (m.type === 'pdf' || m.type === 'file')) await storage.delete(m.source).catch(() => {})
  }
  await Promise.all([
    ProductMaterial.deleteMany({ experience: experience._id }),
    Event.deleteMany({ experience: experience._id }),
  ])
  res.json({ ok: true })
})

export default router
