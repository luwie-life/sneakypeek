import { BillingProvider } from '../BillingProvider.js'

const BASE_URL = 'https://api.flutterwave.com/v3'

export class FlutterwaveProvider extends BillingProvider {
  constructor({ secretKey, secretHash } = {}) {
    super()
    this.secretKey = secretKey || process.env.FLW_SECRET_KEY
    this.secretHash = secretHash || process.env.FLW_SECRET_HASH
    this.configured = Boolean(this.secretKey)
  }

  _assertConfigured() {
    if (!this.configured) {
      throw new Error('Billing provider is not configured. Set FLW_SECRET_KEY in server/.env')
    }
  }

  async _request(path, { method = 'GET', body } = {}) {
    this._assertConfigured()

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok || data.status === 'error') {
      throw new Error(`Flutterwave request failed: ${data.message || res.status}`)
    }

    return data
  }

  // Flutterwave has no persistent customer resource — email is the
  // durable identifier we key everything off of.
  async createCustomer({ email }) {
    return { customerId: email }
  }

  async createCheckoutSession({ email, name, plan, txRef, successUrl }) {
    const data = await this._request('/payments', {
      method: 'POST',
      body: {
        tx_ref: txRef,
        amount: (plan.monthlyPriceCents / 100).toFixed(2),
        currency: (plan.currency || 'usd').toUpperCase(),
        redirect_url: successUrl,
        customer: { email, name },
        payment_options: 'card',
        // Attaches this charge to a recurring Payment Plan on Flutterwave's
        // side, if one is configured for this plan. Without it, this is a
        // one-off charge — see providerPriceId note in Plan.js.
        payment_plan: plan.providerPriceId || undefined,
        customizations: {
          title: 'Sneaky Peek',
          description: `${plan.name} plan — monthly`,
        },
      },
    })

    return { url: data.data.link, txRef }
  }

  /**
   * The one call that actually matters for security: re-confirms a
   * transaction's outcome directly with Flutterwave, independent of
   * whatever a webhook payload or browser redirect claimed.
   */
  async verifyTransaction({ transactionId }) {
    const data = await this._request(`/transactions/${transactionId}/verify`)
    const tx = data.data

    return {
      status: tx.status === 'successful' ? 'successful' : tx.status === 'failed' ? 'failed' : 'pending',
      amount: tx.amount,
      currency: tx.currency,
      txRef: tx.tx_ref,
      customerEmail: tx.customer?.email,
      transactionId: tx.id,
    }
  }

  /**
   * Flutterwave auto-creates a Subscription record when a charge against a
   * Payment Plan succeeds, separate from the transaction itself. We look
   * it up by customer email since that's the identifier we have. This
   * endpoint's exact filtering behavior should be confirmed against live
   * Flutterwave docs/dashboard before relying on it in production — it is
   * not exercised by anything in this codebase's automated tests, since
   * doing so requires live credentials.
   */
  async findSubscriptionByEmail(email) {
    try {
      const data = await this._request(`/subscriptions?customer_email=${encodeURIComponent(email)}`)
      return data.data?.[0] || null
    } catch {
      return null
    }
  }

  async cancelSubscription({ subscriptionId }) {
    if (!subscriptionId) return { ok: true, remote: false }
    await this._request(`/subscriptions/${subscriptionId}/cancel`, { method: 'PUT' })
    return { ok: true, remote: true }
  }

  /**
   * Flutterwave signs webhooks with a static shared secret compared
   * verbatim against the "verif-hash" header — not an HMAC over the body,
   * so no raw-body byte-exactness is required the way Stripe needs it.
   * Per Flutterwave's own guidance, this header check alone is NOT
   * sufficient proof of payment — callers must always follow up with
   * verifyTransaction() before applying any state change.
   */
  verifyAndParseWebhook({ body, headers }) {
    if (!this.secretHash) {
      throw new Error('FLW_SECRET_HASH is not set — cannot verify webhook authenticity')
    }

    const receivedHash = headers['verif-hash']
    if (!receivedHash || receivedHash !== this.secretHash) {
      throw new Error('Webhook verif-hash did not match — possible spoofed request')
    }

    return { type: body.event, data: body.data }
  }

  /** Maps a Flutterwave transaction/subscription status to our own status enum. */
  static mapStatus(flwStatus) {
    switch (flwStatus) {
      case 'active':
        return 'active'
      case 'cancelled':
      case 'canceled':
        return 'canceled'
      case 'expired':
        return 'expired'
      default:
        return 'active'
    }
  }
}
