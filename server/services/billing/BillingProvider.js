/**
 * BillingProvider — the contract every payment gateway must satisfy.
 * Nothing outside services/billing/ should know which gateway is active,
 * or anything about that gateway's specific request/response shapes.
 *
 * Shaped around Flutterwave's actual model rather than Stripe's:
 * Flutterwave has no persistent "customer" object and no self-service
 * billing portal, and payment success must always be re-confirmed via
 * verifyTransaction() — a webhook or redirect claiming success is never
 * sufficient on its own.
 */
export class BillingProvider {
  // eslint-disable-next-line no-unused-vars
  async createCustomer({ email, name }) {
    throw new Error('createCustomer() not implemented')
  }

  /**
   * Starts a checkout for a subscription plan.
   * @returns {Promise<{ url: string, txRef: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async createCheckoutSession({ email, name, plan, txRef, successUrl, cancelUrl }) {
    throw new Error('createCheckoutSession() not implemented')
  }

  /**
   * Authoritative, server-side confirmation of a transaction's outcome.
   * Must be called before granting any entitlement — a webhook payload or
   * a frontend redirect claiming success is never trusted on its own.
   * @returns {Promise<{ status: 'successful'|'failed'|'pending', amount: number, currency: string, txRef: string, customerEmail: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async verifyTransaction({ transactionId }) {
    throw new Error('verifyTransaction() not implemented')
  }

  /**
   * Cancels a recurring subscription at the gateway, if the gateway
   * supports per-subscription cancellation. Providers that can't cancel
   * remotely should still return { ok: true, remote: false } so the
   * caller can fall back to local-only cancellation.
   */
  // eslint-disable-next-line no-unused-vars
  async cancelSubscription({ subscriptionId }) {
    throw new Error('cancelSubscription() not implemented')
  }

  /**
   * Verifies an inbound webhook's authenticity and normalizes it to
   * { type, data }. Must throw if verification fails.
   */
  // eslint-disable-next-line no-unused-vars
  verifyAndParseWebhook({ body, headers }) {
    throw new Error('verifyAndParseWebhook() not implemented')
  }
}
