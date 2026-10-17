import { Router } from 'express'
import Plan from '../../models/Plan.js'
import Subscription from '../../models/Subscription.js'
import { recordAudit } from '../../services/admin/audit.js'

const router = Router()

const KNOWN_FEATURE_KEYS = ['aiStudio', 'analytics']
const KNOWN_LIMIT_KEYS = ['maxExperiences', 'aiGenerationsPerMonth', 'analyticsRetentionDays', 'maxTeamMembers', 'storageMB', 'aiTrialExperiences']

router.get('/', async (_req, res) => {
  const plans = await Plan.find({}).sort({ order: 1 })
  res.json({ plans })
})

/**
 * Deliberately does NOT allow editing `slug`: since nothing generates new
 * plans in this V1 admin, keeping slug immutable eliminates the
 * duplicate-slug risk entirely rather than needing to detect it.
 */
function validatePlanPatch(patch) {
  if ('monthlyPriceCents' in patch) {
    if (typeof patch.monthlyPriceCents !== 'number' || patch.monthlyPriceCents < 0) {
      throw new Error('monthlyPriceCents must be a non-negative number')
    }
  }
  if ('active' in patch && typeof patch.active !== 'boolean') {
    throw new Error('active must be a boolean')
  }
  if ('name' in patch && (typeof patch.name !== 'string' || !patch.name.trim())) {
    throw new Error('name must be a non-empty string')
  }
  if ('limits' in patch) {
    if (typeof patch.limits !== 'object' || patch.limits === null) {
      throw new Error('limits must be an object')
    }
    for (const [key, value] of Object.entries(patch.limits)) {
      if (!KNOWN_LIMIT_KEYS.includes(key)) {
        throw new Error(`Unknown limit key: "${key}"`)
      }
      // -1 is the documented "unlimited" convention; anything else must be a non-negative integer.
      if (!Number.isInteger(value) || value < -1) {
        throw new Error(`${key} must be -1 (unlimited) or a non-negative integer`)
      }
    }
  }
  if ('features' in patch) {
    if (typeof patch.features !== 'object' || patch.features === null) {
      throw new Error('features must be an object')
    }
    for (const [key, value] of Object.entries(patch.features)) {
      if (!KNOWN_FEATURE_KEYS.includes(key)) {
        throw new Error(`Unknown feature flag: "${key}"`)
      }
      if (typeof value !== 'boolean') {
        throw new Error(`Feature "${key}" must be a boolean`)
      }
    }
  }
  if ('slug' in patch) {
    throw new Error('Plan slug cannot be changed')
  }
  if ('providerPriceId' in patch && (typeof patch.providerPriceId !== 'string' || patch.providerPriceId.length > 100)) {
    throw new Error('providerPriceId must be a string (the Flutterwave payment plan id)')
  }
  if ('currency' in patch && (typeof patch.currency !== 'string' || !/^[a-z]{3}$/i.test(patch.currency))) {
    throw new Error('currency must be a 3-letter ISO code')
  }
}

router.patch('/:id', async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id)
    if (!plan) return res.status(404).json({ error: 'Plan not found' })

    validatePlanPatch(req.body)

    const before = {
      monthlyPriceCents: plan.monthlyPriceCents,
      active: plan.active,
      limits: plan.limits.toObject ? plan.limits.toObject() : plan.limits,
      features: plan.features.toObject ? plan.features.toObject() : plan.features,
      providerPriceId: plan.providerPriceId,
      currency: plan.currency,
    }

    if (req.body.name !== undefined) plan.name = req.body.name
    if (req.body.description !== undefined) plan.description = req.body.description
    if (req.body.monthlyPriceCents !== undefined) plan.monthlyPriceCents = req.body.monthlyPriceCents
    if (req.body.active !== undefined) plan.active = req.body.active
    // Changing price/currency invalidates the Flutterwave payment plan
    // (its amount is fixed there) — set the new plan id alongside, or run
    // npm run billing:sync-plans to create one.
    if (req.body.providerPriceId !== undefined) plan.providerPriceId = req.body.providerPriceId.trim()
    if (req.body.currency !== undefined) plan.currency = req.body.currency.toLowerCase()
    // A Flutterwave payment plan's amount/currency are fixed, so a price or
    // currency change without a new plan id would make every new checkout
    // fail the amount check. Clear it so checkout refuses clearly instead.
    const priceChanged =
      (req.body.monthlyPriceCents !== undefined && req.body.monthlyPriceCents !== before.monthlyPriceCents) ||
      (req.body.currency !== undefined && req.body.currency.toLowerCase() !== before.currency)
    if (priceChanged && req.body.providerPriceId === undefined) plan.providerPriceId = ''
    if (req.body.limits) Object.assign(plan.limits, req.body.limits)
    if (req.body.features) Object.assign(plan.features, req.body.features)

    await plan.save()

    await recordAudit({
      adminId: req.adminId,
      action: 'plan_updated',
      targetType: 'Plan',
      targetId: plan._id,
      metadata: { slug: plan.slug, before, after: req.body },
    })

    res.json({ plan })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// No DELETE route: plans are deactivated (active:false via PATCH above),
// never deleted — active subscriptions may still reference them.
router.get('/:id/subscriber-count', async (req, res) => {
  const count = await Subscription.countDocuments({ plan: req.params.id, status: { $in: ['active', 'trialing', 'past_due'] } })
  res.json({ activeSubscribers: count })
})

export default router
