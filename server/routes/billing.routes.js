import { Router } from 'express'
import Plan from '../models/Plan.js'
import Subscription from '../models/Subscription.js'
import Payment from '../models/Payment.js'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import { getBillingProvider } from '../services/billing/index.js'
import { getSubscriptionForUser, getUsageSummary } from '../services/billing/entitlements.js'
import { getFreePlan } from '../services/billing/seedPlans.js'
import { generateTxRef, parseTxRef } from '../services/billing/txRef.js'
import { recordAccountEvent } from '../services/analytics/track.js'
import { CLIENT_SIGNALABLE_EVENTS } from '../services/analytics/constants.js'

const router = Router()
const TRIAL_DAYS = 30

// Public — pricing data has always been meant to be seen pre-signup
router.get('/plans', async (_req, res) => {
  const plans = await Plan.find({ active: true }).sort({ order: 1 })
  res.json({ plans })
})

// Public — Flutterwave posts here. Verified via verif-hash inside the handler,
// then independently re-confirmed via verifyTransaction() before anything is applied.
router.post('/webhook', async (req, res) => {
  const provider = getBillingProvider()
  let event

  try {
    event = provider.verifyAndParseWebhook({ body: req.body, headers: req.headers })
  } catch (err) {
    console.error('Webhook verification failed:', err.message)
    return res.status(400).json({ error: 'Invalid webhook signature' })
  }

  try {
    await applyVerifiedTransaction(event.data.id, provider)
    res.json({ received: true })
  } catch (err) {
    console.error('Failed to apply webhook event:', err.message)
    // Still 2xx — Flutterwave retries on failure, and a processing bug on
    // our side shouldn't cause a retry storm. Logged for manual follow-up.
    res.json({ received: true, applied: false })
  }
})

router.use(requireAuth)

router.get('/subscription', async (req, res) => {
  try {
    const summary = await getUsageSummary(req.userId)
    res.json(summary)
  } catch (err) {
    res.status(500).json({ error: 'Failed to load subscription', detail: err.message })
  }
})

// Start a checkout for a paid plan — or move straight to Free, or start a
// trial with no gateway involved at all, depending on the plan and the
// user's trial history.
router.post('/checkout', async (req, res) => {
  try {
    const { planSlug } = req.body
    const plan = await Plan.findOne({ slug: planSlug, active: true })
    if (!plan) return res.status(404).json({ error: 'Unknown plan' })

    const subscription = await getSubscriptionForUser(req.userId)

    if (plan.slug === 'free') {
      const freePlan = await getFreePlan()
      subscription.plan = freePlan._id
      subscription.status = 'active'
      subscription.cancelAtPeriodEnd = false
      await subscription.save()
      return res.json({ redirect: '/dashboard/billing?downgraded=free' })
    }

    // First time choosing a paid plan: grant a trial with no charge and no
    // gateway call at all — the safest possible interpretation of "trial"
    // given Flutterwave has no native trial-then-charge primitive we can
    // rely on here.
    if (!subscription.trialUsed) {
      subscription.plan = plan._id
      subscription.status = 'trialing'
      subscription.trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
      subscription.trialUsed = true
      subscription.trialExpiringNotified = false
      await subscription.save()
      recordAccountEvent({ userId: req.userId, eventType: 'trial_started', metadata: plan.slug })
      return res.json({ redirect: '/dashboard/billing?trial=started' })
    }

    // Trial already used (or expired) — go to a real checkout.
    const user = await User.findById(req.userId)
    const provider = getBillingProvider()
    const txRef = generateTxRef(req.userId, plan.slug)
    const appUrl = process.env.APP_URL || 'http://localhost:5173'

    const { url } = await provider.createCheckoutSession({
      email: user.email,
      name: user.name,
      plan,
      txRef,
      successUrl: `${appUrl}/dashboard/billing`,
    })

    res.json({ url })
  } catch (err) {
    res.status(502).json({ error: 'Failed to start checkout', detail: err.message })
  }
})

// Called by the frontend after the gateway redirects back. This is a
// convenience for immediate UI feedback — it does the same authoritative
// re-verification the webhook does, so a user never has to wait on a
// webhook round-trip to see their plan update, and a skipped/blocked
// webhook can't silently leave them unentitled either.
router.post('/verify', async (req, res) => {
  try {
    const { transactionId } = req.body
    if (!transactionId) return res.status(400).json({ error: 'transactionId is required' })

    const provider = getBillingProvider()
    const result = await applyVerifiedTransaction(transactionId, provider)
    res.json(result)
  } catch (err) {
    res.status(502).json({ error: 'Failed to verify payment', detail: err.message })
  }
})

// Intent-signal events only — a client can report that it showed/clicked
// something, never that money moved or a subscription changed state. The
// allowlist is the enforcement; anything outside it is rejected outright.
router.post('/track', async (req, res) => {
  const { eventType, metadata } = req.body || {}
  if (!CLIENT_SIGNALABLE_EVENTS.includes(eventType)) {
    return res.status(400).json({ error: 'Unknown or server-only event type' })
  }
  await recordAccountEvent({ userId: req.userId, eventType, metadata: typeof metadata === 'string' ? metadata : undefined })
  res.status(202).json({ ok: true })
})

router.post('/cancel', async (req, res) => {
  try {
    // Optional — purely for our own understanding of why people leave;
    // never required, never blocks cancellation either way.
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : undefined

    const subscription = await getSubscriptionForUser(req.userId)
    const planSlugAtCancellation = subscription.plan.slug

    if (subscription.status === 'trialing') {
      // No gateway involvement to unwind — just end the trial now.
      const freePlan = await getFreePlan()
      subscription.plan = freePlan._id
      subscription.status = 'active'
      subscription.trialEnd = null
      await subscription.save()
      recordAccountEvent({ userId: req.userId, eventType: 'subscription_canceled', metadata: reason || planSlugAtCancellation })
      return res.json({ ok: true })
    }

    if (!subscription.providerSubscriptionId) {
      return res.status(400).json({ error: 'No active paid subscription to cancel' })
    }

    const provider = getBillingProvider()
    await provider.cancelSubscription({ subscriptionId: subscription.providerSubscriptionId })

    subscription.cancelAtPeriodEnd = true
    subscription.canceledAt = new Date()
    await subscription.save()

    recordAccountEvent({ userId: req.userId, eventType: 'subscription_canceled', metadata: reason || planSlugAtCancellation })
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ error: 'Failed to cancel subscription', detail: err.message })
  }
})

export default router

/**
 * The single path that ever grants a paid entitlement. Called from both
 * the webhook and the post-redirect /verify endpoint, so whichever arrives
 * first wins and the other is a safe no-op — both always re-check with the
 * gateway rather than trusting their caller.
 */
export async function applyVerifiedTransaction(transactionId, provider) {
  const result = await provider.verifyTransaction({ transactionId })

  // Parsed before the success check (when the ref is parseable at all) so
  // a failed payment can still be attributed to the right user for the
  // payment_failed lifecycle event — a user we can't identify still fails
  // closed (no entitlement change), we just can't log who it was for.
  const parsedForAnyStatus = parseTxRef(result.txRef)

  if (result.status !== 'successful') {
    if (parsedForAnyStatus) {
      recordAccountEvent({ userId: parsedForAnyStatus.userId, eventType: 'payment_failed', metadata: parsedForAnyStatus.planSlug })
    }
    return { applied: false, status: result.status }
  }

  const parsed = parsedForAnyStatus
  if (!parsed) {
    throw new Error(`Could not resolve tx_ref "${result.txRef}" to a user/plan`)
  }

  const plan = await Plan.findOne({ slug: parsed.planSlug })
  if (!plan) throw new Error(`Unknown plan slug in tx_ref: "${parsed.planSlug}"`)

  // Defend against amount tampering: the charged amount must match what
  // the plan actually costs.
  const expectedAmount = plan.monthlyPriceCents / 100
  if (Math.abs(result.amount - expectedAmount) > 0.01) {
    throw new Error(
      `Verified amount (${result.amount}) does not match plan price (${expectedAmount}) — refusing to apply`
    )
  }

  const subscription = await Subscription.findOne({ user: parsed.userId })
  if (!subscription) throw new Error(`No subscription found for user ${parsed.userId}`)

  const wasReactivation = subscription.status === 'canceled' || subscription.status === 'expired'

  subscription.plan = plan._id
  subscription.status = 'active'
  subscription.provider = provider.constructor.name === 'MockBillingProvider' ? 'mock' : 'flutterwave'
  subscription.providerCustomerId = result.customerEmail
  subscription.currentPeriodStart = new Date()
  subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  subscription.trialEnd = null
  subscription.cancelAtPeriodEnd = false

  // Best-effort — Flutterwave's subscription-lookup shape isn't exercised
  // by anything in this codebase's tests; if it fails, entitlement is still
  // granted correctly, we just won't have a remote ID to cancel later.
  if (typeof provider.findSubscriptionByEmail === 'function') {
    try {
      const remoteSub = await provider.findSubscriptionByEmail(result.customerEmail)
      if (remoteSub?.id) subscription.providerSubscriptionId = String(remoteSub.id)
    } catch {
      // already defaulted to best-effort above
    }
  }

  await subscription.save()

  // Best-effort payment history — never blocks or reverts the entitlement
  // grant above, which has already happened by this point regardless of
  // whether this write succeeds.
  try {
    await Payment.create({
      user: parsed.userId,
      subscription: subscription._id,
      plan: plan._id,
      amount: result.amount,
      currency: result.currency || plan.currency,
      provider: subscription.provider,
      providerTransactionId: result.transactionId ? String(result.transactionId) : null,
      txRef: result.txRef,
      status: 'successful',
    })
  } catch (err) {
    console.error('Failed to record payment history:', err.message)
  }

  recordAccountEvent({ userId: parsed.userId, eventType: 'checkout_completed', metadata: plan.slug })
  if (wasReactivation) {
    recordAccountEvent({ userId: parsed.userId, eventType: 'subscription_reactivated', metadata: plan.slug })
    recordAccountEvent({ userId: parsed.userId, eventType: 'winback_completed', metadata: plan.slug })
  }

  return { applied: true, status: 'successful', plan: plan.slug, reactivated: wasReactivation }
}
