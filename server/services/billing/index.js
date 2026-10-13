import { FlutterwaveProvider } from './providers/flutterwaveProvider.js'
import { MockBillingProvider } from './providers/mockProvider.js'

let cached = null

/**
 * Swap gateways via BILLING_PROVIDER — no other file needs to know.
 * "mock" never touches a network and needs no credentials; use it for
 * local development or anywhere live Flutterwave keys aren't available.
 */
export function getBillingProvider() {
  if (cached) return cached

  const providerName = process.env.BILLING_PROVIDER || 'flutterwave'

  switch (providerName) {
    case 'flutterwave':
      cached = new FlutterwaveProvider()
      break
    case 'mock':
      cached = new MockBillingProvider()
      break
    default:
      throw new Error(`Unknown BILLING_PROVIDER: "${providerName}"`)
  }

  return cached
}

/** Lets tests reset the cached provider between runs. */
export function _resetBillingProviderCache() {
  cached = null
}
