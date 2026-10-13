import { BillingProvider } from '../BillingProvider.js'

/**
 * Simulates a gateway entirely in memory. Never contacts a real network.
 * Select it with BILLING_PROVIDER=mock. Useful for local development and
 * for exercising checkout → verify → webhook flows in tests without live
 * Flutterwave credentials.
 *
 * `createCheckoutSession` returns a URL to this app's own mock checkout
 * page (a simple confirm/cancel screen) rather than a real gateway page.
 */
export class MockBillingProvider extends BillingProvider {
  constructor() {
    super()
    this.configured = true
    // In-memory only — resets on every server restart, which is fine for
    // a development aid.
    this.transactions = new Map()
    this.nextId = 1
  }

  async createCustomer({ email }) {
    return { customerId: email }
  }

  async createCheckoutSession({ email, plan, txRef, successUrl }) {
    const transactionId = String(this.nextId++)
    this.transactions.set(transactionId, {
      id: transactionId,
      status: 'successful', // the mock always "succeeds" — this is a dev aid, not a test of gateway failure modes
      amount: plan.monthlyPriceCents / 100,
      currency: plan.currency || 'usd',
      txRef,
      customerEmail: email,
    })

    const appUrl = process.env.APP_URL || 'http://localhost:5173'
    const url = `${appUrl}/dashboard/billing?status=successful&tx_ref=${encodeURIComponent(txRef)}&transaction_id=${transactionId}`
    return { url, txRef }
  }

  async verifyTransaction({ transactionId }) {
    const tx = this.transactions.get(String(transactionId))
    if (!tx) return { status: 'failed', txRef: null }
    return {
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      txRef: tx.txRef,
      customerEmail: tx.customerEmail,
      transactionId: tx.id,
    }
  }

  async cancelSubscription() {
    return { ok: true, remote: false }
  }

  verifyAndParseWebhook({ body }) {
    // No signature to check — this provider never receives real inbound
    // webhooks. Present for interface parity and for directly unit-testing
    // the event-application logic against a hand-built payload.
    return { type: body.event, data: body.data }
  }
}
