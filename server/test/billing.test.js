import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers.js'

/**
 * Subscription lifecycle against the in-memory mock provider. The mock
 * mirrors Flutterwave's documented shapes (initial charge with our tx_ref,
 * renewals with a provider-generated tx_ref, subscription.cancelled), so
 * this exercises the same lifecycle code that runs in production. It does
 * NOT prove Flutterwave's servers behave this way — see
 * flutterwave-provider.test.js and docs/BILLING.md.
 */

let t, provider, Subscription, Payment
const DAY = 24 * 60 * 60 * 1000

before(async () => {
  t = await startTestServer({ BILLING_GRACE_DAYS: '3' })
  provider = (await import('../services/billing/index.js')).getBillingProvider()
  Subscription = t.mongoose.model('Subscription')
  Payment = t.mongoose.model('Payment')
})
after(async () => {
  await t.stop()
})

const sub = (token) => t.api('GET', '/api/billing/subscription', { token }).then((r) => r.data)
const webhook = (event, data) => t.api('POST', '/api/billing/webhook', { body: { event, data } })
const txIdFrom = (url) => new URL(url).searchParams.get('transaction_id')

async function userWithUsedTrial() {
  const u = await t.signup()
  const s = await sub(u.token) // provisions the Free subscription
  assert.equal(s.plan.slug, 'free')
  await Subscription.updateOne({ user: u.user._id ?? u.user.id }, { $set: { trialUsed: true } })
  return u
}

async function subscribe(u, planSlug = 'starter') {
  const checkout = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug } })
  assert.equal(checkout.status, 200, JSON.stringify(checkout.data))
  assert.ok(checkout.data.url, 'paid checkout returns a gateway URL')
  const txId = txIdFrom(checkout.data.url)
  const verify = await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: txId } })
  assert.equal(verify.status, 200, JSON.stringify(verify.data))
  return { txId, verify: verify.data }
}

const userIdOf = (u) => u.user._id ?? u.user.id

test('public plans list hides provider ids and reports recurring readiness', async () => {
  const res = await t.api('GET', '/api/billing/plans')
  assert.equal(res.status, 200)
  for (const p of res.data.plans) {
    assert.equal(p.providerPriceId, undefined)
    assert.equal(typeof p.recurringReady, 'boolean')
  }
})

test('first paid choice starts a no-card trial that expires back to Free limits', async () => {
  const u = await t.signup()
  const start = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'creator' } })
  assert.equal(start.status, 200)
  assert.match(start.data.redirect, /trial=started/)
  let s = await sub(u.token)
  assert.equal(s.subscription.status, 'trialing')
  assert.equal(s.effectivePlan.slug, 'creator')
  assert.equal(s.usage.experiences.limit, 20)

  await Subscription.updateOne({ user: userIdOf(u) }, { $set: { trialEnd: new Date(Date.now() - 1000) } })
  s = await sub(u.token)
  assert.equal(s.subscription.status, 'expired')
  assert.equal(s.hasAccess, false)
  assert.equal(s.effectivePlan.slug, 'free', 'expired trial falls back to Free limits')
  assert.equal(s.usage.experiences.limit, 1)

  // A second trial is not granted — the next checkout goes to the gateway.
  const again = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'creator' } })
  assert.ok(again.data.url)
})

test('successful checkout is verified server-side; forged references are not applied', async () => {
  const u = await userWithUsedTrial()

  // Redirect query strings are never trusted: a made-up transaction id does nothing.
  const forged = await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: '999999' } })
  assert.equal(forged.status, 200)
  assert.equal(forged.data.applied, false)
  const injection = await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: { $gt: '' } } })
  assert.equal(injection.status, 400)
  assert.equal((await sub(u.token)).plan.slug, 'free')

  const { txId, verify } = await subscribe(u, 'starter')
  assert.equal(verify.applied, true)
  assert.equal(verify.kind, 'initial')
  const s = await sub(u.token)
  assert.equal(s.plan.slug, 'starter')
  assert.equal(s.subscription.status, 'active')
  assert.equal(s.subscription.autoRenews, true)
  const days = (new Date(s.subscription.currentPeriodEnd) - new Date(s.subscription.currentPeriodStart)) / DAY
  assert.ok(days >= 28 && days <= 31, 'one monthly period')

  // Duplicate verify + duplicate webhook → still one Payment, period unchanged.
  const dup = await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: txId } })
  assert.equal(dup.data.duplicate, true)
  const wh = await webhook('charge.completed', { id: txId })
  assert.equal(wh.status, 200)
  assert.equal(wh.data.duplicate, true)
  assert.equal(await Payment.countDocuments({ providerTransactionId: txId }), 1)
  assert.equal((await sub(u.token)).subscription.currentPeriodEnd, s.subscription.currentPeriodEnd)

  // Subscribing again to the same plan is refused.
  const same = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'starter' } })
  assert.equal(same.status, 409)

  // Payment history is the user's own only.
  const payments = await t.api('GET', '/api/billing/payments', { token: u.token })
  assert.equal(payments.data.payments.length, 1)
  assert.equal(payments.data.payments[0].status, 'successful')
})

test("another user's transaction cannot be applied through your session", async () => {
  const victim = await userWithUsedTrial()
  const attacker = await userWithUsedTrial()
  const checkout = await t.api('POST', '/api/billing/checkout', { token: victim.token, body: { planSlug: 'pro' } })
  const txId = txIdFrom(checkout.data.url)
  const steal = await t.api('POST', '/api/billing/verify', { token: attacker.token, body: { transactionId: txId } })
  assert.equal(steal.status, 403)
  assert.equal((await sub(attacker.token)).plan.slug, 'free')
})

test('amount or currency mismatches are recorded but never grant access', async () => {
  const u = await userWithUsedTrial()
  const { generateTxRef } = await import('../services/billing/txRef.js')
  const cheap = provider.addTransaction({ status: 'successful', amount: 0.5, currency: 'usd', txRef: generateTxRef(userIdOf(u), 'business'), customerEmail: u.email })
  const res = await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: cheap.id } })
  assert.equal(res.data.applied, false)
  assert.equal(res.data.reason, 'amount_mismatch')

  const ngn = provider.addTransaction({ status: 'successful', amount: 50, currency: 'NGN', txRef: generateTxRef(userIdOf(u), 'business'), customerEmail: u.email })
  const res2 = await webhook('charge.completed', { id: ngn.id })
  assert.equal(res2.status, 200)
  assert.equal(res2.data.applied, false, 'NGN 50 cannot pay for a USD 50 plan')
  assert.equal((await sub(u.token)).plan.slug, 'free')
  const failed = await Payment.find({ user: userIdOf(u) })
  assert.ok(failed.every((p) => p.status === 'failed' && p.failureReason === 'amount_or_currency_mismatch'))
})

test('parallel duplicate webhook deliveries apply a payment exactly once', async () => {
  const u = await userWithUsedTrial()
  const checkout = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'creator' } })
  const txId = txIdFrom(checkout.data.url)
  const results = await Promise.all(Array.from({ length: 5 }, () => webhook('charge.completed', { id: txId })))
  assert.ok(results.every((r) => r.status === 200 || r.status === 500), 'no unexpected status')
  assert.equal(results.filter((r) => r.data.applied === true).length, 1, 'exactly one delivery applied the payment')
  assert.equal(await Payment.countDocuments({ providerTransactionId: txId }), 1)
  const doc = await Subscription.findOne({ user: userIdOf(u) })
  assert.equal(doc.history.filter((h) => h.reason === 'initial_payment').length, 1)
})

test('automatic renewal extends the period; failed renewal → past_due → expired after grace', async () => {
  const u = await userWithUsedTrial()
  await subscribe(u, 'starter')
  const before = await sub(u.token)
  const firstEnd = new Date(before.subscription.currentPeriodEnd)

  // Successful renewal (provider-generated tx_ref, attributed by subscriber email).
  const renewal = provider.simulateRenewal({ email: u.email })
  const r1 = await webhook('charge.completed', { id: renewal.id })
  assert.equal(r1.data.applied, true)
  assert.equal(r1.data.kind, 'renewal')
  const afterRenewal = await sub(u.token)
  assert.equal(new Date(afterRenewal.subscription.currentPeriodStart).getTime(), firstEnd.getTime(), 'renewal extends from the old period end')
  assert.ok(new Date(afterRenewal.subscription.currentPeriodEnd) > firstEnd)
  assert.equal(await Payment.countDocuments({ user: userIdOf(u), kind: 'renewal', status: 'successful' }), 1)

  // Failed renewal → past_due, access kept through the grace period.
  await Subscription.updateOne({ user: userIdOf(u) }, { $set: { currentPeriodEnd: new Date(Date.now() - 1 * DAY) } })
  const failedTx = provider.simulateRenewal({ email: u.email, success: false })
  const r2 = await webhook('charge.completed', { id: failedTx.id })
  assert.equal(r2.data.applied, true)
  assert.equal(r2.data.status, 'failed')
  let s = await sub(u.token)
  assert.equal(s.subscription.status, 'past_due')
  assert.equal(s.hasAccess, true, 'still inside the 3-day grace period')
  assert.equal(s.effectivePlan.slug, 'starter')
  assert.ok(s.subscription.graceEndsAt)
  assert.equal(s.subscription.lastPaymentError, 'Insufficient funds')
  assert.equal(s.subscription.autoRenews, false)

  // A later retry succeeds → active again.
  const retry = provider.simulateRenewal({ email: u.email })
  await webhook('charge.completed', { id: retry.id })
  s = await sub(u.token)
  assert.equal(s.subscription.status, 'active')
  assert.equal(s.subscription.pastDueSince, null)

  // Fails again and the grace period lapses → expired, Free limits enforced.
  await Subscription.updateOne({ user: userIdOf(u) }, { $set: { currentPeriodEnd: new Date(Date.now() - 1 * DAY) } })
  await webhook('charge.completed', { id: provider.simulateRenewal({ email: u.email, success: false }).id })
  await Subscription.updateOne({ user: userIdOf(u) }, { $set: { currentPeriodEnd: new Date(Date.now() - 4 * DAY) } })
  s = await sub(u.token)
  assert.equal(s.subscription.status, 'expired')
  assert.equal(s.hasAccess, false)
  assert.equal(s.effectivePlan.slug, 'free')
  assert.equal(s.usage.aiGenerations.limit, 0)

  // Paid features are blocked server-side once expired.
  await t.api('POST', '/api/experiences', { token: u.token, body: { title: 'One' } })
  const second = await t.api('POST', '/api/experiences', { token: u.token, body: { title: 'Two' } })
  assert.equal(second.status, 402)

  const doc = await Subscription.findOne({ user: userIdOf(u) })
  const reasons = doc.history.map((h) => h.reason)
  for (const r of ['initial_payment', 'renewal_payment', 'renewal_failed']) assert.ok(reasons.includes(r), `history records ${r}`)
})

test('renewal that never arrives expires access after the grace period', async () => {
  const u = await userWithUsedTrial()
  await subscribe(u, 'starter')
  await Subscription.updateOne({ user: userIdOf(u) }, { $set: { currentPeriodEnd: new Date(Date.now() - 2 * DAY) } })
  let s = await sub(u.token)
  assert.equal(s.hasAccess, true, 'inside grace — the renewal webhook may simply be late')
  await Subscription.updateOne({ user: userIdOf(u) }, { $set: { currentPeriodEnd: new Date(Date.now() - 4 * DAY) } })
  s = await sub(u.token)
  assert.equal(s.subscription.status, 'expired')
  assert.equal(s.effectivePlan.slug, 'free')
})

test('user cancellation stops renewals at the provider and keeps access until period end', async () => {
  const u = await userWithUsedTrial()
  await subscribe(u, 'creator')
  const doc = await Subscription.findOne({ user: userIdOf(u) })
  assert.ok(doc.providerSubscriptionId, 'remote subscription id captured at checkout')

  const cancel = await t.api('POST', '/api/billing/cancel', { token: u.token, body: { reason: 'testing' } })
  assert.equal(cancel.status, 200, JSON.stringify(cancel.data))
  assert.equal(provider.subscriptions.get(doc.providerSubscriptionId).status, 'cancelled', 'remote subscription cancelled')

  let s = await sub(u.token)
  assert.equal(s.subscription.cancelAtPeriodEnd, true)
  assert.equal(s.subscription.autoRenews, false)
  assert.equal(s.hasAccess, true, 'paid-for time is honoured')
  assert.equal(s.effectivePlan.slug, 'creator')

  // Period ends → canceled, no paid access (no grace after a deliberate cancel).
  await Subscription.updateOne({ user: userIdOf(u) }, { $set: { currentPeriodEnd: new Date(Date.now() - 1000) } })
  s = await sub(u.token)
  assert.equal(s.subscription.status, 'canceled')
  assert.equal(s.hasAccess, false)
  assert.equal(s.effectivePlan.slug, 'free')

  // Can resubscribe.
  const back = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'creator' } })
  const v = await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: txIdFrom(back.data.url) } })
  assert.equal(v.data.reactivated, true)
  assert.equal((await sub(u.token)).subscription.status, 'active')
})

test('provider-side cancellation webhook is re-confirmed before it changes anything', async () => {
  const u = await userWithUsedTrial()
  await subscribe(u, 'starter')

  // Spoofed cancel while the remote subscription is still active → ignored.
  const spoof = await webhook('subscription.cancelled', { customer: { email: u.email } })
  assert.equal(spoof.status, 200)
  assert.equal(spoof.data.applied, false)
  assert.equal((await sub(u.token)).subscription.cancelAtPeriodEnd, false)

  provider.simulateRemoteCancel(u.email)
  const real = await webhook('subscription.cancelled', { customer: { email: u.email } })
  assert.equal(real.data.applied, true)
  const s = await sub(u.token)
  assert.equal(s.subscription.cancelAtPeriodEnd, true)
  assert.equal(s.hasAccess, true)
})

test('downgrading to Free cancels the remote subscription first', async () => {
  const u = await userWithUsedTrial()
  await subscribe(u, 'pro')
  const doc = await Subscription.findOne({ user: userIdOf(u) })
  const res = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'free' } })
  assert.equal(res.status, 200)
  assert.equal(provider.subscriptions.get(doc.providerSubscriptionId).status, 'cancelled')
  assert.equal((await sub(u.token)).plan.slug, 'free')
})

test('webhook rejects a bad shared secret when one is configured', async () => {
  process.env.MOCK_WEBHOOK_SECRET = 'expected-secret'
  try {
    const bad = await t.api('POST', '/api/billing/webhook', { body: { event: 'charge.completed', data: { id: '1' } }, headers: { 'verif-hash': 'wrong' } })
    assert.equal(bad.status, 401)
  } finally {
    delete process.env.MOCK_WEBHOOK_SECRET
  }
})

test('admin sees subscription status, access and history', async () => {
  const admin = await t.signup({ name: 'Admin' })
  await t.mongoose.model('User').updateOne({ _id: userIdOf(admin) }, { $set: { role: 'admin' } })
  const nonAdmin = await t.signup()
  assert.equal((await t.api('GET', '/api/admin/subscriptions', { token: nonAdmin.token })).status, 403)

  const res = await t.api('GET', '/api/admin/subscriptions', { token: admin.token })
  assert.equal(res.status, 200, JSON.stringify(res.data))
  const list = res.data.subscriptions || res.data.items || []
  assert.ok(list.length > 0)
  assert.ok(list.some((s) => typeof s.hasAccess === 'boolean'))

  const payments = await t.api('GET', '/api/admin/payments', { token: admin.token })
  assert.equal(payments.status, 200)
})
