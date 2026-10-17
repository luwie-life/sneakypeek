import crypto from 'crypto'
import { BillingProvider } from '../BillingProvider.js'

const DEFAULT_BASE_URL = 'https://api.flutterwave.com/v3'

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Flutterwave v3, using Payment Plans for recurring billing.
 *
 * Endpoints used (all documented at developer.flutterwave.com, v3):
 *   POST /payments                       Standard checkout; `payment_plan` subscribes the card
 *   GET  /transactions/{id}/verify       authoritative transaction status
 *   GET  /transactions                   list (from, to, customer_email, status) — reconcile
 *   POST /payment-plans                  create a monthly plan (scripts/syncPaymentPlans.js)
 *   GET  /subscriptions                  filter by email, plan, status (active|cancelled)
 *   PUT  /subscriptions/{id}/cancel      stop future renewals
 *
 * Constraints (from the Payment Plans docs): plans work with CARD payments
 * only; the charge currency must match the plan currency; Flutterwave
 * retries a failed renewal and cancels after three consecutive failures.
 * Webhooks are authenticated with the static `verif-hash` header and must
 * always be followed by verifyTransaction().
 */
export class FlutterwaveProvider extends BillingProvider {
  constructor({ secretKey, secretHash, baseUrl, fetchImpl } = {}) {
    super()
    this.name = 'flutterwave'
    this.secretKey = secretKey || process.env.FLW_SECRET_KEY
    this.secretHash = secretHash || process.env.FLW_SECRET_HASH
    this.baseUrl = baseUrl || process.env.FLW_BASE_URL || DEFAULT_BASE_URL
    this.fetch = fetchImpl || fetch
    this.configured = Boolean(this.secretKey)
  }

  _assertConfigured() {
    if (!this.configured) {
      throw new Error('Billing provider is not configured. Set FLW_SECRET_KEY in server/.env')
    }
  }

  async _request(path, { method = 'GET', body, query } = {}) {
    this._assertConfigured()
    const qs = query
      ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
      : ''

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    let res
    try {
      res = await this.fetch(`${this.baseUrl}${path}${qs}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const data = await res.json().catch(() => ({}))

    if (!res.ok || data.status === 'error') {
      const err = new Error(`Flutterwave request failed: ${data.message || res.status}`)
      err.httpStatus = res.status
      throw err
    }

    return data
  }

  // Flutterwave has no persistent customer resource — email is the
  // durable identifier (subscriptions are tied to it and can't change).
  async createCustomer({ email }) {
    return { customerId: email }
  }

  async createCheckoutSession({ email, name, plan, txRef, successUrl }) {
    if (!plan.providerPriceId) {
      // Without a payment plan this would be a one-off charge that never
      // renews. Refuse rather than silently selling a "monthly" plan that
      // stops after one month.
      throw new Error(`Plan "${plan.slug}" has no Flutterwave payment plan configured (run npm run billing:sync-plans)`)
    }
    const data = await this._request('/payments', {
      method: 'POST',
      body: {
        tx_ref: txRef,
        amount: (plan.monthlyPriceCents / 100).toFixed(2),
        currency: (plan.currency || 'usd').toUpperCase(),
        redirect_url: successUrl,
        customer: { email, name },
        payment_options: 'card',
        payment_plan: Number.isNaN(Number(plan.providerPriceId)) ? plan.providerPriceId : Number(plan.providerPriceId),
        customizations: {
          title: 'Sneaky Peek',
          description: `${plan.name} plan — billed monthly until cancelled`,
        },
      },
    })

    return { url: data.data.link, txRef }
  }

  /**
   * The one call that matters for security: re-confirms a transaction's
   * outcome directly with Flutterwave, independent of whatever a webhook
   * payload or browser redirect claimed.
   */
  async verifyTransaction({ transactionId }) {
    let data
    try {
      data = await this._request(`/transactions/${encodeURIComponent(transactionId)}/verify`)
    } catch (err) {
      // A transaction id Flutterwave doesn't know is a permanent "no".
      if (err.httpStatus === 400 || err.httpStatus === 404) return { status: 'failed', transactionId: null }
      throw err
    }
    const tx = data.data || {}
    return {
      status: tx.status === 'successful' ? 'successful' : tx.status === 'failed' ? 'failed' : 'pending',
      amount: Number(tx.amount),
      currency: tx.currency,
      txRef: tx.tx_ref,
      customerEmail: tx.customer?.email,
      transactionId: tx.id,
      planId: tx.plan ?? tx.payment_plan ?? null,
      processorResponse: tx.processor_response || null,
      paymentType: tx.payment_type || null,
    }
  }

  /** Lists transactions for reconciliation (dates as YYYY-MM-DD). */
  async listTransactions({ email, from, to, status }) {
    const data = await this._request('/transactions', {
      query: { customer_email: email, from, to, status },
    })
    return (data.data || []).map((tx) => ({ id: tx.id, status: tx.status, txRef: tx.tx_ref, amount: tx.amount, currency: tx.currency }))
  }

  /**
   * Finds the subscriber's subscription (optionally for one plan / status).
   * Returns null when none exists; THROWS on network/API errors so callers
   * can tell "no subscription" from "couldn't check".
   */
  async findSubscription({ email, planId, status } = {}) {
    if (!email) return null
    const data = await this._request('/subscriptions', { query: { email, plan: planId, status } })
    const items = Array.isArray(data.data) ? data.data : []
    const match = items.find((s) => !status || String(s.status).toLowerCase() === status) || null
    return match ? { id: match.id, status: match.status, plan: match.plan } : null
  }

  // Back-compat with the previous helper name.
  async findSubscriptionByEmail(email) {
    return this.findSubscription({ email }).catch(() => null)
  }

  async cancelSubscription({ subscriptionId }) {
    if (!subscriptionId) return { ok: true, remote: false }
    await this._request(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { method: 'PUT' })
    return { ok: true, remote: true }
  }

  async createPaymentPlan({ name, amount, currency, interval = 'monthly' }) {
    const data = await this._request('/payment-plans', {
      method: 'POST',
      body: { name, amount, currency: currency.toUpperCase(), interval },
    })
    return { id: data.data?.id, raw: data.data }
  }

  /**
   * Flutterwave sends the secret hash configured in the dashboard verbatim
   * in the `verif-hash` header (not an HMAC). Compared in constant time.
   * Per Flutterwave's guidance, this alone is NOT proof of payment —
   * callers must still call verifyTransaction() before applying anything.
   */
  verifyAndParseWebhook({ body, headers }) {
    if (!this.secretHash) {
      throw new Error('FLW_SECRET_HASH is not set — cannot verify webhook authenticity')
    }
    const receivedHash = headers['verif-hash']
    if (!safeEqual(receivedHash, this.secretHash)) {
      throw new Error('Webhook verif-hash did not match — possible spoofed request')
    }
    if (!body || typeof body !== 'object') throw new Error('Webhook body is not JSON')
    return { type: body.event || body.type, data: body.data || {} }
  }
}
