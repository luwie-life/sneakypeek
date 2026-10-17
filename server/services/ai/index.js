import { AnthropicProvider } from './providers/anthropicProvider.js'
import { MockAIProvider } from './providers/mockProvider.js'

let cached = null

/**
 * Returns the configured AI provider. Swap providers by changing
 * AI_PROVIDER in the environment — no other file needs to know.
 * "mock" is deterministic and offline (tests / local dev without a key).
 */
export function getAIProvider() {
  if (cached) return cached

  const providerName = process.env.AI_PROVIDER || 'anthropic'

  switch (providerName) {
    case 'anthropic':
      cached = new AnthropicProvider()
      break
    case 'mock':
      cached = new MockAIProvider()
      break
    default:
      throw new Error(`Unknown AI_PROVIDER: "${providerName}"`)
  }

  return cached
}

export function _setAIProvider(provider) {
  cached = provider
}
