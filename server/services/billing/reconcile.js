import Subscription from '../../models/Subscription.js'
import { getBillingProvider } from './index.js'
import { processTransaction } from './lifecycle.js'
import { getSubscriptionForUser, recordTransition } from './entitlements.js'

const DAY_MS = 24 * 60 * 60 * 1000
const ymd = (d) => d.toISOString().slice(0, 10)

/**
 * Safety net for missed webhooks. Webhooks are the primary renewal signal,
 * but Flutterwave only retries a failed delivery three times — if our API
 * was down for longer, a successful renewal could be missed and the
 * creator wrongly downgraded. This job, for every gateway subscription
 * whose renewal is due or overdue:
 *   1. pulls the subscriber's successful transactions since the period
 *      end and runs each through the same idempotent processTransaction()
 *      (already-applied ones are no-ops);
 *   2. fills in a missing remote subscription id;
 *   3. notices a subscription cancelled on the provider side;
 *   4. applies lazy status transitions so admin reports are current.
 * Correctness of access never depends on this job — entitlement checks
 * apply the same transitions lazily on read.
 */
export async function reconcileSubscriptions({ provider = getBillingProvider(), now = new Date(), limit = 200 } = {}) {
  const summary = { checked: 0, applied: 0, errors: 0 }
  const due = await Subscription.find({
    provider: { $in: ['flutterwave', 'mock'] },
    status: { $in: ['active', 'past_due'] },
    currentPeriodEnd: { $lt: new Date(now.getTime() + DAY_MS) },
  })
    .sort({ currentPeriodEnd: 1 })
    .limit(limit)

  for (const sub of due) {
    summary.checked += 1
    const email = sub.providerCustomerId
    try {
      if (email && typeof provider.listTransactions === 'function') {
        const from = new Date(sub.currentPeriodEnd.getTime() - 3 * DAY_MS)
        const txs = await provider.listTransactions({ email, from: ymd(from), to: ymd(now), status: 'successful' })
        for (const tx of txs) {
          const result = await processTransaction(tx.id, provider).catch(() => null)
          if (result?.applied) summary.applied += 1
        }
      }

      if (email && typeof provider.findSubscription === 'function') {
        const fresh = await Subscription.findById(sub._id)
        const active = await provider.findSubscription({ email, planId: fresh.providerPlanId || undefined, status: 'active' })
        if (active && !fresh.providerSubscriptionId) {
          fresh.providerSubscriptionId = String(active.id)
          await fresh.save().catch(() => {})
        } else if (!active && !fresh.cancelAtPeriodEnd && fresh.currentPeriodEnd < now) {
          fresh.cancelAtPeriodEnd = true
          fresh.canceledAt = now
          recordTransition(fresh, { reason: 'provider_subscription_inactive' })
          await fresh.save().catch(() => {})
        }
      }

      await getSubscriptionForUser(sub.user)
    } catch (err) {
      summary.errors += 1
      console.error(`[billing] reconcile failed for subscription ${sub._id}: ${err.message}`)
    }
  }
  return summary
}

let timer = null
export function startReconcileJob() {
  const minutes = Number(process.env.BILLING_RECONCILE_INTERVAL_MINUTES ?? 60)
  if (!minutes || minutes <= 0 || timer) return
  timer = setInterval(() => {
    reconcileSubscriptions().catch((err) => console.error('[billing] reconcile run failed:', err.message))
  }, minutes * 60 * 1000)
  timer.unref?.()
}
