import { AIProvider } from '../AIProvider.js'

function stripJsonFence(text) {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

export class AnthropicProvider extends AIProvider {
  constructor({ apiKey, model } = {}) {
    super()
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY
    this.model = model || process.env.AI_MODEL || 'claude-sonnet-4-5'

    if (!this.apiKey) {
      // Fail loudly at call time, not at boot — lets the rest of the app
      // run (and be developed against) before AI credentials are wired up.
      this.configured = false
    } else {
      this.configured = true
    }
  }

  async _request({ system, prompt, maxTokens = 1500 }) {
    if (!this.configured) {
      throw new Error(
        'AI provider is not configured. Set ANTHROPIC_API_KEY in server/.env'
      )
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`AI request failed (${res.status}): ${body.slice(0, 300)}`)
    }

    const data = await res.json()
    const text = data.content
      ?.map((block) => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n')

    if (!text) {
      throw new Error('AI response contained no text content')
    }

    return text
  }

  async complete({ system, prompt, maxTokens }) {
    return this._request({ system, prompt, maxTokens })
  }

  async completeJSON({ system, prompt, maxTokens }) {
    const jsonSystem = `${system}\n\nRespond with ONLY valid JSON. No markdown fences, no preamble, no explanation — the entire response must be parseable with JSON.parse().`
    const raw = await this._request({ system: jsonSystem, prompt, maxTokens })
    const cleaned = stripJsonFence(raw)

    try {
      return JSON.parse(cleaned)
    } catch (err) {
      throw new Error(`AI did not return valid JSON: ${err.message}`)
    }
  }
}
