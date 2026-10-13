import Subscription from '../../models/Subscription.js'
import Experience from '../../models/Experience.js'
import AiUsageLog from '../../models/AiUsageLog.js'
import { getFreePlan } from './seedPlans.js'
import { recordAccountEvent } from '../analytics/track.js'

const TRIAL_EXPIRING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

/**
 * Returns the user's subscription with its plan populated, auto-provisioning
 * a Free subscription if one doesn't exist yet (covers users created before
 * billing existed, and is a safety net if signup provisioning ever fails).
 *
 * Also lazily expires a trial that has run past its end date without ever
 * becoming a paid, active subscription (no successful charge came in). This
 * is what keeps `status` honest without needing a scheduled job — the state
 * transition happens the next time anything asks for this user's plan.
 */
export async function getSubscriptionForUser(userId) {
  let subscription = await Subscription.findOne({ user: userId }).populate('plan')

  if (!subscription) {
    const freePlan = await getFreePlan()
    subscription = await Subscription.create({
      user: userId,
      plan: freePlan._id,
      status: 'active',
      provider: 'none',
    })
    subscription = await subscription.populate('plan')
  }

  if (
    subscription.isComplimentary &&
    subscription.grantExpiresAt &&
    subscription.grantExpiresAt < new Date()
  ) {
    const expiringPlanSlug = subscription.plan.slug
    const freePlan = await getFreePlan()
    subscription.plan = freePlan._id
    subscription.isComplimentary = false
    subscription.grantReason = 'none'
    subscription.grantNote = ''
    subscription.grantExpiresAt = null
    await subscription.save()
    subscription.plan = freePlan // already a full Plan doc — skip a redundant populate() round trip
    recordAccountEvent({ userId, eventType: 'complimentary_access_expired', metadata: expiringPlanSlug })
  }

  if (subscription.status === 'trialing' && subscription.trialEnd && subscription.trialEnd < new Date()) {
    subscription.status = 'expired'
    await subscription.save()
  } else if (
    subscription.status === 'trialing' &&
    subscription.trialEnd &&
    !subscription.trialExpiringNotified &&
    subscription.trialEnd.getTime() - Date.now() <= TRIAL_EXPIRING_WINDOW_MS
  ) {
    subscription.trialExpiringNotified = true
    await subscription.save()
    recordAccountEvent({ userId, eventType: 'trial_expiring', metadata: subscription.plan?.slug })
  }

  return subscription
}

export async function getPlanForUser(userId) {
  const subscription = await getSubscriptionForUser(userId)
  return subscription.plan
}

/** Feature-flag check — the single place components/routes should ask this. */
export async function canUse(userId, featureKey) {
  const plan = await getPlanForUser(userId)
  return Boolean(plan.features?.[featureKey])
}

const UNLIMITED = -1

function isUnlimited(limit) {
  return limit === UNLIMITED
}

/** Start of the usage window: the subscription's current billing period, or the calendar month for Free/no-period accounts. */
function usageWindowStart(subscription) {
  if (subscription.currentPeriodStart) return subscription.currentPeriodStart
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

async function countExperiences(userId) {
  return Experience.countDocuments({ owner: userId })
}

async function countAiUsage(userId, since) {
  return AiUsageLog.countDocuments({ user: userId, createdAt: { $gte: since } })
}

/**
 * Checks one named limit for a user. Returns a structured result the
 * frontend can render directly as an upgrade prompt when `allowed` is false.
 */
export async function checkLimit(userId, limitKey) {
  const subscription = await getSubscriptionForUser(userId)
  const plan = subscription.plan
  const limit = plan.limits?.[limitKey]

  if (limit === undefined) {
    throw new Error(`Unknown limit key: "${limitKey}"`)
  }
  if (isUnlimited(limit)) {
    return { allowed: true, limitKey, current: null, limit: -1, plan: plan.slug }
  }

  let current
  if (limitKey === 'maxExperiences') {
    current = await countExperiences(userId)
  } else if (limitKey === 'aiGenerationsPerMonth') {
    current = await countAiUsage(userId, usageWindowStart(subscription))
  } else {
    // Limits without a metering source yet (team members, storage) —
    // nothing to compare against until those features exist, so allow.
    return { allowed: true, limitKey, current: null, limit, plan: plan.slug }
  }

  return {
    allowed: current < limit,
    limitKey,
    current,
    limit,
    plan: plan.slug,
  }
}

export async function logAiUsage(userId) {
  await AiUsageLog.create({ user: userId })
}

export async function getUsageSummary(userId) {
  const subscription = await getSubscriptionForUser(userId)
  const plan = subscription.plan
  const since = usageWindowStart(subscription)

  const [experiencesUsed, aiGenerationsUsed] = await Promise.all([
    countExperiences(userId),
    countAiUsage(userId, since),
  ])

  return {
    plan: {
      name: plan.name,
      slug: plan.slug,
      monthlyPriceCents: plan.monthlyPriceCents,
      currency: plan.currency,
    },
    subscription: {
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEnd: subscription.trialEnd,
      trialUsed: subscription.trialUsed,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    },
    usage: {
      experiences: { used: experiencesUsed, limit: plan.limits.maxExperiences },
      aiGenerations: { used: aiGenerationsUsed, limit: plan.limits.aiGenerationsPerMonth },
    },
  }
}
