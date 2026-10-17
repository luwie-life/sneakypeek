import Plan from '../../models/Plan.js'
import Subscription from '../../models/Subscription.js'
import Payment from '../../models/Payment.js'
import { parseTxRef } from './txRef.js'
import { recordTransition, hasPaidAccess } from './entitlements.js'
import { recordAccountEvent } from '../analytics/track.js'

/**
 * Subscription lifecycle — the only code that changes a subscription in
 * response to money moving. Used by the webhook, the post-redirect /verify
 * call and the reconcile job, so whichever sees a transaction first applies
 * it and every later sighting is a no-op.
 *
 * Model (Flutterwave Payment Plans, v3):
 *  - Our checkout creates the FIRST charge with our own tx_ref
 *    (sp_<user>_<plan>_<nonce>) and `payment_plan`, which subscribes the
 *    card to the plan on Flutterwave's side.
 *  - Flutterwave then charges the card automatically every interval and
 *    sends `charge.completed` for each attempt. Those renewal charges carry
 *    a Flutterwave-generated tx_ref, so they are attributed by the
 *    subscriber's email (Flutterwave ties subscriptions to the email) plus
 *    the plan amount/currency.
 *  - After three consecutive failed attempts Flutterwave cancels the
 *    subscription and sends `subscription.cancelled`.
 *
 * Guarantees:
 *  - Nothing is applied without re-verifying the transaction server-side.
 *  - A gateway transaction id is applied at most once (unique index on
 *    Payment + an atomic claim), so duplicate webhooks/verify calls are safe.
 *  - Amount AND currency must match the plan.
 *  - Concurrent subscription writes are detected (optimistic concurrency)
 *    and retried on fresh state.
 */

const CLAIM_MS = 60 * 1000

export class BillingError extends Error {
  constructor(message, { status = 400, permanent = true } = {}) {
    super(message)
    this.status = status
    this.permanent = permanent
  }
}

export function addMonths(date, months = 1) {
  const d = new Date(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

function providerName(provider) {
  return provider.name || (provider.constructor.name === 'MockBillingProvider' ? 'mock' : 'flutterwave')
}

function amountMatches(tx, plan) {
  const expected = plan.monthlyPriceCents / 100
  const currencyOk = String(tx.currency || '').toLowerCase() === String(plan.currency || 'usd').toLowerCase()
  return currencyOk && Math.abs(Number(tx.amount) - expected) <= 0.01
}

/** Runs fn(subscription) on a freshly loaded doc, retrying on concurrent modification. */
async function mutateSubscription(query, fn, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const sub = await Subscription.findOne(query).populate('plan')
    if (!sub) return null
    const result = await fn(sub)
    try {
      await sub.save()
      return { sub, result }
    } catch (err) {
      if (err.name !== 'VersionError' || i === attempts - 1) throw err
    }
  }
  return null
}

/** Finds which of our subscriptions/plans a verified transaction belongs to. */
async function attribute(tx, provider) {
  const parsed = parseTxRef(tx.txRef)
  const pName = providerName(provider)

  if (parsed) {
    const plan = await Plan.findOne({ slug: parsed.planSlug })
    if (!plan) throw new BillingError(`Unknown plan in tx_ref "${tx.txRef}"`)
    return { kind: 'initial', userId: parsed.userId, plan }
  }

  // Renewal: a charge Flutterwave made on its own schedule.
  const email = String(tx.customerEmail || '').toLowerCase()
  if (!email) return null
  const sub = await Subscription.findOne({ provider: pName, providerCustomerId: email }).populate('plan')
  if (!sub) return null

  let plan = null
  if (tx.planId) plan = await Plan.findOne({ providerPriceId: String(tx.planId) })
  if (!plan && sub.providerPlanId) plan = await Plan.findOne({ providerPriceId: sub.providerPlanId })
  if (!plan) plan = sub.plan
  if (!plan || plan.slug === 'free') return null
  return { kind: 'renewal', userId: String(sub.user), plan }
}

/**
 * Records the transaction exactly once and claims it for processing.
 * Returns { payment, claimed } — claimed=false means someone else already
 * applied it (or is applying it right now).
 */
async function claimPayment({ pName, tx, userId, plan, kind }) {
  const providerTransactionId = String(tx.transactionId)
  const status = tx.status === 'successful' ? 'successful' : tx.status === 'failed' ? 'failed' : 'pending'
  const failureReason = status === 'failed' ? String(tx.processorResponse || 'Payment failed').slice(0, 300) : null
  let payment
  try {
    payment = await Payment.findOneAndUpdate(
      { provider: pName, providerTransactionId },
      {
        $setOnInsert: {
          user: userId,
          plan: plan._id,
          amount: Number(tx.amount) || 0,
          currency: String(tx.currency || plan.currency || 'usd').toLowerCase(),
          provider: pName,
          providerTransactionId,
          txRef: tx.txRef || null,
          kind,
          status,
          failureReason,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  } catch (err) {
    if (err.code !== 11000) throw err
    payment = await Payment.findOne({ provider: pName, providerTransactionId })
  }

  // A transaction first seen as pending can later be verified as final;
  // only unapplied records are ever updated.
  if (!payment.appliedAt && payment.status !== status) {
    await Payment.updateOne({ _id: payment._id, appliedAt: null }, { $set: { status, failureReason } })
    payment.status = status
  }

  if (payment.appliedAt) return { payment, claimed: false }

  const now = new Date()
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, appliedAt: null, $or: [{ processingUntil: null }, { processingUntil: { $lt: now } }] },
    { $set: { processingUntil: new Date(now.getTime() + CLAIM_MS) } },
    { new: true }
  )
  return { payment: claimed || payment, claimed: Boolean(claimed) }
}

async function finishPayment(payment, fields = {}) {
  await Payment.updateOne({ _id: payment._id }, { $set: { appliedAt: new Date(), processingUntil: null, ...fields } })
}

async function releasePayment(payment) {
  await Payment.updateOne({ _id: payment._id }, { $set: { processingUntil: null } })
}

async function applySuccess({ userId, plan, tx, kind, provider, payment }) {
  const pName = providerName(provider)
  const email = String(tx.customerEmail || '').toLowerCase()
  const now = new Date()
  let oldRemoteToCancel = null
  let wasReactivation = false

  // Remote subscription lookup happens outside the retry loop (network).
  let remoteSub = null
  if (kind === 'initial' && typeof provider.findSubscription === 'function') {
    remoteSub = await provider.findSubscription({ email, planId: plan.providerPriceId || undefined, status: 'active' }).catch(() => null)
  }

  const outcome = await mutateSubscription({ user: userId }, (sub) => {
    wasReactivation = ['canceled', 'expired'].includes(sub.status) || !hasPaidAccess(sub)
    const ref = String(tx.transactionId)

    if (kind === 'initial') {
      if (sub.providerSubscriptionId && remoteSub?.id && String(remoteSub.id) !== sub.providerSubscriptionId) {
        oldRemoteToCancel = sub.providerSubscriptionId // plan change or card update: stop the old one
      }
      sub.plan = plan._id
      sub.provider = pName
      sub.providerCustomerId = email || sub.providerCustomerId
      sub.providerPlanId = plan.providerPriceId || null
      if (remoteSub?.id) sub.providerSubscriptionId = String(remoteSub.id)
      sub.currentPeriodStart = now
      sub.currentPeriodEnd = addMonths(now, 1)
      sub.trialEnd = null
      sub.cancelAtPeriodEnd = false
      sub.canceledAt = null
      sub.isComplimentary = false
      sub.grantReason = 'none'
      sub.grantExpiresAt = null
      recordTransition(sub, { to: 'active', reason: 'initial_payment', ref, plan: plan.slug })
    } else {
      // Renewal extends from the end of the paid period (so a renewal that
      // lands a little late doesn't shorten the next cycle). If access had
      // already lapsed, the new period starts now.
      const lapsed = !sub.currentPeriodEnd || !hasPaidAccess(sub, now)
      const start = lapsed ? now : sub.currentPeriodEnd
      sub.plan = plan._id
      sub.currentPeriodStart = start
      sub.currentPeriodEnd = addMonths(start, 1)
      // A renewal that arrives after the user canceled (a race with the
      // provider's schedule) is honoured — they paid — but they stay set to
      // end at the new period end.
      recordTransition(sub, { to: 'active', reason: 'renewal_payment', ref, plan: plan.slug })
    }
    sub.pastDueSince = null
    sub.failedRenewalAttempts = 0
    sub.lastPaymentAt = now
    sub.lastPaymentError = null
  })

  if (!outcome) throw new BillingError(`No subscription found for user ${userId}`)

  await finishPayment(payment, { subscription: outcome.sub._id, plan: plan._id })

  if (oldRemoteToCancel) {
    try {
      await provider.cancelSubscription({ subscriptionId: oldRemoteToCancel })
    } catch (err) {
      // Not fatal for the new subscription, but it could double-bill: log
      // loudly so it is followed up from the admin billing screens.
      console.error(`[billing] Failed to cancel superseded remote subscription ${oldRemoteToCancel}: ${err.message}`)
    }
  }

  recordAccountEvent({ userId, eventType: 'checkout_completed', metadata: plan.slug })
  if (kind === 'initial' && wasReactivation) {
    recordAccountEvent({ userId, eventType: 'subscription_reactivated', metadata: plan.slug })
  }
  return { applied: true, status: 'successful', kind, plan: plan.slug, reactivated: kind === 'initial' && wasReactivation }
}

async function applyFailure({ userId, plan, tx, kind, payment }) {
  const reason = String(tx.processorResponse || 'Payment failed').slice(0, 300)

  if (kind === 'renewal') {
    await mutateSubscription({ user: userId }, (sub) => {
      sub.failedRenewalAttempts = (sub.failedRenewalAttempts || 0) + 1
      sub.lastPaymentError = reason
      if (!sub.pastDueSince) sub.pastDueSince = new Date()
      if (sub.status === 'active') {
        recordTransition(sub, { to: 'past_due', reason: 'renewal_failed', ref: String(tx.transactionId) })
      } else {
        recordTransition(sub, { reason: 'renewal_failed_again', ref: String(tx.transactionId) })
      }
    })
  }
  // A failed initial checkout changes nothing: the user never had access
  // from it. It is recorded as a failed Payment for history only.
  await finishPayment(payment)
  recordAccountEvent({ userId, eventType: 'payment_failed', metadata: plan.slug })
  return { applied: true, status: 'failed', kind, plan: plan.slug }
}

/**
 * Verifies a transaction with the gateway and applies it exactly once.
 * `expectedUserId` (from /verify) prevents applying someone else's ref
 * through your own session.
 */
export async function processTransaction(transactionId, provider, { expectedUserId } = {}) {
  if (!transactionId || !/^[A-Za-z0-9_-]{1,64}$/.test(String(transactionId))) {
    throw new BillingError('Invalid transaction reference')
  }

  const tx = await provider.verifyTransaction({ transactionId: String(transactionId) })
  if (!tx || !tx.transactionId) {
    return { applied: false, status: tx?.status || 'unknown', reason: 'not_found' }
  }

  const target = await attribute(tx, provider)
  if (!target) return { applied: false, status: tx.status, reason: 'unattributed' }

  if (expectedUserId && String(target.userId) !== String(expectedUserId)) {
    throw new BillingError('This payment does not belong to your account', { status: 403 })
  }

  if (tx.status === 'pending') {
    // Nothing to apply yet — a later webhook/verify will see the final state.
    return { applied: false, status: 'pending', kind: target.kind }
  }

  if (tx.status === 'successful' && !amountMatches(tx, target.plan)) {
    // Verified, but not what this plan costs (tampered amount, wrong
    // currency, or a stale price). Recorded, never applied.
    const { payment } = await claimPayment({ pName: providerName(provider), tx, ...target })
    await finishPayment(payment, { status: 'failed', failureReason: 'amount_or_currency_mismatch' })
    console.error(`[billing] Refusing transaction ${tx.transactionId}: ${tx.amount} ${tx.currency} does not match plan ${target.plan.slug}`)
    return { applied: false, status: 'rejected', reason: 'amount_mismatch' }
  }

  const { payment, claimed } = await claimPayment({ pName: providerName(provider), tx, ...target })
  if (!claimed) {
    return { applied: false, duplicate: true, status: tx.status, kind: target.kind, plan: target.plan.slug }
  }

  try {
    if (tx.status === 'successful') return await applySuccess({ ...target, tx, provider, payment })
    return await applyFailure({ ...target, tx, payment })
  } catch (err) {
    await releasePayment(payment) // let the next delivery retry it
    throw err
  }
}

/**
 * Handles Flutterwave's `subscription.cancelled` webhook (customer used the
 * cancel link, merchant cancelled in the dashboard, or three failed
 * renewals). The webhook body is re-confirmed against the provider's own
 * subscription list before anything changes. Access continues to the end
 * of the paid period; after that the lazy transition marks it canceled.
 */
export async function processRemoteCancellation(data, provider) {
  const email = String(data?.customer?.email || data?.customer?.customer_email || '').toLowerCase()
  if (!email) return { applied: false, reason: 'no_email' }
  const pName = providerName(provider)

  const sub = await Subscription.findOne({ provider: pName, providerCustomerId: email })
  if (!sub) return { applied: false, reason: 'unattributed' }

  if (typeof provider.findSubscription === 'function') {
    const stillActive = await provider
      .findSubscription({ email, planId: sub.providerPlanId || undefined, status: 'active' })
      .catch(() => undefined)
    if (stillActive === undefined) {
      throw new BillingError('Could not confirm cancellation with the provider', { permanent: false, status: 502 })
    }
    if (stillActive && (!sub.providerSubscriptionId || String(stillActive.id) === sub.providerSubscriptionId)) {
      return { applied: false, reason: 'still_active_remotely' }
    }
  }

  const res = await mutateSubscription({ _id: sub._id }, (s) => {
    if (s.cancelAtPeriodEnd) return 'noop'
    s.cancelAtPeriodEnd = true
    s.canceledAt = new Date()
    recordTransition(s, { reason: 'provider_cancelled' })
    return 'changed'
  })
  if (res?.result === 'changed') {
    recordAccountEvent({ userId: sub.user, eventType: 'subscription_canceled', metadata: 'provider' })
  }
  return { applied: res?.result === 'changed', reason: res?.result }
}
