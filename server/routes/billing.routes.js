import { Router } from 'express'
import Plan from '../models/Plan.js'
import Payment from '../models/Payment.js'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/security.js'
import { getBillingProvider } from '../services/billing/index.js'
import {
  getSubscriptionForUser,
  getUsageSummary,
  hasPaidAccess,
  recordTransition,
} from '../services/billing/entitlements.js'
import { getFreePlan } from '../services/billing/seedPlans.js'
import { generateTxRef } from '../services/billing/txRef.js'
import { processTransaction, processRemoteCancellation, BillingError } from '../services/billing/lifecycle.js'
import { recordAccountEvent } from '../services/analytics/track.js'
import { CLIENT_SIGNALABLE_EVENTS } from '../services/analytics/constants.js'

const router = Router()
const TRIAL_DAYS = 30

function publicPlan(plan) {
  return {
    _id: plan._id,
    name: plan.name,
    slug: plan.slug,
    monthlyPriceCents: plan.monthlyPriceCents,
    currency: plan.currency,
    description: plan.description,
    features: plan.features,
    limits: plan.limits,
    order: plan.order,
    // Whether this plan can actually be bought as a recurring subscription
    // right now (paid plans need a Flutterwave payment plan configured).
    recurringReady: plan.slug === 'free' || Boolean(plan.providerPriceId) || getBillingProvider().name === 'mock',
  }
}

// Public — pricing data has always been meant to be seen pre-signup.
// providerPriceId is internal and no longer returned.
router.get('/plans', async (_req, res) => {
  const plans = await Plan.find({ active: true }).sort({ order: 1 })
  res.json({ plans: plans.map(publicPlan) })
})

// Public — Flutterwave posts here. Authenticated via verif-hash, then every
// charge is independently re-verified with Flutterwave before anything is
// applied. Response codes follow Flutterwave's retry semantics: 200 means
// "done, don't retry"; any non-2xx triggers a retry (up to 3, 30 min apart),
// which is only requested for transient failures — processing is idempotent.
router.post('/webhook', rateLimit({ windowMs: 60 * 1000, max: 300 }), async (req, res) => {
  const provider = getBillingProvider()
  let event
  try {
    event = provider.verifyAndParseWebhook({ body: req.body, headers: req.headers })
  } catch (err) {
    console.warn('[billing] webhook rejected:', err.message)
    return res.status(401).json({ error: 'Invalid webhook signature' })
  }

  try {
    let result
    if (event.type === 'charge.completed' && event.data?.id) {
      result = await processTransaction(event.data.id, provider)
    } else if (event.type === 'subscription.cancelled') {
      result = await processRemoteCancellation(event.data, provider)
    } else {
      result = { applied: false, reason: 'ignored_event' }
    }
    res.json({ received: true, ...result })
  } catch (err) {
    if (err instanceof BillingError && err.permanent) {
      console.error('[billing] webhook could not be applied (permanent):', err.message)
      return res.json({ received: true, applied: false })
    }
    console.error('[billing] webhook processing failed (will be retried):', err.message)
    res.status(500).json({ error: 'Temporary processing failure' })
  }
})

router.use(requireAuth)

router.get('/subscription', async (req, res) => {
  const summary = await getUsageSummary(req.userId)
  res.json(summary)
})

// The signed-in user's own payment history (no gateway secrets/ids beyond a reference).
router.get('/payments', async (req, res) => {
  const payments = await Payment.find({ user: req.userId })
    .sort({ createdAt: -1 })
    .limit(24)
    .populate('plan', 'name slug')
    .select('amount currency status kind failureReason createdAt plan')
  res.json({ payments })
})

const checkoutLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, keyFn: (req) => req.userId })

// Start a checkout for a paid plan — or move straight to Free, or start a
// trial with no gateway involved, depending on the plan and trial history.
router.post('/checkout', checkoutLimiter, async (req, res) => {
  const { planSlug } = req.body || {}
  if (typeof planSlug !== 'string') return res.status(400).json({ error: 'planSlug is required' })
  const plan = await Plan.findOne({ slug: planSlug, active: true })
  if (!plan) return res.status(404).json({ error: 'Unknown plan' })

  const subscription = await getSubscriptionForUser(req.userId)
  const provider = getBillingProvider()

  if (plan.slug === 'free') {
    // Downgrading must stop future charges first, otherwise the creator
    // keeps being billed for a plan they left.
    if (subscription.providerSubscriptionId && !subscription.cancelAtPeriodEnd && subscription.provider !== 'none') {
      try {
        await provider.cancelSubscription({ subscriptionId: subscription.providerSubscriptionId })
      } catch (err) {
        return res.status(502).json({ error: 'We could not stop your current subscription with the payment provider. Please try again.', detail: err.message })
      }
    }
    const freePlan = await getFreePlan()
    recordTransition(subscription, { to: 'active', reason: 'downgraded_to_free', plan: 'free' })
    subscription.plan = freePlan._id
    subscription.provider = 'none'
    subscription.providerSubscriptionId = null
    subscription.cancelAtPeriodEnd = false
    subscription.currentPeriodStart = null
    subscription.currentPeriodEnd = null
    subscription.trialEnd = null
    subscription.pastDueSince = null
    await subscription.save()
    return res.json({ redirect: '/dashboard/billing?downgraded=free' })
  }

  const access = hasPaidAccess(subscription)
  const samePlan = String(subscription.plan?._id) === String(plan._id)
  if (samePlan && access && subscription.status === 'active' && !subscription.cancelAtPeriodEnd && subscription.provider !== 'none') {
    return res.status(409).json({ error: `You're already subscribed to ${plan.name}` })
  }

  // First time choosing a paid plan: a no-card trial (existing product
  // decision — Flutterwave has no trial-then-charge primitive we rely on).
  if (!subscription.trialUsed) {
    recordTransition(subscription, { to: 'trialing', reason: 'trial_started', plan: plan.slug })
    subscription.plan = plan._id
    subscription.trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    subscription.trialUsed = true
    subscription.trialExpiringNotified = false
    await subscription.save()
    recordAccountEvent({ userId: req.userId, eventType: 'trial_started', metadata: plan.slug })
    return res.json({ redirect: '/dashboard/billing?trial=started' })
  }

  const user = await User.findById(req.userId)
  const txRef = generateTxRef(req.userId, plan.slug)
  const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')

  try {
    const { url } = await provider.createCheckoutSession({
      email: user.email,
      name: user.name,
      plan,
      txRef,
      successUrl: `${appUrl}/dashboard/billing`,
    })
    recordAccountEvent({ userId: req.userId, eventType: 'checkout_started', metadata: plan.slug })
    res.json({ url })
  } catch (err) {
    res.status(502).json({ error: 'Failed to start checkout', detail: err.message })
  }
})

// Called by the frontend after the gateway redirects back. Performs the
// same authoritative verification as the webhook; the redirect's
// ?status=successful query string is never trusted.
router.post('/verify', rateLimit({ windowMs: 10 * 60 * 1000, max: 30, keyFn: (req) => req.userId }), async (req, res) => {
  const { transactionId } = req.body || {}
  if (!transactionId) return res.status(400).json({ error: 'transactionId is required' })
  try {
    const result = await processTransaction(String(transactionId), getBillingProvider(), { expectedUserId: req.userId })
    res.json(result)
  } catch (err) {
    if (err instanceof BillingError) return res.status(err.status).json({ error: err.message })
    res.status(502).json({ error: 'Failed to verify payment', detail: err.message })
  }
})

// Intent-signal events only — a client can report that it showed/clicked
// something, never that money moved or a subscription changed state.
router.post('/track', async (req, res) => {
  const { eventType, metadata } = req.body || {}
  if (!CLIENT_SIGNALABLE_EVENTS.includes(eventType)) {
    return res.status(400).json({ error: 'Unknown or server-only event type' })
  }
  await recordAccountEvent({ userId: req.userId, eventType, metadata: typeof metadata === 'string' ? metadata : undefined })
  res.status(202).json({ ok: true })
})

router.post('/cancel', async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : undefined
  const subscription = await getSubscriptionForUser(req.userId)
  const planSlugAtCancellation = subscription.plan.slug

  if (subscription.status === 'trialing') {
    const freePlan = await getFreePlan()
    recordTransition(subscription, { to: 'active', reason: 'trial_canceled', plan: 'free' })
    subscription.plan = freePlan._id
    subscription.trialEnd = null
    await subscription.save()
    recordAccountEvent({ userId: req.userId, eventType: 'subscription_canceled', metadata: reason || planSlugAtCancellation })
    return res.json({ ok: true, accessUntil: null })
  }

  if (subscription.provider === 'none' || !['active', 'past_due'].includes(subscription.status)) {
    return res.status(400).json({ error: 'No active paid subscription to cancel' })
  }
  if (subscription.cancelAtPeriodEnd) {
    return res.json({ ok: true, alreadyCanceled: true, accessUntil: subscription.currentPeriodEnd })
  }

  const provider = getBillingProvider()
  // Stop renewals at the gateway FIRST. If we can't identify or reach the
  // remote subscription we refuse, rather than marking it canceled locally
  // while the card keeps being charged.
  let remoteId = subscription.providerSubscriptionId
  try {
    if (!remoteId && typeof provider.findSubscription === 'function') {
      const remote = await provider.findSubscription({
        email: subscription.providerCustomerId,
        planId: subscription.providerPlanId || undefined,
        status: 'active',
      })
      remoteId = remote?.id ? String(remote.id) : null
    }
    if (remoteId) await provider.cancelSubscription({ subscriptionId: remoteId })
  } catch (err) {
    return res.status(502).json({ error: 'We could not reach the payment provider to stop renewals. Nothing was changed — please try again.', detail: err.message })
  }

  subscription.providerSubscriptionId = remoteId || subscription.providerSubscriptionId
  subscription.cancelAtPeriodEnd = true
  subscription.canceledAt = new Date()
  recordTransition(subscription, { reason: remoteId ? 'user_canceled' : 'user_canceled_no_remote_found' })
  await subscription.save()

  recordAccountEvent({ userId: req.userId, eventType: 'subscription_canceled', metadata: reason || planSlugAtCancellation })
  res.json({ ok: true, accessUntil: subscription.currentPeriodEnd })
})

export default router
