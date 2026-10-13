import { Router } from 'express'
import mongoose from 'mongoose'
import User from '../../models/User.js'
import Experience from '../../models/Experience.js'
import Subscription from '../../models/Subscription.js'
import AiUsageLog from '../../models/AiUsageLog.js'
import Event from '../../models/Event.js'
import { resolveRange, getPlatformFunnel } from '../../services/analytics/aggregate.js'

const MONETIZATION_EVENT_TYPES = [
  'upgrade_prompt_viewed',
  'upgrade_started',
  'checkout_started',
  'checkout_completed',
  'trial_started',
  'payment_failed',
  'subscription_reactivated',
  'subscription_canceled',
]

/** Distinct-user counts per monetization event type, in range — same distinct-actor pattern the visitor funnel uses, keyed by user instead of session. */
async function getMonetizationSummary(from) {
  const match = { eventType: { $in: MONETIZATION_EVENT_TYPES }, user: { $ne: null } }
  if (from) match.timestamp = { $gte: from }

  const rows = await Event.aggregate([
    { $match: match },
    { $group: { _id: { eventType: '$eventType', user: '$user' } } },
    { $group: { _id: '$_id.eventType', count: { $sum: 1 } } },
  ])

  const counts = {}
  for (const row of rows) counts[row._id] = row.count

  const promptViews = counts.upgrade_prompt_viewed || 0
  const checkoutsCompleted = counts.checkout_completed || 0

  return {
    upgradePromptViews: promptViews,
    upgradeStarted: counts.upgrade_started || 0,
    checkoutStarted: counts.checkout_started || 0,
    checkoutCompleted: checkoutsCompleted,
    trialStarted: counts.trial_started || 0,
    paymentFailed: counts.payment_failed || 0,
    reactivated: counts.subscription_reactivated || 0,
    canceled: counts.subscription_canceled || 0,
    // Conversion from seeing a paywall to actually paying — the one
    // number that most directly answers "are upgrade prompts working."
    promptToCheckoutRate: promptViews > 0 ? Math.round((checkoutsCompleted / promptViews) * 1000) / 10 : null,
  }
}

const router = Router()

router.get('/', async (req, res) => {
  try {
    const range = req.query.range || '30d'
    const from = resolveRange(range)
    const dateMatch = from ? { createdAt: { $gte: from } } : {}

    const [
      totalUsers,
      newUsers,
      activeUsers,
      totalExperiences,
      publishedExperiences,
      draftExperiences,
      subscriptionsByStatus,
      mrrResult,
      aiGenerations,
      engagement,
      monetization,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments(dateMatch),
      // "Active" = has a real, recorded activity signal in range — never invented.
      User.countDocuments(from ? { lastActiveAt: { $gte: from } } : { lastActiveAt: { $ne: null } }),
      Experience.countDocuments({}),
      Experience.countDocuments({ status: 'published' }),
      Experience.countDocuments({ status: 'draft' }),
      Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Subscription.aggregate([
        { $match: { status: { $in: ['active', 'trialing'] } } },
        { $lookup: { from: 'plans', localField: 'plan', foreignField: '_id', as: 'planDoc' } },
        { $unwind: '$planDoc' },
        { $group: { _id: null, mrrCents: { $sum: '$planDoc.monthlyPriceCents' } } },
      ]),
      AiUsageLog.countDocuments(from ? { createdAt: { $gte: from } } : {}),
      getPlatformFunnel(range),
      getMonetizationSummary(from),
    ])

    const statusCounts = {}
    for (const row of subscriptionsByStatus) statusCounts[row._id] = row.count

    res.json({
      range,
      users: { total: totalUsers, new: newUsers, active: activeUsers },
      experiences: { total: totalExperiences, published: publishedExperiences, draft: draftExperiences },
      billing: {
        active: statusCounts.active || 0,
        trialing: statusCounts.trialing || 0,
        pastDue: statusCounts.past_due || 0,
        canceledOrExpired: (statusCounts.canceled || 0) + (statusCounts.expired || 0),
        mrrCents: mrrResult[0]?.mrrCents || 0,
      },
      ai: { generations: aiGenerations },
      engagement,
      monetization,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load overview', detail: err.message })
  }
})

export default router
