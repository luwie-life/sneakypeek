import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers.js'

/**
 * Runs the REAL FlutterwaveProvider (and the real routes/lifecycle) against
 * a fake Flutterwave v3 API implemented here from the documented request
 * and response shapes:
 *   https://developer.flutterwave.com/docs/payment-plans-1
 *   https://developer.flutterwave.com/reference/verify-transaction
 *   https://developer.flutterwave.com/reference/get-all-subscriptions
 *   https://developer.flutterwave.com/reference/cancel-a-subscription-1
 *   https://developer.flutterwave.com/docs/webhooks
 * This proves our requests/handling match the documentation. It does not
 * prove Flutterwave's sandbox behaves identically (not run: no credentials).
 */

const SECRET_HASH = 'test-flw-secret-hash'
let t, Plan, Subscription, provider
const fake = { calls: [], transactions: new Map(), subscriptions: new Map(), plans: new Map(), nextTx: 7000, nextSub: 300, nextPlan: 9000, down: false }

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function fakeFetch(url, init = {}) {
  const u = new URL(url)
  const method = init.method || 'GET'
  const body = init.body ? JSON.parse(init.body) : undefined
  fake.calls.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, auth: init.headers?.Authorization })
  if (fake.down) return json(503, { status: 'error', message: 'Service unavailable' })
  if (init.headers?.Authorization !== 'Bearer FLWSECK_TEST-fake') return json(401, { status: 'error', message: 'Invalid authorization key' })

  let m
  if (method === 'POST' && u.pathname === '/v3/payments') {
    const id = String(fake.nextTx++)
    fake.transactions.set(id, { id: Number(id), tx_ref: body.tx_ref, amount: Number(body.amount), currency: body.currency, status: 'pending', customer: { email: body.customer.email }, plan: body.payment_plan, payment_type: 'card' })
    return json(200, { status: 'success', message: 'Hosted Link', data: { link: `https://checkout.flutterwave.test/v3/hosted/pay/${id}` } })
  }
  if (method === 'GET' && (m = u.pathname.match(/^\/v3\/transactions\/([^/]+)\/verify$/))) {
    const tx = fake.transactions.get(m[1])
    if (!tx) return json(400, { status: 'error', message: 'No transaction was found for this id', data: null })
    return json(200, { status: 'success', message: 'Transaction fetched successfully', data: tx })
  }
  if (method === 'GET' && u.pathname === '/v3/transactions') {
    return json(200, { status: 'success', data: [...fake.transactions.values()].filter((x) => !u.searchParams.get('customer_email') || x.customer.email === u.searchParams.get('customer_email')) })
  }
  if (method === 'GET' && u.pathname === '/v3/subscriptions') {
    const q = Object.fromEntries(u.searchParams)
    const data = [...fake.subscriptions.values()].filter(
      (s) => (!q.email || s.customer.customer_email === q.email) && (!q.plan || String(s.plan) === String(q.plan)) && (!q.status || s.status === q.status)
    )
    return json(200, { status: 'success', message: 'Plan subscriptions fetched', meta: { page_info: { total: data.length } }, data })
  }
  if (method === 'PUT' && (m = u.pathname.match(/^\/v3\/subscriptions\/(\d+)\/cancel$/))) {
    const s = fake.subscriptions.get(Number(m[1]))
    if (!s) return json(404, { status: 'error', message: 'Subscription not found' })
    s.status = 'cancelled'
    return json(200, { status: 'success', message: 'Subscription cancelled', data: s })
  }
  if (method === 'POST' && u.pathname === '/v3/payment-plans') {
    const id = fake.nextPlan++
    const plan = { id, name: body.name, amount: body.amount, interval: body.interval, currency: body.currency, status: 'active' }
    fake.plans.set(id, plan)
    return json(200, { status: 'success', message: 'Payment plan created', data: plan })
  }
  return json(404, { status: 'error', message: `fake: no route ${method} ${u.pathname}` })
}

/** What happens on Flutterwave's side when the customer pays the hosted checkout. */
function customerPays(txId, { status = 'successful' } = {}) {
  const tx = fake.transactions.get(String(txId))
  tx.status = status
  if (status === 'successful' && tx.plan) {
    const id = fake.nextSub++
    fake.subscriptions.set(id, { id, amount: tx.amount, customer: { id: 1, customer_email: tx.customer.email }, plan: tx.plan, status: 'active', created_at: new Date().toISOString() })
  }
  return tx
}

function flwRenewal(email, { status = 'successful' } = {}) {
  const sub = [...fake.subscriptions.values()].find((s) => s.customer.customer_email === email && s.status === 'active')
  const id = String(fake.nextTx++)
  // Renewal charges carry a Flutterwave-generated tx_ref, not ours.
  const tx = { id: Number(id), tx_ref: `FLW-RENEW-${id}`, amount: sub.amount, currency: 'USD', status, customer: { email }, plan: sub.plan, processor_response: status === 'failed' ? 'Declined' : 'Approved' }
  fake.transactions.set(id, tx)
  return tx
}

const hook = (body, hash = SECRET_HASH) => t.api('POST', '/api/billing/webhook', { body, headers: hash ? { 'verif-hash': hash } : {} })
const sub = (token) => t.api('GET', '/api/billing/subscription', { token }).then((r) => r.data)

before(async () => {
  t = await startTestServer()
  const { FlutterwaveProvider } = await import('../services/billing/providers/flutterwaveProvider.js')
  const { _setBillingProvider } = await import('../services/billing/index.js')
  provider = new FlutterwaveProvider({ secretKey: 'FLWSECK_TEST-fake', secretHash: SECRET_HASH, baseUrl: 'https://api.flutterwave.test/v3', fetchImpl: fakeFetch })
  _setBillingProvider(provider)
  Plan = t.mongoose.model('Plan')
  Subscription = t.mongoose.model('Subscription')
})
after(async () => {
  await t.stop()
})

async function paidUser() {
  const u = await t.signup()
  await sub(u.token)
  await Subscription.updateOne({ user: u.user._id ?? u.user.id }, { $set: { trialUsed: true } })
  return u
}

test('checkout is refused for a paid plan with no Flutterwave payment plan', async () => {
  const u = await paidUser()
  const res = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'starter' } })
  assert.equal(res.status, 502)
  assert.equal(fake.calls.filter((c) => c.path === '/v3/payments').length, 0, 'no one-off charge was created')
  const plans = await t.api('GET', '/api/billing/plans')
  assert.equal(plans.data.plans.find((p) => p.slug === 'starter').recurringReady, false)
})

test('sync script creates monthly payment plans with matching amount and currency', async () => {
  const { syncPaymentPlans } = await import('../services/billing/syncPlans.js')
  const results = await syncPaymentPlans({ provider, log: () => {} })
  assert.ok(results.length >= 4)
  const created = fake.calls.filter((c) => c.path === '/v3/payment-plans')
  const starterCall = created.find((c) => c.body.amount === 5)
  assert.equal(starterCall.body.interval, 'monthly')
  assert.equal(starterCall.body.currency, 'USD')
  const starter = await Plan.findOne({ slug: 'starter' })
  assert.match(starter.providerPriceId, /^\d+$/)
  // Idempotent.
  const again = await syncPaymentPlans({ provider, log: () => {} })
  assert.ok(again.every((r) => r.status === 'exists'))
  const plans = await t.api('GET', '/api/billing/plans')
  assert.equal(plans.data.plans.find((p) => p.slug === 'starter').recurringReady, true)
})

test('checkout payload subscribes the card to the payment plan; webhook + verify activate it', async () => {
  const u = await paidUser()
  const res = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'starter' } })
  assert.equal(res.status, 200, JSON.stringify(res.data))
  assert.match(res.data.url, /^https:\/\/checkout\.flutterwave\.test\//)
  const call = fake.calls.filter((c) => c.path === '/v3/payments').at(-1)
  const starter = await Plan.findOne({ slug: 'starter' })
  assert.equal(call.body.payment_plan, Number(starter.providerPriceId))
  assert.equal(call.body.currency, 'USD')
  assert.equal(call.body.amount, '5.00')
  assert.equal(call.body.payment_options, 'card', 'payment plans are card-only')
  assert.equal(call.body.customer.email, u.email)
  assert.match(call.body.tx_ref, /^sp_/)

  const txId = res.data.url.split('/').at(-1)

  // Unauthenticated webhook (missing / wrong verif-hash) → 401, nothing applied.
  customerPays(txId)
  assert.equal((await hook({ event: 'charge.completed', data: { id: Number(txId), status: 'successful' } }, null)).status, 401)
  assert.equal((await hook({ event: 'charge.completed', data: { id: Number(txId), status: 'successful' } }, 'wrong')).status, 401)
  assert.equal((await sub(u.token)).plan.slug, 'free')

  // A webhook payload that LIES about the status is still re-verified.
  const pendingTx = (await t.api('POST', '/api/billing/checkout', { token: (await paidUser()).token, body: { planSlug: 'starter' } })).data.url.split('/').at(-1)
  const lie = await hook({ event: 'charge.completed', data: { id: Number(pendingTx), status: 'successful', amount: 5 } })
  assert.equal(lie.status, 200)
  assert.equal(lie.data.applied, false, 'pending at Flutterwave → not applied')

  const ok = await hook({ event: 'charge.completed', data: { id: Number(txId), status: 'successful' } })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.applied, true)
  assert.ok(fake.calls.some((c) => c.path === `/v3/transactions/${txId}/verify`))
  const subCall = fake.calls.find((c) => c.path === '/v3/subscriptions')
  assert.equal(subCall.query.email, u.email, 'documented `email` filter is used')
  assert.equal(subCall.query.status, 'active')

  const s = await sub(u.token)
  assert.equal(s.plan.slug, 'starter')
  assert.equal(s.subscription.provider, 'flutterwave')
  assert.equal(s.subscription.autoRenews, true)

  // Redirect-side verify of the same transaction is a no-op duplicate.
  const v = await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: txId } })
  assert.equal(v.data.duplicate, true)

  // Renewal with a Flutterwave-generated tx_ref is attributed by email/plan.
  const renewal = flwRenewal(u.email)
  const r = await hook({ event: 'charge.completed', data: { id: renewal.id } })
  assert.equal(r.data.applied, true)
  assert.equal(r.data.kind, 'renewal')

  // Cancel → PUT /subscriptions/:id/cancel at Flutterwave.
  const doc = await Subscription.findOne({ user: u.user._id ?? u.user.id })
  const cancel = await t.api('POST', '/api/billing/cancel', { token: u.token })
  assert.equal(cancel.status, 200)
  assert.ok(fake.calls.some((c) => c.method === 'PUT' && c.path === `/v3/subscriptions/${doc.providerSubscriptionId}/cancel`))
  assert.equal(fake.subscriptions.get(Number(doc.providerSubscriptionId)).status, 'cancelled')
  assert.equal((await sub(u.token)).subscription.cancelAtPeriodEnd, true)
})

test('provider outage: webhook returns 500 so Flutterwave retries; cancel refuses to fake success', async () => {
  const u = await paidUser()
  const res = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'creator' } })
  const txId = res.data.url.split('/').at(-1)
  customerPays(txId)

  fake.down = true
  try {
    const w = await hook({ event: 'charge.completed', data: { id: Number(txId) } })
    assert.equal(w.status, 500, 'transient failure → non-2xx → retried by Flutterwave')
  } finally {
    fake.down = false
  }
  const retry = await hook({ event: 'charge.completed', data: { id: Number(txId) } })
  assert.equal(retry.data.applied, true, 'retry after the outage applies it')

  fake.down = true
  try {
    const c = await t.api('POST', '/api/billing/cancel', { token: u.token })
    assert.equal(c.status, 502)
    assert.equal((await sub(u.token)).subscription.cancelAtPeriodEnd, false, 'nothing changed locally while renewals would continue')
  } finally {
    fake.down = false
  }
})

test('unknown transaction ids are a clean no-op (no access granted)', async () => {
  const u = await paidUser()
  const v = await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: '123456789' } })
  assert.equal(v.status, 200)
  assert.equal(v.data.applied, false)
  const w = await hook({ event: 'charge.completed', data: { id: 123456789 } })
  assert.equal(w.status, 200)
})

test('failed renewal from Flutterwave puts the subscription past_due', async () => {
  const u = await paidUser()
  const res = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'starter' } })
  const txId = res.data.url.split('/').at(-1)
  customerPays(txId)
  await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: txId } })
  const failed = flwRenewal(u.email, { status: 'failed' })
  const r = await hook({ event: 'charge.completed', data: { id: failed.id } })
  assert.equal(r.data.status, 'failed')
  const s = await sub(u.token)
  assert.equal(s.subscription.status, 'past_due')
  assert.equal(s.subscription.lastPaymentError, 'Declined')
})

test('reconcile job pulls missed renewals and remote cancellations', async () => {
  const u = await paidUser()
  const res = await t.api('POST', '/api/billing/checkout', { token: u.token, body: { planSlug: 'starter' } })
  const txId = res.data.url.split('/').at(-1)
  customerPays(txId)
  await t.api('POST', '/api/billing/verify', { token: u.token, body: { transactionId: txId } })
  // Renewal due in an hour (the job only looks at subscriptions near/past their period end).
  await Subscription.updateOne({ user: u.user._id ?? u.user.id }, { $set: { currentPeriodEnd: new Date(Date.now() + 60 * 60 * 1000) } })
  const before = (await sub(u.token)).subscription.currentPeriodEnd

  flwRenewal(u.email) // webhook never delivered
  const { reconcileSubscriptions } = await import('../services/billing/reconcile.js')
  await reconcileSubscriptions({ provider })
  const after = (await sub(u.token)).subscription.currentPeriodEnd
  assert.ok(new Date(after) > new Date(before), 'missed renewal applied by reconciliation')
  assert.ok(fake.calls.some((c) => c.path === '/v3/transactions' && /^\d{4}-\d{2}-\d{2}$/.test(c.query.from) && c.query.to), 'list uses required from/to dates')

  // Subscription cancelled at Flutterwave with no webhook received → noticed once the period is over.
  const doc = await Subscription.findOne({ user: u.user._id ?? u.user.id })
  fake.subscriptions.get(Number(doc.providerSubscriptionId)).status = 'cancelled'
  await Subscription.updateOne({ _id: doc._id }, { $set: { currentPeriodEnd: new Date(Date.now() - 60 * 1000) } })
  await reconcileSubscriptions({ provider })
  const s = await sub(u.token)
  assert.equal(s.subscription.status, 'canceled')
  assert.equal(s.hasAccess, false)
})
