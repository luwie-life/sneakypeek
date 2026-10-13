import { AnthropicProvider } from './providers/anthropicProvider.js'

let cached = null

/**
 * Returns the configured AI provider. Swap providers by changing
 * AI_PROVIDER in the environment — no other file needs to know.
 */
export function getAIProvider() {
  if (cached) return cached

  const providerName = process.env.AI_PROVIDER || 'anthropic'

  switch (providerName) {
    case 'anthropic':
      cached = new AnthropicProvider()
      break
    default:
      throw new Error(`Unknown AI_PROVIDER: "${providerName}"`)
  }

  return cached
}
