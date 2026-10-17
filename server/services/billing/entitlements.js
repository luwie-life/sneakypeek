import mongoose from 'mongoose'
import Subscription from '../../models/Subscription.js'
import Experience from '../../models/Experience.js'
import AiUsageLog from '../../models/AiUsageLog.js'
import ProductMaterial from '../../models/ProductMaterial.js'
import User from '../../models/User.js'
import { getFreePlan } from './seedPlans.js'
import { recordAccountEvent } from '../analytics/track.js'

const DAY_MS = 24 * 60 * 60 * 1000
const TRIAL_EXPIRING_WINDOW_MS = 3 * DAY_MS

/**
 * Failed-renewal grace period. Flutterwave retries a failed payment-plan
 * charge and cancels the subscription after three consecutive failures; we
 * keep paid access for this many days past the period end so a retry that
 * succeeds doesn't bounce the creator to Free in between. After that, with
 * no successful renewal recorded, access drops to Free.
 */
export function gracePeriodMs() {
  const days = Number(process.env.BILLING_GRACE_DAYS ?? 3)
  return (Number.isFinite(days) && days >= 0 ? days : 3) * DAY_MS
}

export const HISTORY_LIMIT = 100

/** Appends an audit-trail entry for a status transition (capped). */
export function recordTransition(subscription, { to, reason, ref, plan } = {}) {
  const from = subscription.status
  const entry = {
    at: new Date(),
    from,
    to: to ?? from,
    plan: plan ?? subscription.plan?.slug ?? undefined,
    reason,
    ref,
  }
  subscription.history = [...(subscription.history || []), entry].slice(-HISTORY_LIMIT)
  if (to) subscription.status = to
}

/**
 * Whether this subscription currently entitles the user to its plan's
 * features. The plan stored on a subscription is "the plan they chose";
 * this decides whether they actually get it right now. Everything that
 * enforces limits goes through this — never through `status` alone.
 */
export function hasPaidAccess(subscription, now = new Date()) {
  if (!subscription) return false
  if (subscription.plan?.slug === 'free') return true // Free is always "entitled" to Free
  if (subscription.isComplimentary) {
    return !subscription.grantExpiresAt || subscription.grantExpiresAt > now
  }
  const end = subscription.currentPeriodEnd
  switch (subscription.status) {
    case 'trialing':
      return Boolean(subscription.trialEnd && subscription.trialEnd > now)
    case 'active':
      // A paid subscription without a period end can only be a legacy/admin
      // record with no gateway; treat as entitled (unchanged behaviour).
      if (!end) return subscription.provider === 'none'
      return end.getTime() + gracePeriodMs() > now.getTime()
    case 'past_due':
      return Boolean(end && end.getTime() + gracePeriodMs() > now.getTime())
    case 'canceled':
      // Canceled at period end: keep access for the time already paid for.
      return Boolean(end && end > now)
    default:
      return false
  }
}

async function saveWithRetry(subscription) {
  try {
    await subscription.save()
  } catch (err) {
    // Another request updated this subscription concurrently. The lazy
    // transitions below are idempotent, so the other writer's state wins
    // and the next read re-evaluates.
    if (err.name !== 'VersionError') throw err
  }
}

/**
 * Returns the user's subscription with its plan populated, auto-provisioning
 * a Free subscription if one doesn't exist yet. Lazily applies time-based
 * state transitions (no scheduler required for correctness — the reconcile
 * job in billing/reconcile.js just keeps admin reporting fresh):
 *  - complimentary grant expiry → Free
 *  - trial end → expired
 *  - cancel-at-period-end reached → canceled
 *  - paid period + grace passed with no successful renewal → expired
 */
export async function getSubscriptionForUser(userId) {
  let subscription = await Subscription.findOne({ user: userId }).populate('plan')

  if (!subscription) {
    const freePlan = await getFreePlan()
    try {
      subscription = await Subscription.create({ user: userId, plan: freePlan._id, status: 'active', provider: 'none' })
    } catch (err) {
      // Two first requests raced to provision — the unique index on `user`
      // means the other one won; use its record.
      if (err.code !== 11000) throw err
      subscription = await Subscription.findOne({ user: userId })
    }
    subscription = await subscription.populate('plan')
  }

  if (!subscription.plan) {
    // Plan document was removed out from under the subscription — fail safe to Free.
    const freePlan = await getFreePlan()
    subscription.plan = freePlan._id
    await saveWithRetry(subscription)
    subscription.plan = freePlan
  }

  const now = new Date()

  if (subscription.isComplimentary && subscription.grantExpiresAt && subscription.grantExpiresAt < now) {
    const expiringPlanSlug = subscription.plan.slug
    const freePlan = await getFreePlan()
    recordTransition(subscription, { to: 'active', reason: 'complimentary_expired', plan: 'free' })
    subscription.plan = freePlan._id
    subscription.isComplimentary = false
    subscription.grantReason = 'none'
    subscription.grantNote = ''
    subscription.grantExpiresAt = null
    await saveWithRetry(subscription)
    subscription.plan = freePlan
    recordAccountEvent({ userId, eventType: 'complimentary_access_expired', metadata: expiringPlanSlug })
  }

  if (subscription.status === 'trialing' && subscription.trialEnd && subscription.trialEnd < now) {
    recordTransition(subscription, { to: 'expired', reason: 'trial_ended' })
    await saveWithRetry(subscription)
  } else if (
    subscription.status === 'trialing' &&
    subscription.trialEnd &&
    !subscription.trialExpiringNotified &&
    subscription.trialEnd.getTime() - now.getTime() <= TRIAL_EXPIRING_WINDOW_MS
  ) {
    subscription.trialExpiringNotified = true
    await saveWithRetry(subscription)
    recordAccountEvent({ userId, eventType: 'trial_expiring', metadata: subscription.plan?.slug })
  }

  const end = subscription.currentPeriodEnd
  const isGatewayPaid = subscription.provider !== 'none' && !subscription.isComplimentary
  if (isGatewayPaid && end && ['active', 'past_due'].includes(subscription.status)) {
    if (subscription.cancelAtPeriodEnd && end < now) {
      recordTransition(subscription, { to: 'canceled', reason: 'period_ended_after_cancel' })
      await saveWithRetry(subscription)
    } else if (end.getTime() + gracePeriodMs() < now.getTime()) {
      recordTransition(subscription, { to: 'expired', reason: subscription.status === 'past_due' ? 'renewal_failed' : 'renewal_not_received' })
      await saveWithRetry(subscription)
    }
  }

  return subscription
}

/**
 * The plan whose limits/features apply RIGHT NOW: the subscribed plan if
 * the subscription currently grants access, otherwise Free.
 */
export async function getEffectivePlan(subscription) {
  if (hasPaidAccess(subscription)) return subscription.plan
  return getFreePlan()
}

export async function getPlanForUser(userId) {
  const subscription = await getSubscriptionForUser(userId)
  return getEffectivePlan(subscription)
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

/** Start of the usage window: the current paid period, or the calendar month otherwise. */
function usageWindowStart(subscription, effectivePlan) {
  if (effectivePlan.slug !== 'free' && subscription.currentPeriodStart && hasPaidAccess(subscription)) {
    return subscription.currentPeriodStart
  }
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

async function countExperiences(userId) {
  // Archived experiences don't count toward the active-experience limit.
  return Experience.countDocuments({ owner: userId, status: { $ne: 'archived' } })
}

async function countAiUsage(userId, since) {
  // Trial usage is a separate lifetime allowance, never counted monthly.
  return AiUsageLog.countDocuments({ user: userId, createdAt: { $gte: since }, trial: { $ne: true } })
}

export async function getStorageBytesUsed(userId) {
  const rows = await ProductMaterial.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$sizeBytes', { $ifNull: ['$metadata.sizeBytes', 0] }] } } } },
  ])
  return rows[0]?.total || 0
}

/**
 * Checks one named limit for a user. Returns a structured result the
 * frontend can render directly as an upgrade prompt when `allowed` is false.
 */
export async function checkLimit(userId, limitKey, { addBytes = 0 } = {}) {
  const subscription = await getSubscriptionForUser(userId)
  const plan = await getEffectivePlan(subscription)
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
    return { allowed: current < limit, limitKey, current, limit, plan: plan.slug }
  }
  if (limitKey === 'aiGenerationsPerMonth') {
    current = await countAiUsage(userId, usageWindowStart(subscription, plan))
    return { allowed: current < limit, limitKey, current, limit, plan: plan.slug }
  }
  if (limitKey === 'storageMB') {
    const usedBytes = await getStorageBytesUsed(userId)
    const limitBytes = limit * 1024 * 1024
    return {
      allowed: usedBytes + addBytes <= limitBytes,
      limitKey,
      current: Math.round((usedBytes / (1024 * 1024)) * 10) / 10,
      limit,
      plan: plan.slug,
    }
  }
  // Limits without a metering source yet (team members) — allow.
  return { allowed: true, limitKey, current: null, limit, plan: plan.slug }
}

const TRIAL_KINDS = new Set(['analyze', 'generate'])

/**
 * Decides whether an AI call may run, and whether it is paid from the
 * monthly allowance or from the Free plan's one-time trial. The trial
 * covers exactly one analysis and one generation, both for the same single
 * experience (the onboarding "first AI experience"). Section actions and
 * suggestions are never trial-eligible.
 */
export async function checkAiAccess(userId, { kind, experienceId }) {
  const monthly = await checkLimit(userId, 'aiGenerationsPerMonth')
  if (monthly.allowed) return { ...monthly, trial: false }

  const plan = await getPlanForUser(userId)
  const trialAllowance = plan.limits?.aiTrialExperiences || 0
  if (trialAllowance > 0 && TRIAL_KINDS.has(kind) && experienceId) {
    const user = await User.findById(userId).select('aiTrial').lean()
    const trial = user?.aiTrial || {}
    const sameExperience = !trial.experience || String(trial.experience) === String(experienceId)
    const kindUnused = !trial[`${kind}UsedAt`]
    if (sameExperience && kindUnused) return { ...monthly, allowed: true, trial: true }
    return { ...monthly, allowed: false, trial: false, trialUsed: true }
  }
  return { ...monthly, trial: false }
}

/** Records one completed AI call (after success only — failures are never billed). */
export async function logAiUsage(userId, { kind = 'other', experienceId = null, trial = false } = {}) {
  if (trial) {
    await User.updateOne(
      { _id: userId },
      { $set: { 'aiTrial.experience': experienceId, [`aiTrial.${kind}UsedAt`]: new Date() } }
    )
  }
  await AiUsageLog.create({ user: userId, kind, experience: experienceId, trial })
}

const AI_LOCK_MS = 120 * 1000

/**
 * Per-user AI lock. Serializes AI calls so concurrent requests (double
 * clicks, two tabs, scripted abuse) can't all pass the usage check before
 * any of them is logged. Returns false if another AI call is in flight.
 */
export async function acquireAiLock(userId) {
  const now = new Date()
  const res = await User.updateOne(
    { _id: userId, $or: [{ aiLockUntil: null }, { aiLockUntil: { $exists: false } }, { aiLockUntil: { $lt: now } }] },
    { $set: { aiLockUntil: new Date(now.getTime() + AI_LOCK_MS) } }
  )
  return res.modifiedCount === 1
}

export async function releaseAiLock(userId) {
  await User.updateOne({ _id: userId }, { $set: { aiLockUntil: null } }).catch(() => {})
}

export async function getUsageSummary(userId) {
  const subscription = await getSubscriptionForUser(userId)
  const effective = await getEffectivePlan(subscription)
  const plan = subscription.plan
  const since = usageWindowStart(subscription, effective)

  const [experiencesUsed, aiGenerationsUsed, storageBytes, user] = await Promise.all([
    countExperiences(userId),
    countAiUsage(userId, since),
    getStorageBytesUsed(userId),
    User.findById(userId).select('aiTrial').lean(),
  ])

  const access = hasPaidAccess(subscription)
  const graceEndsAt =
    subscription.status === 'past_due' && subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd.getTime() + gracePeriodMs())
      : null
  const trialAllowance = effective.limits?.aiTrialExperiences || 0

  return {
    // The plan the user chose (shown as "your plan")...
    plan: {
      name: plan.name,
      slug: plan.slug,
      monthlyPriceCents: plan.monthlyPriceCents,
      currency: plan.currency,
    },
    // ...and the plan whose limits actually apply right now.
    effectivePlan: { name: effective.name, slug: effective.slug },
    hasAccess: access,
    subscription: {
      status: subscription.status,
      provider: subscription.provider,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEnd: subscription.trialEnd,
      trialUsed: subscription.trialUsed,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: subscription.canceledAt,
      pastDueSince: subscription.pastDueSince,
      graceEndsAt,
      lastPaymentAt: subscription.lastPaymentAt,
      lastPaymentError: subscription.lastPaymentError,
      isComplimentary: subscription.isComplimentary,
      grantExpiresAt: subscription.grantExpiresAt,
      autoRenews:
        access &&
        ['flutterwave', 'mock'].includes(subscription.provider) &&
        subscription.status === 'active' &&
        !subscription.cancelAtPeriodEnd,
    },
    usage: {
      experiences: { used: experiencesUsed, limit: effective.limits.maxExperiences },
      aiGenerations: { used: aiGenerationsUsed, limit: effective.limits.aiGenerationsPerMonth },
      storage: { usedMB: Math.round((storageBytes / (1024 * 1024)) * 10) / 10, limitMB: effective.limits.storageMB },
      aiTrial: {
        available: trialAllowance > 0,
        experience: user?.aiTrial?.experience || null,
        analyzeUsed: Boolean(user?.aiTrial?.analyzeUsedAt),
        generateUsed: Boolean(user?.aiTrial?.generateUsedAt),
      },
    },
  }
}
