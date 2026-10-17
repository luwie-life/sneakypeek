/**
 * AIProvider — the contract every AI backend must satisfy.
 *
 * Swapping providers (Anthropic, OpenAI, a local model, ...) should never
 * require touching generateExperience.js, sectionActions.js, or any route.
 * Only providers/index.js needs to change.
 */
export class AIProvider {
  /**
   * Ask the model for a response and get raw text back.
   * @returns {Promise<string>}
   */
  // eslint-disable-next-line no-unused-vars
  async complete({ system, prompt, maxTokens }) {
    throw new Error('complete() not implemented by this provider')
  }

  /**
   * Ask the model for a response and get it back as parsed JSON.
   * @returns {Promise<any>} parsed JSON
   */
  // eslint-disable-next-line no-unused-vars
  async completeJSON({ system, prompt, maxTokens }) {
    throw new Error('completeJSON() not implemented by this provider')
  }

  /**
   * Schema-constrained output. Providers that support it (Anthropic tool
   * use) constrain the model to `schema`; the default falls back to
   * completeJSON. Callers must STILL validate the result — a schema is a
   * strong hint to the model, not a guarantee.
   * @param {{ system: string, prompt: string, schema: object, schemaName: string, maxTokens?: number }} params
   */
  async completeStructured({ system, prompt, maxTokens }) {
    return this.completeJSON({ system, prompt, maxTokens })
  }
}
