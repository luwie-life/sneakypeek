import { BillingProvider } from '../BillingProvider.js'

/**
 * Simulates Flutterwave Payment Plans entirely in memory. Never contacts a
 * network. Select with BILLING_PROVIDER=mock (refused in production unless
 * ALLOW_MOCK_BILLING=true — see config/env.js).
 *
 * Mirrors the real provider's shapes so the lifecycle code under test is
 * exactly the code that runs against Flutterwave: an initial charge with
 * our tx_ref creates a "remote" subscription for the email; renewals are
 * separate transactions with a provider-generated tx_ref.
 *
 * simulateRenewal / simulateRemoteCancel are dev & test aids used to drive
 * renewal, failed-renewal and provider-cancel scenarios.
 */
export class MockBillingProvider extends BillingProvider {
  constructor() {
    super()
    this.name = 'mock'
    this.configured = true
    this.transactions = new Map()
    this.subscriptions = new Map() // id -> { id, email, plan, status }
    this.nextId = 1
    this.nextSubId = 1
  }

  async createCustomer({ email }) {
    return { customerId: email }
  }

  _addTx(fields) {
    const id = String(this.nextId++)
    const tx = { id, ...fields }
    this.transactions.set(id, tx)
    return tx
  }

  async createCheckoutSession({ email, plan, txRef, successUrl }) {
    const tx = this._addTx({
      status: 'successful',
      amount: plan.monthlyPriceCents / 100,
      currency: plan.currency || 'usd',
      txRef,
      customerEmail: email.toLowerCase(),
      planId: plan.providerPriceId || `mock-${plan.slug}`,
    })
    // Like Flutterwave, a successful payment-plan charge creates a subscription.
    const sub = { id: String(this.nextSubId++), email: email.toLowerCase(), plan: tx.planId, status: 'active', amount: tx.amount, currency: tx.currency }
    this.subscriptions.set(sub.id, sub)

    const base = successUrl || `${process.env.APP_URL || 'http://localhost:5173'}/dashboard/billing`
    const url = `${base}?status=successful&tx_ref=${encodeURIComponent(txRef)}&transaction_id=${tx.id}`
    return { url, txRef }
  }

  /** Test/dev aid: Flutterwave charging the card for the next cycle. */
  simulateRenewal({ email, success = true, processorResponse }) {
    const sub = [...this.subscriptions.values()].find((s) => s.email === email.toLowerCase() && s.status === 'active')
    if (!sub) throw new Error('No active mock subscription for that email')
    return this._addTx({
      status: success ? 'successful' : 'failed',
      amount: sub.amount,
      currency: sub.currency,
      txRef: `flw-renewal-${this.nextId}`,
      customerEmail: sub.email,
      planId: sub.plan,
      processorResponse: processorResponse || (success ? 'Approved' : 'Insufficient funds'),
    })
  }

  /** Test/dev aid: subscription cancelled on the provider side. */
  simulateRemoteCancel(email) {
    for (const s of this.subscriptions.values()) if (s.email === email.toLowerCase()) s.status = 'cancelled'
  }

  /** Test aid: arbitrary transaction (e.g. a tampered amount). */
  addTransaction(fields) {
    return this._addTx(fields)
  }

  async verifyTransaction({ transactionId }) {
    const tx = this.transactions.get(String(transactionId))
    if (!tx) return { status: 'failed', transactionId: null }
    return {
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      txRef: tx.txRef,
      customerEmail: tx.customerEmail,
      transactionId: tx.id,
      planId: tx.planId || null,
      processorResponse: tx.processorResponse || null,
    }
  }

  async listTransactions({ email, status }) {
    return [...this.transactions.values()]
      .filter((t) => (!email || t.customerEmail === email.toLowerCase()) && (!status || t.status === status))
      .map((t) => ({ id: t.id, status: t.status, txRef: t.txRef, amount: t.amount, currency: t.currency }))
  }

  async findSubscription({ email, planId, status } = {}) {
    const match = [...this.subscriptions.values()].find(
      (s) => s.email === String(email).toLowerCase() && (!planId || s.plan === planId) && (!status || s.status === status)
    )
    return match ? { id: match.id, status: match.status, plan: match.plan } : null
  }

  async findSubscriptionByEmail(email) {
    return this.findSubscription({ email })
  }

  async cancelSubscription({ subscriptionId }) {
    const sub = this.subscriptions.get(String(subscriptionId))
    if (!sub) return { ok: true, remote: false }
    sub.status = 'cancelled'
    return { ok: true, remote: true }
  }

  async createPaymentPlan({ name }) {
    return { id: `mock-${name}` }
  }

  verifyAndParseWebhook({ body, headers }) {
    // Optional shared secret so a dev deployment of the mock can still
    // reject random posts.
    const secret = process.env.MOCK_WEBHOOK_SECRET
    if (secret && headers['verif-hash'] !== secret) throw new Error('Mock webhook secret mismatch')
    return { type: body?.event, data: body?.data || {} }
  }
}
