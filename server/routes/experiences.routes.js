import { Router } from 'express'
import Experience, { PRODUCT_TYPES } from '../models/Experience.js'
import { requireAuth } from '../middleware/auth.js'
import { generateUniqueSlug } from '../utils/slug.js'
import { generateExperience } from '../services/ai/generateExperience.js'
import { runSectionAction, suggestNewSection } from '../services/ai/sectionActions.js'
import { getFunnel, getSectionPerformance, RANGE_DAYS } from '../services/analytics/aggregate.js'
import { requireLimit } from '../middleware/limits.js'
import { logAiUsage, getPlanForUser } from '../services/billing/entitlements.js'
import { requireSetting } from '../middleware/featureFlags.js'

const router = Router()
router.use(requireAuth)

// List the current user's experiences
router.get('/', async (req, res) => {
  const experiences = await Experience.find({ owner: req.userId }).sort({ updatedAt: -1 })
  res.json({ experiences })
})

// Create a new draft experience
router.post('/', requireLimit('maxExperiences'), async (req, res) => {
  try {
    const { title, productType, hook, checkoutUrl, description, targetAudience, promise, longDescription, authorName, keyBenefits, topics, ctaText } = req.body

    if (!title) {
      return res.status(400).json({ error: 'title is required' })
    }
    if (productType && !PRODUCT_TYPES.includes(productType)) {
      return res.status(400).json({ error: `productType must be one of: ${PRODUCT_TYPES.join(', ')}` })
    }

    const slug = await generateUniqueSlug(title)

    const experience = await Experience.create({
      owner: req.userId,
      title,
      productType: productType || 'other',
      hook: hook || '',
      checkoutUrl: checkoutUrl || '',
      description: description || '',
      targetAudience: targetAudience || '',
      promise: promise || '',
      longDescription: longDescription || '',
      authorName: authorName || '',
      keyBenefits: Array.isArray(keyBenefits) ? keyBenefits : [],
      topics: Array.isArray(topics) ? topics : [],
      ctaText: ctaText || '',
      slug,
    })

    res.status(201).json({ experience })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create experience', detail: err.message })
  }
})

// Fetch a single owned experience
router.get('/:id', async (req, res) => {
  const experience = await Experience.findOne({ _id: req.params.id, owner: req.userId })
  if (!experience) return res.status(404).json({ error: 'Experience not found' })
  res.json({ experience })
})

// Update an owned experience (title, sections, checkout url, etc.)
router.put('/:id', async (req, res) => {
  try {
    const { title, productType, hook, sections, checkoutUrl, description, targetAudience, promise, longDescription, authorName, keyBenefits, topics, ctaText } = req.body

    if (productType && !PRODUCT_TYPES.includes(productType)) {
      return res.status(400).json({ error: `productType must be one of: ${PRODUCT_TYPES.join(', ')}` })
    }

    const experience = await Experience.findOne({ _id: req.params.id, owner: req.userId })
    if (!experience) return res.status(404).json({ error: 'Experience not found' })

    if (title !== undefined) experience.title = title
    if (productType !== undefined) experience.productType = productType
    if (hook !== undefined) experience.hook = hook
    if (sections !== undefined) experience.sections = sections
    if (checkoutUrl !== undefined) experience.checkoutUrl = checkoutUrl
    if (description !== undefined) experience.description = description
    if (targetAudience !== undefined) experience.targetAudience = targetAudience
    if (promise !== undefined) experience.promise = promise
    if (longDescription !== undefined) experience.longDescription = longDescription
    if (authorName !== undefined) experience.authorName = authorName
    if (keyBenefits !== undefined) experience.keyBenefits = Array.isArray(keyBenefits) ? keyBenefits : []
    if (topics !== undefined) experience.topics = Array.isArray(topics) ? topics : []
    if (ctaText !== undefined) experience.ctaText = ctaText

    await experience.save()
    res.json({ experience })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update experience', detail: err.message })
  }
})

// Publish / unpublish
router.post('/:id/publish', async (req, res) => {
  const experience = await Experience.findOne({ _id: req.params.id, owner: req.userId })
  if (!experience) return res.status(404).json({ error: 'Experience not found' })

  if (!experience.checkoutUrl) {
    return res.status(400).json({ error: 'Add a checkout URL before publishing' })
  }

  experience.status = 'published'
  experience.publishedAt = new Date()
  await experience.save()
  res.json({ experience })
})

router.post('/:id/unpublish', async (req, res) => {
  const experience = await Experience.findOne({ _id: req.params.id, owner: req.userId })
  if (!experience) return res.status(404).json({ error: 'Experience not found' })

  experience.status = 'draft'
  await experience.save()
  res.json({ experience })
})

// Full generation: AI drafts hook + sections from the product info on file
router.post('/:id/generate', requireSetting('aiGenerationEnabled', 'AI generation is temporarily disabled'), requireLimit('aiGenerationsPerMonth'), async (req, res) => {
  const experience = await Experience.findOne({ _id: req.params.id, owner: req.userId })
  if (!experience) return res.status(404).json({ error: 'Experience not found' })

  try {
    const { hook, sections } = await generateExperience({
      title: experience.title,
      productType: experience.productType,
      description: experience.description,
      targetAudience: experience.targetAudience,
      promise: experience.promise,
      hook: experience.hook,
      understanding: experience.productUnderstanding?.generatedAt ? experience.productUnderstanding : null,
    })

    experience.hook = hook
    experience.sections = sections
    await experience.save()
    await logAiUsage(req.userId)

    res.json({ experience })
  } catch (err) {
    res.status(502).json({ error: 'AI generation failed', detail: err.message })
  }
})

// One AI action on a single section: rewrite / shorten / compelling / tone / improve_cta
router.post('/:id/sections/:index/action', requireSetting('aiGenerationEnabled', 'AI generation is temporarily disabled'), requireLimit('aiGenerationsPerMonth'), async (req, res) => {
  const experience = await Experience.findOne({ _id: req.params.id, owner: req.userId })
  if (!experience) return res.status(404).json({ error: 'Experience not found' })

  const index = Number(req.params.index)
  const section = experience.sections[index]
  if (!section) return res.status(404).json({ error: 'Section not found' })

  const { action, tone } = req.body
  if (!action) return res.status(400).json({ error: 'action is required' })

  try {
    const updated = await runSectionAction({ action, tone, section })
    experience.sections[index].heading = updated.heading
    experience.sections[index].body = updated.body
    await experience.save()
    await logAiUsage(req.userId)
    res.json({ experience })
  } catch (err) {
    res.status(502).json({ error: 'AI action failed', detail: err.message })
  }
})

// AI-suggested new section, appended to the end
router.post('/:id/sections/suggest', requireSetting('aiGenerationEnabled', 'AI generation is temporarily disabled'), requireLimit('aiGenerationsPerMonth'), async (req, res) => {
  const experience = await Experience.findOne({ _id: req.params.id, owner: req.userId })
  if (!experience) return res.status(404).json({ error: 'Experience not found' })

  try {
    const section = await suggestNewSection({
      productType: experience.productType,
      existingSections: experience.sections,
      productInfo: { title: experience.title, description: experience.description },
    })
    experience.sections.push(section)
    await experience.save()
    await logAiUsage(req.userId)
    res.json({ experience })
  } catch (err) {
    res.status(502).json({ error: 'AI suggestion failed', detail: err.message })
  }
})

// Funnel + section-level analytics for one owned experience
router.get('/:id/analytics', async (req, res) => {
  const experience = await Experience.findOne({ _id: req.params.id, owner: req.userId })
  if (!experience) return res.status(404).json({ error: 'Experience not found' })

  const range = req.query.range
  if (range && !Object.prototype.hasOwnProperty.call(RANGE_DAYS, range)) {
    return res.status(400).json({ error: `range must be one of: ${Object.keys(RANGE_DAYS).join(', ')}` })
  }

  const plan = await getPlanForUser(req.userId)
  const retentionDays = plan.limits.analyticsRetentionDays
  const requestedDays = RANGE_DAYS[range || '30d']

  // -1 retentionDays means unlimited; requestedDays === null means "all time"
  if (retentionDays !== -1 && (requestedDays === null || requestedDays > retentionDays)) {
    return res.status(402).json({
      error: `Your plan only includes ${retentionDays} days of analytics history`,
      limitReached: true,
      limitKey: 'analyticsRetentionDays',
      current: requestedDays,
      limit: retentionDays,
      plan: plan.slug,
      upgradeRequired: true,
    })
  }

  try {
    const [funnel, sections] = await Promise.all([
      getFunnel(experience._id, range),
      getSectionPerformance(experience._id, range, experience.sections),
    ])

    res.json({ funnel, sections, range: range || '30d' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load analytics', detail: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  const experience = await Experience.findOneAndDelete({ _id: req.params.id, owner: req.userId })
  if (!experience) return res.status(404).json({ error: 'Experience not found' })
  res.json({ ok: true })
})

export default router
